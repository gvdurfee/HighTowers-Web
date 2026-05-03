import { useEffect, useMemo, useState } from 'react'
import { db } from '@/db/schema'
import type { MissionRecord, WaypointRecord } from '@/db/schema'
import { bytesToText, textFileBytes, unzipEntries, zipEntries } from '@/utils/zip'
import {
  parseForeFlightUserWaypointsCsv,
  stringifyForeFlightUserWaypointsCsv,
} from '@/utils/foreflightUserWaypointsCsv'
import {
  appendTowerAsWaypointRow,
  existingWaypointCoords,
  existingWaypointNames,
  inferUserWaypointsColumns,
  metersBetween,
  nextWaypointName,
  primaryRouteNumberFromWaypoints,
  type LatLon,
} from '@/utils/contentPackWaypoints'

type Props = {
  selectedMission: MissionRecord
}

type Preview = {
  plannedAdditions: { name: string; lat: number; lon: number }[]
  skippedAsDuplicate: number
  routeNumber: string | null
  csvPath: string | null
}

type FolderWriteTarget = {
  handle: FileSystemFileHandle
  csvText: string
  csvRelPath: string
}

const CSV_CANDIDATES = ['navdata/user_waypoints.csv', 'NavData/user_waypoints.csv', 'user_waypoints.csv']

function isChromeLike(): boolean {
  const ua = navigator.userAgent
  const isChromium = /\bChrome\/|\bEdg\//.test(ua)
  const isSafari = /\bSafari\//.test(ua) && !isChromium
  return isChromium && !isSafari
}

function supportsDirectoryPicker(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}

async function findFileInDir(
  dir: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.split('/').filter(Boolean)
  let cur: FileSystemDirectoryHandle = dir
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const isLast = i === parts.length - 1
    try {
      if (isLast) {
        return await cur.getFileHandle(p)
      }
      cur = await cur.getDirectoryHandle(p)
    } catch {
      return null
    }
  }
  return null
}

async function readTextFromFileHandle(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return await file.text()
}

async function writeTextToFileHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

