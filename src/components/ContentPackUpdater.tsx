import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
import {
  contentPackApi,
  getContentPackApiKey,
  setContentPackApiKey,
  type ServerContentPackSummary,
} from '@/services/contentPackApi'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

function looksLikeListAuthFailure(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /\b401\b/.test(m) ||
    /\b403\b/.test(m) ||
    m.includes('unauthorized') ||
    m.includes('forbidden') ||
    m.includes('authentication') ||
    (m.includes('api') && m.includes('key') && (m.includes('invalid') || m.includes('missing') || m.includes('required')))
  )
}

type Props = {
  selectedMission: MissionRecord
}

type Preview = {
  /** Full CSV after applying all mission towers (refine + append) that could be applied. */
  pendingCsvText: string
  applyItems: CumulativeTowerApplyItem[]
  /** 1-based Air Force form row # for each apply item (reports sorted by `reportDate`, includes gaps for missing locations). */
  observationNumbers: number[]
  appendedCount: number
  refinedCount: number
  unchangedCount: number
  blockedCount: number
  routeNumber: string | null
  csvPath: string | null
}

type ServerPreviewResponse = {
  ok?: boolean
  pendingCsvText: string
  items: CumulativeTowerApplyItem[]
  appendedCount: number
  refinedCount: number
  unchangedCount: number
  blockedCount: number
  currentRevision?: number
}

