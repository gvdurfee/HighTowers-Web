import { useCallback, useEffect, useState } from 'react'
import { db } from '@/db/schema'
import type { MissionRecord, WaypointRecord } from '@/db/schema'
import { repackContentPackReplaceFile } from '@/utils/contentPackZip'
import {
  applyAllMissionTowersToUserWaypointsCsvText,
  type CumulativeTowerApplyItem,
} from '@/utils/applyTowerToUserWaypointsCsv'
import { primaryRouteNumberFromWaypoints } from '@/utils/contentPackWaypoints'
import { loadUserWaypointsCsvFromZipFile } from '@/utils/userWaypointsZipDiscovery'
import {
  mergeContentPackApplyMissionNotes,
  persistableMissionNotes,
} from '@/utils/contentPackMissionNotes'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

const LOCAL_ZIP_SESSION_KEY_PREFIX = 'contentPack.localZipName.'

function localZipSessionKey(missionId: string): string {
  return `${LOCAL_ZIP_SESSION_KEY_PREFIX}${missionId}`
}

function rememberLocalZipFileName(missionId: string, name: string): void {
  try {
    sessionStorage.setItem(localZipSessionKey(missionId), name)
  } catch {
    /* ignore */
  }
}

function recalledLocalZipFileName(missionId: string): string | null {
  try {
    return sessionStorage.getItem(localZipSessionKey(missionId))
  } catch {
    return null
  }
}

type Preview = {
  pendingCsvText: string
  applyItems: CumulativeTowerApplyItem[]
  observationNumbers: number[]
  appendedCount: number
  refinedCount: number
  unchangedCount: number
  blockedCount: number
  routeNumber: string | null
  csvPath: string | null
}

type Props = {
  selectedMission: MissionRecord
}

/**
 * Mission close-out: upload the ForeFlight content pack ZIP used on the mission,
 * preview tower coordinate refinements (≤30 m) and new waypoint appends, then
 * download an updated ZIP for Wing distribution (browser-only; nothing uploaded).
 */