export function ContentPackUpdater({ selectedMission }: Props) {
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [folderWriteTarget, setFolderWriteTarget] = useState<FolderWriteTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [folderModeAvailable, setFolderModeAvailable] = useState(false)

  useEffect(() => {
    setFolderModeAvailable(supportsDirectoryPicker() && isChromeLike())
  }, [])

  const helperText = useMemo(() => {
    if (folderModeAvailable) return null
    return 'To update a Content Pack in-place (overwrite the CSV in the same folder), use Chrome or Edge on a Mac/Windows computer. Safari/iPad can still use the ZIP download workflow.'
  }, [folderModeAvailable])

  async function loadMissionTowerCoords(): Promise<LatLon[]> {
    const reports = await db.towerReports
      .where('missionId')
      .equals(selectedMission.id)
      .sortBy('reportDate')
    const locations = await Promise.all(reports.map((r) => db.towerLocations.get(r.towerLocationId)))
    const coords: LatLon[] = []
    for (const loc of locations) {
      if (!loc) continue
      coords.push({ lat: loc.latitude, lon: loc.longitude })
    }
    return coords
  }

  async function loadMissionWaypoints(): Promise<WaypointRecord[]> {
    if (!selectedMission.flightPlanId) return []
    return await db.waypoints
      .where('flightPlanId')
      .equals(selectedMission.flightPlanId)
      .sortBy('sequence')
  }

  async function computePreviewFromCsv(csvText: string, csvPath: string): Promise<Preview> {
    const doc = parseForeFlightUserWaypointsCsv(csvText)
    const cols = inferUserWaypointsColumns(doc)
    const existingNames = existingWaypointNames(doc, cols)
    const workingCoords = [...existingWaypointCoords(doc, cols)]

    const towers = await loadMissionTowerCoords()
    const wps = await loadMissionWaypoints()
    const routeNumber = primaryRouteNumberFromWaypoints(wps)

    const namesForNext = [...existingNames]
    let skippedAsDuplicate = 0
    const plannedAdditions: { name: string; lat: number; lon: number }[] = []
    const coordThresholdM = 30

    for (const t of towers) {
      const duplicateByCoord = workingCoords.some((c) => metersBetween(c, t) <= coordThresholdM)
      if (duplicateByCoord) {
        skippedAsDuplicate++
        continue
      }
      if (!routeNumber) {
        plannedAdditions.push({
          name: '(attach a flight plan to this mission)',
          lat: t.lat,
          lon: t.lon,
        })
        continue
      }
      const candidate = nextWaypointName(routeNumber, namesForNext)
      namesForNext.push(candidate)
      plannedAdditions.push({ name: candidate, lat: t.lat, lon: t.lon })
      workingCoords.push(t)
    }

    return { plannedAdditions, skippedAsDuplicate, routeNumber, csvPath }
  }

  async function updateCsvText(csvText: string, planned: Preview): Promise<string> {
    const doc = parseForeFlightUserWaypointsCsv(csvText)
    const cols = inferUserWaypointsColumns(doc)
    for (const p of planned.plannedAdditions) {
      if (p.name.startsWith('(')) continue
      appendTowerAsWaypointRow(doc, cols, p.name, { lat: p.lat, lon: p.lon })
    }
    return stringifyForeFlightUserWaypointsCsv(doc)
  }

  function previewHasPlaceholders(p: Preview): boolean {
    return p.plannedAdditions.some((x) => x.name.startsWith('('))
  }

  async function handleZipPreview(file: File): Promise<void> {
    setBusy(true)
    setErr(null)
    setPreview(null)
    setFolderWriteTarget(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const entries = unzipEntries(bytes)
      const csvPath =
        CSV_CANDIDATES.find((p) => entries.has(p)) ??
        [...entries.keys()].find((k) => k.toLowerCase().endsWith('user_waypoints.csv')) ??
        null
      if (!csvPath) throw new Error('Could not find user_waypoints.csv in this zip.')
      const csvText = bytesToText(entries.get(csvPath)!)
      const p = await computePreviewFromCsv(csvText, csvPath)
      setPreview(p)
      setZipFile(file)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to read Content Pack zip')
    } finally {
      setBusy(false)
    }
  }

  async function handleZipApply(): Promise<void> {
    if (!zipFile || !preview) return
    if (preview.plannedAdditions.length === 0) {
      setErr('No new tower findings to add for this mission.')
      return
    }
    if (!preview.routeNumber || previewHasPlaceholders(preview)) {
      setErr('Attach a flight plan to this mission so waypoint names can use the correct route number.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const bytes = new Uint8Array(await zipFile.arrayBuffer())
      const entries = unzipEntries(bytes)
      const csvPath = preview.csvPath
      if (!csvPath || !entries.has(csvPath)) throw new Error('Missing user_waypoints.csv in zip.')
      const csvText = bytesToText(entries.get(csvPath)!)
      const updated = await updateCsvText(csvText, preview)
      entries.set(csvPath, textFileBytes(updated))
      const outZip = zipEntries(entries)
      const outName =
        zipFile.name.replace(/\.zip$/i, '') + `_UPDATED_${new Date().toISOString().slice(0, 10)}.zip`
      const blob = new Blob([outZip as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = outName
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to write updated zip')
    } finally {
      setBusy(false)
    }
  }

  async function handleFolderSelect(): Promise<void> {
    setBusy(true)
    setErr(null)
    setPreview(null)
    setFolderWriteTarget(null)
    setZipFile(null)
    try {
      if (!supportsDirectoryPicker()) throw new Error('Folder picker not supported in this browser.')
      const dir = await window.showDirectoryPicker!({ mode: 'readwrite' })

      let csvHandle: FileSystemFileHandle | null = null
      let csvPath: string | null = null
      for (const p of CSV_CANDIDATES) {
        const h = await findFileInDir(dir, p)
        if (h) {
          csvHandle = h
          csvPath = p
          break
        }
      }
      if (!csvHandle) {
        throw new Error('Could not find navdata/user_waypoints.csv in the selected folder.')
      }
      const csvText = await readTextFromFileHandle(csvHandle)
      const p = await computePreviewFromCsv(csvText, csvPath ?? 'navdata/user_waypoints.csv')
      setPreview(p)
      setFolderWriteTarget({ handle: csvHandle, csvText, csvRelPath: csvPath ?? 'navdata/user_waypoints.csv' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to read Content Pack folder')
    } finally {
      setBusy(false)
    }
  }

  async function handleFolderOverwrite(): Promise<void> {
    if (!folderWriteTarget || !preview) return
    if (preview.plannedAdditions.length === 0) {
      setErr('No new tower findings to add for this mission.')
      return
    }
    if (!preview.routeNumber || previewHasPlaceholders(preview)) {
      setErr('Attach a flight plan to this mission so waypoint names can use the correct route number.')
      return
    }
    const ok = window.confirm(
      `Overwrite ${folderWriteTarget.csvRelPath} in the selected Content Pack folder?\n\n` +
        `This will add ${preview.plannedAdditions.filter((x) => !x.name.startsWith('(')).length} waypoint row(s).`
    )
    if (!ok) return

    setBusy(true)
    setErr(null)
    try {
      const updated = await updateCsvText(folderWriteTarget.csvText, preview)
      await writeTextToFileHandle(folderWriteTarget.handle, updated)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to write updated CSV')
    } finally {
      setBusy(false)
    }
  }

  const zipReady =
    !!zipFile &&
    !!preview &&
    !!preview.routeNumber &&
    !previewHasPlaceholders(preview) &&
    preview.plannedAdditions.length > 0

  const folderReady =
    !!folderWriteTarget &&
    !!preview &&
    !!preview.routeNumber &&
    !previewHasPlaceholders(preview) &&
    preview.plannedAdditions.length > 0

  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-white">
      <p className="text-sm text-gray-600 mb-4">
        Append this mission’s <strong>new tower findings</strong> to{' '}
        <code className="bg-gray-100 px-1 rounded text-xs">navdata/user_waypoints.csv</code> inside the pack.
        Unzip the downloaded file and replace your pack folder, or import the ZIP in ForeFlight per your
        usual workflow.
      </p>

      {helperText && (
        <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {helperText}
        </p>
      )}

      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-gray-900 mb-2">1) Upload Content Pack (.zip)</p>
          <p className="text-xs text-gray-600 mb-2">
            Choose your existing pack ZIP, review the preview, then download an updated ZIP with new tower
            waypoints for next year.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                if (!f) return
                void handleZipPreview(f)
              }}
            />
            <button
              type="button"
              onClick={() => void handleZipApply()}
              disabled={busy || !zipReady}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Download updated Content Pack (.zip)'}
            </button>
          </div>
        </div>

        {folderModeAvailable && (
          <div>
            <p className="text-sm font-medium text-gray-900 mb-2">Optional: update folder in place (Chrome / Edge)</p>
            <p className="text-xs text-gray-600 mb-2">
              Select the Content Pack folder on disk, preview changes, then overwrite{' '}
              <code className="bg-gray-100 px-0.5 rounded text-[11px]">navdata/user_waypoints.csv</code>{' '}
              after confirming.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => void handleFolderSelect()}
                disabled={busy}
                className="px-4 py-2 border border-cap-ultramarine text-cap-ultramarine rounded-lg font-medium hover:bg-cap-ultramarine/5 disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Select Content Pack folder (preview)'}
              </button>
              <button
                type="button"
                onClick={() => void handleFolderOverwrite()}
                disabled={busy || !folderReady}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Overwrite CSV in that folder
              </button>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-4 text-sm text-gray-700">
          <p className="font-medium text-gray-900 mb-1">Preview</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              Route number for naming: <strong>{preview.routeNumber ?? '—'}</strong>
            </li>
            <li>
              New waypoints to add:{' '}
              <strong>{preview.plannedAdditions.filter((x) => !x.name.startsWith('(')).length}</strong>
              {preview.skippedAsDuplicate > 0 && (
                <span className="text-gray-600">
                  {' '}
                  (skipped {preview.skippedAsDuplicate} duplicate(s) by location)
                </span>
              )}
            </li>
            {previewHasPlaceholders(preview) && (
              <li className="text-cap-pimento font-medium">
                Attach a flight plan to this mission (with waypoints) before exporting waypoint names.
              </li>
            )}
          </ul>
        </div>
      )}

      {err && <div className="mt-4 p-3 bg-red-50 text-cap-pimento rounded-lg text-sm">{err}</div>}
    </div>
  )
}