export function ContentPackUpdater({ selectedMission }: Props) {
  const cachedPacks = useLiveQuery(() => db.cachedServerContentPacks.toArray(), [])

  const [zipFile, setZipFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [packNotesMessage, setPackNotesMessage] = useState<string | null>(null)

  const [apiKeyInput, setApiKeyInput] = useState(() => getContentPackApiKey())
  const [serverPacks, setServerPacks] = useState<ServerContentPackSummary[]>([])
  const [serverListErr, setServerListErr] = useState<string | null>(null)
  const [serverPackId, setServerPackId] = useState<string | null>(null)
  const [selectedServerPack, setSelectedServerPack] = useState<ServerContentPackSummary | null>(null)
  const [missionRouteNumber, setMissionRouteNumber] = useState<string | null>(null)
  const userPickedRef = useRef(false)
  const { isSeen, markSeen } = useHintsSeen()

  const isServerMode = serverPackId != null

  const refreshServerPackList = useCallback(async () => {
    setServerListErr(null)
    try {
      const { packs } = await contentPackApi.listPacks()
      setServerPacks(packs)
    } catch (e) {
      setServerPacks([])
      setServerListErr(e instanceof Error ? e.message : 'Failed to list content packs')
    }
  }, [])

  useEffect(() => {
    void refreshServerPackList()
  }, [refreshServerPackList])

  async function syncSelectedPackFromServer(id: string): Promise<void> {
    const data = (await contentPackApi.getPack(id)) as { pack: ServerContentPackSummary }
    setSelectedServerPack(data.pack)
  }

  useEffect(() => {
    if (!serverPackId) {
      setSelectedServerPack(null)
      return
    }
    const row = serverPacks.find((p) => p.id === serverPackId)
    if (row) setSelectedServerPack(row)
    void syncSelectedPackFromServer(serverPackId).catch(() => {})
  }, [serverPackId, serverPacks])

  /** Reset transient state and recompute the mission's primary route number whenever the mission changes. */
  useEffect(() => {
    let cancelled = false
    setServerPackId(null)
    setZipFile(null)
    setPreview(null)
    setErr(null)
    setPackNotesMessage(null)
    userPickedRef.current = false
    void (async () => {
      const wps = await loadMissionWaypoints()
      if (cancelled) return
      setMissionRouteNumber(primaryRouteNumberFromWaypoints(wps))
    })()
    return () => {
      cancelled = true
    }
    // We intentionally re-run only on mission id change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMission.id])

  /** Packs whose `primary_route_number` matches the mission's route. List is already sorted by updated_at desc. */
  const matchingPacks = useMemo(
    () =>
      missionRouteNumber
        ? serverPacks.filter((p) => p.primary_route_number === missionRouteNumber)
        : [],
    [serverPacks, missionRouteNumber]
  )

  /**
   * Auto-pick the most recently updated pack whose route matches the mission.
   * Stays out of the way once the user has picked something explicitly (or
   * loaded a local ZIP) so a refresh of the pack list doesn't snap selection
   * back onto a different row.
   */
  useEffect(() => {
    if (userPickedRef.current) return
    if (zipFile) return
    if (matchingPacks.length === 0) return
    setServerPackId((prev) => prev ?? matchingPacks[0]!.id)
  }, [matchingPacks, zipFile])

  async function loadMissionTowersForPack(): Promise<{
    towers: { lat: number; lon: number; groundElevationFt?: number }[]
    observationNumbers: number[]
  }> {
    const reports = await db.towerReports
      .where('missionId')
      .equals(selectedMission.id)
      .sortBy('reportDate')
    const locations = await Promise.all(reports.map((r) => db.towerLocations.get(r.towerLocationId)))
    const towers: { lat: number; lon: number; groundElevationFt?: number }[] = []
    const observationNumbers: number[] = []
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i]
      if (!loc) continue
      towers.push({
        lat: loc.latitude,
        lon: loc.longitude,
        groundElevationFt: Number.isFinite(loc.elevation) ? loc.elevation : undefined,
      })
      observationNumbers.push(i + 1)
    }
    return { towers, observationNumbers }
  }

  async function loadMissionWaypoints(): Promise<WaypointRecord[]> {
    if (!selectedMission.flightPlanId) return []
    return await db.waypoints
      .where('flightPlanId')
      .equals(selectedMission.flightPlanId)
      .sortBy('sequence')
  }

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

    const refined = obsByOutcome('updated')
    const unchanged = obsByOutcome('unchanged')
    const appended = obsByOutcome('appended')

    const missionRow = await db.missions.get(selectedMission.id)
    const merged = mergeContentPackApplyMissionNotes(missionRow?.notes, {
      refined,
      unchanged,
      appended,
    })
    await db.missions.update(selectedMission.id, {
      notes: persistableMissionNotes(merged),
    })

    const totals = refined.length + unchanged.length + appended.length
    setPackNotesMessage(
      totals > 0
        ? `Additional Notes on the Air Force Report Form were updated: ${refined.length} refined, ${unchanged.length} unchanged, ${appended.length} appended (by observation number).`
        : null
    )
  }

  async function cacheSelectedPackForOffline(): Promise<void> {
    if (!serverPackId) return
    setBusy(true)
    setErr(null)
    try {
      const data = (await contentPackApi.getPack(serverPackId, true)) as {
        pack: ServerContentPackSummary
        waypoints?: { rowOrder: number; cells: string[] }[]
      }
      await db.cachedServerContentPacks.put({
        id: serverPackId,
        name: data.pack.name,
        currentRevision: data.pack.current_revision,
        updatedAt: data.pack.updated_at,
        csvMemberPath: data.pack.csv_member_path,
        cachedAt: new Date().toISOString(),
        detailJson: JSON.stringify(data),
      })
      setPackNotesMessage('Pack snapshot saved in this browser for offline reference.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to cache pack')
    } finally {
      setBusy(false)
    }
  }

  async function handleZipPreview(file: File): Promise<void> {
    userPickedRef.current = true
    setServerPackId(null)
    setBusy(true)
    setErr(null)
    setPreview(null)
    setPackNotesMessage(null)
    try {
      const { csvPath, csvText } = await loadUserWaypointsCsvFromZipFile(file)
      const p = await computePreviewFromCsv(csvText, csvPath)
      await mergeRefinementNotesIntoMission(p)
      setPreview(p)
      setZipFile(file)
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

  async function handleServerPreview(): Promise<void> {
    if (!serverPackId || !selectedServerPack) return
    setBusy(true)
    setErr(null)
    setPreview(null)
    setPackNotesMessage(null)
    try {
      const { towers, observationNumbers } = await loadMissionTowersForPack()
      const wps = await loadMissionWaypoints()
      const routeNumber = primaryRouteNumberFromWaypoints(wps)
      const data = (await contentPackApi.previewApply(serverPackId, {
        routeNumber,
        towers,
      })) as ServerPreviewResponse
      if ((data as { error?: string }).error) {
        throw new Error((data as { message?: string }).message ?? 'Preview failed')
      }
      const p: Preview = {
        pendingCsvText: data.pendingCsvText,
        applyItems: data.items,
        observationNumbers,
        appendedCount: data.appendedCount,
        refinedCount: data.refinedCount,
        unchangedCount: data.unchangedCount,
        blockedCount: data.blockedCount,
        routeNumber,
        csvPath: selectedServerPack.csv_member_path,
      }
      await mergeRefinementNotesIntoMission(p)
      setPreview(p)
      setZipFile(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Server preview failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleServerApply(): Promise<void> {
    if (!serverPackId || !selectedServerPack || !preview) return
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
      setErr(
        preview.unchangedCount > 0 && !packPreviewHasChanges(preview)
          ? 'No Content Pack changes after four-decimal rounding (coordinates already match ForeFlight).'
          : 'No tower changes to commit (nothing to refine or append).'
      )
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const { towers } = await loadMissionTowersForPack()
      const wps = await loadMissionWaypoints()
      const routeNumber = primaryRouteNumberFromWaypoints(wps)
      await contentPackApi.apply(serverPackId, {
        expectedRevision: selectedServerPack.current_revision,
        routeNumber,
        towers,
      })
      await refreshServerPackList()
      await syncSelectedPackFromServer(serverPackId)
      setPackNotesMessage(
        'Pack updated on the server. Next year, download the latest pack from the Flight Plan page when you’re prepping for the survey.'
      )
      setPreview(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Apply failed'
      if (/revision|409|Expected revision/i.test(msg)) {
        setErr(`${msg} Refresh the pack list and preview again before applying.`)
        void refreshServerPackList()
        if (serverPackId) void syncSelectedPackFromServer(serverPackId)
      } else {
        setErr(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleServerExportDownload(): Promise<void> {
    if (!serverPackId) return
    setBusy(true)
    setErr(null)
    try {
      const blob = await contentPackApi.downloadExportBlob(serverPackId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedServerPack?.name?.trim() || `foreflight-pack-${serverPackId.slice(0, 8)}`}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export download failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleZipApply(): Promise<void> {
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
      const updated = preview.pendingCsvText
      const outBlob = await repackContentPackReplaceFile(zipFile, csvPath, updated)
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
  const serverPreviewReady = isServerMode && !!preview && packPreviewIsDownloadable(preview)

  /** Manual override of the auto-matched pack inside the primary card. */
  function onSelectMatchingPack(id: string | null) {
    userPickedRef.current = true
    setServerPackId(id)
    setZipFile(null)
    setPreview(null)
    setErr(null)
    setPackNotesMessage(null)
  }

  const canUseServer = serverPacks.length > 0
  const noMatchingPack = isServerMode === false && !zipFile && missionRouteNumber != null && matchingPacks.length === 0

  const showApiKeyOnboardingBanner =
    !getContentPackApiKey() && !!serverListErr && looksLikeListAuthFailure(serverListErr)

  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-6">
      {showApiKeyOnboardingBanner && (
        <div
          role="status"
          className="p-4 rounded-lg border border-cap-yellow/40 bg-cap-yellow/10 text-sm text-gray-900 space-y-2"
        >
          <p className="font-semibold text-gray-900">First-time setup: enter your Content Pack API key</p>
          <p className="text-gray-800 leading-relaxed">
            To download content packs and apply your mission&apos;s tower observations, this browser needs your
            Wing&apos;s Content Pack API key. Open <strong className="font-semibold">Settings</strong> below, paste the
            key under Server connection, and click <strong className="font-semibold">Save key</strong>. Ask your Wing
            Administrator if you don&apos;t have one.
          </p>
        </div>
      )}
      {/* Primary action card: apply this mission's towers to the matching server pack. */}
      <section className="space-y-3">
        <header className="space-y-1">
          <p className="text-base font-semibold text-gray-900">Apply this mission’s towers</p>
          <p className="text-xs text-gray-600">
            Refines coordinates within ~30&nbsp;m and appends new towers using your flight plan’s route number. After
            apply, the latest pack lives on the server — download it from the Flight Plan page when you’re prepping for
            next year’s survey.
          </p>
        </header>

        <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-gray-500">Mission</dt>
          <dd className="text-gray-900 font-medium">{selectedMission.name}</dd>
          <dt className="text-gray-500">Route</dt>
          <dd className="text-gray-900 font-medium">
            {missionRouteNumber ?? <span className="text-cap-pimento">— (no flight plan waypoints)</span>}
          </dd>
          <dt className="text-gray-500">Pack on server</dt>
          <dd className="text-gray-900">
            {selectedServerPack ? (
              <span>
                <span className="font-medium">{selectedServerPack.name}</span>{' '}
                <span className="text-gray-500">
                  · rev {selectedServerPack.current_revision}
                  {selectedServerPack.primary_route_number === missionRouteNumber ? ' · matches route' : ''}
                </span>
              </span>
            ) : zipFile ? (
              <span className="text-gray-700">
                Local ZIP: <span className="font-medium">{zipFile.name}</span>
              </span>
            ) : noMatchingPack ? (
              <span className="text-cap-pimento">
                No pack on the server matches route {missionRouteNumber}. Your Wing Administrator can add one in the
                console at <code className="text-xs bg-gray-100 px-1 rounded">/admin/content-packs</code>, or use the
                local-ZIP fallback.
              </span>
            ) : !canUseServer ? (
              <span className="text-gray-600">
                No packs on the server yet. Open Settings to enter the API key, or ask your Wing Administrator to publish
                a pack at <code className="text-xs bg-gray-100 px-1 rounded">/admin/content-packs</code>.
              </span>
            ) : (
              <span className="text-gray-600">Choose a pack in Settings if you need to override the auto-match.</span>
            )}
          </dd>
        </dl>

        {matchingPacks.length > 1 && (
          <div className="text-xs text-gray-700">
            <label className="block font-medium text-gray-700 mb-1">
              Multiple packs match route {missionRouteNumber}. Pick one
            </label>
            <select
              value={serverPackId ?? ''}
              disabled={busy}
              onChange={(e) => onSelectMatchingPack(e.target.value || null)}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {matchingPacks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · rev {p.current_revision} · updated {new Date(p.updated_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {isServerMode ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleServerPreview()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Preview changes'}
              </button>
              <button
                type="button"
                disabled={busy || !serverPreviewReady}
                onClick={() => void handleServerApply()}
                className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
              >
                Apply this mission’s towers
              </button>
            </>
          ) : zipFile && preview ? (
            <button
              type="button"
              onClick={() => void handleZipApply()}
              disabled={busy || !zipReady}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Download updated Content Pack (.zip)'}
            </button>
          ) : null}
        </div>
      </section>

      {preview && (
        <div className="text-sm text-gray-700">
          <p className="font-medium text-gray-900 mb-1">Preview</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              Route number for naming new rows: <strong>{preview.routeNumber ?? '—'}</strong>
            </li>
            <li>
              Coordinate refinements (≤30&nbsp;m, same CSV name): <strong>{preview.refinedCount}</strong>
            </li>
            <li>
              New waypoint rows to append: <strong>{preview.appendedCount}</strong>
            </li>
            {preview.unchangedCount > 0 && (
              <li>
                Already matched ForeFlight after rounding (CSV row unchanged):{' '}
                <strong>{preview.unchangedCount}</strong>
              </li>
            )}
            {preview.blockedCount > 0 && (
              <li className="text-cap-pimento font-medium">
                {preview.blockedCount} tower(s) need a new waypoint name but this mission has no flight plan with
                waypoints. Attach a flight plan and preview again to append those rows.
              </li>
            )}
            {preview.applyItems.some((x) => x.outcome === 'updated') && (
              <li className="text-gray-700">
                <span className="font-medium text-gray-900">Refinements:</span>
                <ul className="list-disc ml-5 mt-1.5 space-y-1 text-xs">
                  {preview.applyItems.map((s, idx) =>
                    s.outcome === 'updated' ? (
                      <li key={`u-${idx}`}>
                        Observation <strong>Tower {preview.observationNumbers[idx]}</strong> (
                        <span className="font-mono tabular-nums">
                          {s.towerLat.toFixed(5)}, {s.towerLon.toFixed(5)}
                        </span>
                        ) → update CSV “<strong>{s.matchedWaypointName}</strong>”
                        {s.distanceM != null && (
                          <>
                            {' '}
                            (<strong>{s.distanceM.toFixed(0)}&nbsp;m</strong> from previous coordinates)
                          </>
                        )}
                      </li>
                    ) : null
                  )}
                </ul>
              </li>
            )}
            {preview.applyItems.some((x) => x.outcome === 'appended') && (
              <li className="text-gray-700">
                <span className="font-medium text-gray-900">New rows:</span>
                <ul className="list-disc ml-5 mt-1.5 space-y-1 text-xs">
                  {preview.applyItems
                    .filter((x) => x.outcome === 'appended')
                    .map((s, i) => (
                      <li key={`a-${i}`}>
                        <strong>{s.newWaypointName}</strong> at{' '}
                        <span className="font-mono tabular-nums">
                          {s.towerLat.toFixed(5)}, {s.towerLon.toFixed(5)}
                        </span>
                      </li>
                    ))}
                </ul>
              </li>
            )}
          </ul>
          {packNotesMessage && (
            <p className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {packNotesMessage}
            </p>
          )}
        </div>
      )}

      {err && <div className="p-3 bg-red-50 text-cap-pimento rounded-lg text-sm">{err}</div>}

      {/* Settings disclosure: API key, server pack list/publish, local-ZIP fallback, advanced. */}
      <details className="rounded-lg border border-gray-200 bg-gray-50/80 group">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-800 group-open:border-b group-open:border-gray-200 flex items-center justify-between gap-2">
          <span>Settings</span>
          {/* The lightbulb is interactive; stop the click from toggling the disclosure. */}
          <span onClick={(e) => e.stopPropagation()}>
            <GuidedHint
              hintId="contentPackPage.settings"
              stepNumber={2}
              title="When you’ll open Settings"
              body={
                <>
                  Open Settings to enter the Wing API key (one time per browser), override the auto-matched pack for
                  testing, cache a snapshot for offline reference, or fall back to a local-ZIP workflow when the server
                  isn&apos;t reachable. New packs and MTR setup are handled in the Wing Administrator console at{' '}
                  <code className="text-[11px] bg-gray-200/80 px-1 rounded">/admin/content-packs</code>.
                </>
              }
              isSeen={isSeen('contentPackPage.settings')}
              onDismiss={markSeen}
              surface="light"
            />
          </span>
        </summary>
        <div className="p-4 space-y-5 text-sm">
          {/* API key */}
          <div className="space-y-2">
            <p className="font-medium text-gray-900">Server connection</p>
            <p className="text-xs text-gray-600">
              The Wing API needs a key for write access. Saved per-browser; you can also set{' '}
              <code className="bg-gray-100 px-1 rounded">VITE_CONTENT_PACK_API_KEY</code> for local dev.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Content Pack API key</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKeyInput}
                  disabled={busy}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Paste key, then Save"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setContentPackApiKey(apiKeyInput)
                  void refreshServerPackList()
                }}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
              >
                Save key
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshServerPackList()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:bg-white disabled:opacity-50"
              >
                Refresh list
              </button>
            </div>
            {serverListErr && <p className="text-xs text-cap-pimento">{serverListErr}</p>}
          </div>

          {/* Pack chooser (overrides auto-match) */}
          <div className="space-y-2">
            <p className="font-medium text-gray-900">Choose pack manually</p>
            <p className="text-xs text-gray-600">
              By default we auto-pick the most recently updated pack whose route matches this mission. Override here if
              you need a different one — useful when testing or when a route has multiple variants.
            </p>
            <select
              value={serverPackId ?? ''}
              disabled={busy}
              onChange={(e) => onSelectMatchingPack(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">— Auto-match by route —</option>
              {serverPacks.map((p) => {
                const cached = (cachedPacks ?? []).some((c) => c.id === p.id)
                const matches = p.primary_route_number === missionRouteNumber
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} (rev {p.current_revision})
                    {p.primary_route_number ? ` · route ${p.primary_route_number}` : ''}
                    {matches ? ' · matches' : ''}
                    {cached ? ' · cached' : ''}
                  </option>
                )
              })}
            </select>
            {isServerMode && selectedServerPack && (
              <p className="text-xs text-gray-600">
                CSV member <code className="bg-gray-100 px-1 rounded">{selectedServerPack.csv_member_path}</code>
              </p>
            )}
            <p className="text-xs text-gray-600">
              To <strong>remove a pack from the server</strong> (wrong upload, duplicate route, obsolete baseline), open
              the Wing Administrator console:{' '}
              <Link to="/admin/content-packs" className="text-cap-ultramarine font-medium hover:underline">
                Administrator → Content packs
              </Link>
              . Sign in with the Wing PIN, then use <strong>Inventory → Delete</strong> on the row you want gone. This
              crew page cannot delete packs by design.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700 space-y-1.5">
            <p className="font-semibold text-gray-900">
              Need to publish a new pack or create one for a new MTR?
            </p>
            <p>
              Pack lifecycle (publish, create empty, <strong>delete</strong>) is in the Wing Administrator console at{' '}
              <code className="bg-gray-100 px-1 rounded">/admin/content-packs</code>. Bookmark that URL — there is no
              nav link by design.
            </p>
          </div>

          {/* Advanced */}
          <div className="space-y-2">
            <p className="font-medium text-gray-900">Advanced</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !isServerMode}
                onClick={() => void cacheSelectedPackForOffline()}
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-800 hover:bg-white disabled:opacity-50"
              >
                Cache selected pack for offline
              </button>
              <button
                type="button"
                disabled={busy || !isServerMode}
                onClick={() => void handleServerExportDownload()}
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-800 hover:bg-white disabled:opacity-50"
              >
                Download export (.zip) from server
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Day-to-day, downloads belong on the Flight Plan page (next year’s survey crews work from a flight plan,
              not a closed mission). The button above is a shortcut for verification.
            </p>
          </div>

          {/* Local ZIP fallback */}
          <div className="space-y-2">
            <p className="font-medium text-gray-900">Local-only ZIP fallback</p>
            <p className="text-xs text-gray-600">
              No server, no API key — pick a pack ZIP from disk, preview, then download an updated ZIP. Nothing is
              uploaded.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  if (!f) return
                  void handleZipPreview(f)
                }}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