export function ContentPackMissionCloseout({ selectedMission }: Props) {
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [packNotesMessage, setPackNotesMessage] = useState<string | null>(null)
  const [missionRouteNumber, setMissionRouteNumber] = useState<string | null>(null)
  const [reportedTowerCount, setReportedTowerCount] = useState(0)
  const { isSeen, markSeen } = useHintsSeen()

  const loadMissionTowersForPack = useCallback(async (): Promise<{
    towers: { lat: number; lon: number; groundElevationFt?: number }[]
    observationNumbers: number[]
  }> => {
    const reports = await db.towerReports
      .where('missionId')
      .equals(selectedMission.id)
      .sortBy('reportDate')
    const locations = await Promise.all(reports.map((r) => db.towerLocations.get(r.towerLocationId)))
    const towers: { lat: number; lon: number; groundElevationFt?: number }[] = []
    const observationNumbers: number[] = []
    for (let i = 0; i < reports.length; i++) {
      const r = reports[i]
      const loc = locations[i]
      if (!loc) continue
      if (!r.annotatedImageDataUrl?.trim()) continue
      towers.push({
        lat: loc.latitude,
        lon: loc.longitude,
        groundElevationFt: Number.isFinite(loc.elevation) ? loc.elevation : undefined,
      })
      observationNumbers.push(i + 1)
    }
    return { towers, observationNumbers }
  }, [selectedMission.id])

  const loadMissionWaypoints = useCallback(async (): Promise<WaypointRecord[]> => {
    if (!selectedMission.flightPlanId) return []
    return await db.waypoints
      .where('flightPlanId')
      .equals(selectedMission.flightPlanId)
      .sortBy('sequence')
  }, [selectedMission.flightPlanId])

  /** Only clear pack workflow when the user picks a different mission (not when mission notes refresh). */
  useEffect(() => {
    setZipFile(null)
    setPreview(null)
    setErr(null)
    setPackNotesMessage(null)
  }, [selectedMission.id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const wps = await loadMissionWaypoints()
      const { towers } = await loadMissionTowersForPack()
      if (cancelled) return
      setMissionRouteNumber(primaryRouteNumberFromWaypoints(wps))
      setReportedTowerCount(towers.length)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedMission.id, loadMissionWaypoints, loadMissionTowersForPack])

  async function computePreviewFromCsv(csvText: string, csvPath: string): Promise<Preview> {
    const { towers, observationNumbers } = await loadMissionTowersForPack()
    const wps = await loadMissionWaypoints()
    const routeNumber = primaryRouteNumberFromWaypoints(wps)
    const cum = applyAllMissionTowersToUserWaypointsCsvText({
      csvText,
      towers,
      routeNumber,
    })
    if (!cum.ok) {
      throw new Error(cum.message)
    }
    return {
      pendingCsvText: cum.pendingCsvText,
      applyItems: cum.items,
      observationNumbers,
      appendedCount: cum.appendedCount,
      refinedCount: cum.refinedCount,
      unchangedCount: cum.unchangedCount,
      blockedCount: cum.blockedCount,
      routeNumber,
      csvPath,
    }
  }

  function packPreviewHasChanges(p: Preview): boolean {
    return p.refinedCount + p.appendedCount > 0
  }

  function packPreviewIsDownloadable(p: Preview): boolean {
    if (p.blockedCount > 0) return false
    if (!packPreviewHasChanges(p)) return false
    if (p.appendedCount > 0 && !p.routeNumber) return false
    return true
  }

  async function mergeRefinementNotesIntoMission(p: Preview): Promise<void> {
    const obsByOutcome = (target: 'updated' | 'unchanged' | 'appended'): number[] =>
      p.applyItems
        .map((it, idx) => (it.outcome === target ? p.observationNumbers[idx]! : null))
        .filter((x): x is number => x !== null)

    const missionRow = await db.missions.get(selectedMission.id)
    const merged = mergeContentPackApplyMissionNotes(missionRow?.notes, {
      refined: obsByOutcome('updated'),
      unchanged: obsByOutcome('unchanged'),
      appended: obsByOutcome('appended'),
    })
    await db.missions.update(selectedMission.id, {
      notes: persistableMissionNotes(merged),
    })

    const totals =
      obsByOutcome('updated').length +
      obsByOutcome('unchanged').length +
      obsByOutcome('appended').length
    setPackNotesMessage(
      totals > 0
        ? `Additional Notes on the Air Force Report Form were updated: ${obsByOutcome('updated').length} refined, ${obsByOutcome('unchanged').length} unchanged, ${obsByOutcome('appended').length} appended (by observation number). Regenerate the PDF if you already downloaded it.`
        : null
    )
  }

  async function handleZipPreview(file: File): Promise<void> {
    setBusy(true)
    setErr(null)
    setPackNotesMessage(null)
    try {
      const { csvPath, csvText } = await loadUserWaypointsCsvFromZipFile(file)
      const p = await computePreviewFromCsv(csvText, csvPath)
      await mergeRefinementNotesIntoMission(p)
      setPreview(p)
      setZipFile(file)
      rememberLocalZipFileName(selectedMission.id, file.name)
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Failed to read Content Pack zip'
      if (/allocation|Array buffer|out of memory/i.test(msg)) {
        msg =
          'This content pack is too large to process in this browser tab. Close other tabs or try a smaller pack ZIP.'
      }
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadUpdatedZip(): Promise<void> {
    if (!zipFile || !preview) return
    if (!packPreviewHasChanges(preview)) {
      setErr(
        preview.unchangedCount > 0
          ? 'No Content Pack changes after four-decimal rounding (coordinates already match ForeFlight).'
          : 'No tower changes to apply to this pack (nothing to refine or append).'
      )
      return
    }
    if (!packPreviewIsDownloadable(preview)) {
      if (preview.blockedCount > 0) {
        setErr(
          'One or more towers need new waypoint names but this mission has no flight plan with waypoints. Attach a flight plan, then preview again.'
        )
        return
      }
      if (preview.appendedCount > 0 && !preview.routeNumber) {
        setErr('Attach a flight plan to this mission so new waypoints can be named.')
        return
      }
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const csvPath = preview.csvPath
      if (!csvPath) {
        throw new Error('Missing waypoint path (try uploading the ZIP again).')
      }
      const outBlob = await repackContentPackReplaceFile(zipFile, csvPath, preview.pendingCsvText)
      const outName =
        zipFile.name.replace(/\.zip$/i, '') + `_UPDATED_${new Date().toISOString().slice(0, 10)}.zip`
      const url = URL.createObjectURL(outBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = outName
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Failed to write updated zip'
      if (/allocation|Array buffer|out of memory/i.test(msg)) {
        msg = 'Not enough memory to finish the ZIP download. Close other tabs and try again.'
      }
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  const zipReady = !!zipFile && !!preview && packPreviewIsDownloadable(preview)
  const recalledZipName = recalledLocalZipFileName(selectedMission.id)

  return (
    <section className="p-4 rounded-xl border border-gray-200 bg-gray-50/80 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ForeFlight content pack</h2>
          <p className="text-sm text-gray-600 mt-1">
            Choose the <strong>.zip</strong> you flew with — preview runs automatically when you pick
            the file. Use <strong>Re-run preview</strong> after saving more towers in Tower Data
            Analysis. Refinements update coordinates within ~30&nbsp;m; new rows use towers with saved
            photos. Download the updated pack from Downloads, then email it to your Wing maintainer.
          </p>
        </div>
        <GuidedHint
          hintId="exportData.contentPack"
          stepNumber={1}
          title="When to update the pack"
          body={
            <>
              <strong>Skip the pack</strong> — check &ldquo;No content pack update&rdquo; above when
              coordinates already match the pack you used (PDF only).
              <br />
              <br />
              <strong>Update the pack</strong> — upload your mission ZIP, review the preview counts,
              then download when refinements or new waypoints appear. If preview shows zero changes
              after rounding, ForeFlight already matches your survey — no download needed.
              <br />
              <br />
              After download: email the ZIP to your Wing maintainer and file it under{' '}
              <em>Updated Content Packs</em> on Wing storage when directed. Your ZIP is not uploaded
              anywhere; all steps run on this device.
            </>
          }
          isSeen={isSeen('exportData.contentPack')}
          onDismiss={markSeen}
          surface="light"
        />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-gray-500">Route</dt>
        <dd className="text-gray-900 font-medium">
          {missionRouteNumber ?? (
            <span className="text-cap-pimento font-normal">— attach a flight plan with MTR waypoints</span>
          )}
        </dd>
        <dt className="text-gray-500">Reported towers</dt>
        <dd className="text-gray-900">
          {reportedTowerCount} with saved survey photos
          {reportedTowerCount === 0 && (
            <span className="text-gray-600"> — complete Tower Data Analysis first</span>
          )}
        </dd>
      </dl>

      {recalledZipName && !zipFile && (
        <p className="text-xs text-gray-600">
          Earlier this session you used <span className="font-mono font-medium">{recalledZipName}</span>{' '}
          — choose that file again (the ZIP is not kept after you leave this page).
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ForeFlight Content Pack (.zip)
        </label>
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={busy || reportedTowerCount === 0}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            e.target.value = ''
            if (!f) return
            void handleZipPreview(f)
          }}
          className="text-sm w-full"
        />
        {reportedTowerCount === 0 && (
          <p className="text-xs text-gray-500 mt-1">Save at least one tower with a photo before updating a pack.</p>
        )}
      </div>

      {zipFile && (
        <p className="text-xs text-gray-600">
          Loaded: <span className="font-mono font-medium text-gray-800">{zipFile.name}</span>
        </p>
      )}

      {zipFile && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleZipPreview(zipFile)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:bg-white disabled:opacity-50"
          >
            {busy ? 'Running preview…' : 'Re-run preview'}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => void handleDownloadUpdatedZip()}
              disabled={busy || !zipReady}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Download updated Content Pack (.zip)'}
            </button>
          )}
        </div>
      )}

      {busy && !preview && (
        <p className="text-sm text-gray-600" role="status">
          Running preview…
        </p>
      )}

      {preview && (
        <div className="text-sm text-gray-700 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="font-medium text-gray-900 mb-1">
            Preview results
            {busy ? <span className="text-gray-500 font-normal"> (updating…)</span> : null}
          </p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              Route number for new rows: <strong>{preview.routeNumber ?? '—'}</strong>
            </li>
            <li>
              Coordinate refinements (≤30&nbsp;m): <strong>{preview.refinedCount}</strong>
            </li>
            <li>
              New waypoint rows to append: <strong>{preview.appendedCount}</strong>
            </li>
            {preview.unchangedCount > 0 && (
              <li>
                Already matched ForeFlight after rounding: <strong>{preview.unchangedCount}</strong>
              </li>
            )}
            {preview.blockedCount > 0 && (
              <li className="text-cap-pimento font-medium">
                {preview.blockedCount} tower(s) need a flight plan with waypoints to name new rows.
              </li>
            )}
          </ul>
          {!packPreviewHasChanges(preview) && (
            <p className="mt-2 text-xs text-gray-600">
              No changes to write to the pack (coordinates already match ForeFlight after rounding).
              Download stays disabled; check &ldquo;No content pack update&rdquo; above if only the PDF
              is needed.
            </p>
          )}
          {packNotesMessage && (
            <p className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {packNotesMessage}
            </p>
          )}
        </div>
      )}

      {err && <div className="p-3 bg-red-50 text-cap-pimento rounded-lg text-sm">{err}</div>}
    </section>
  )
}
