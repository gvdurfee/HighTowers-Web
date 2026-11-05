import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { fetchMtrWidthTexts } from '@/services/surveyPlanningApi'
import { SortieFileButton } from '@/components/SortieFileButton'
import { downloadSortieFpl } from '@/services/sortieFplExport'
import {
  buildTeamPlanSortieFile,
  publishedSortieWidthReady,
  teamSortieDownloadOffer,
} from '@/services/teamPlanSortieDownload'
import type { TeamPlanTeam, TeamRoutePoint } from '@/services/teamPlanRecord'
import {
  buildSortieOffsetFpl,
  missingSortieChoiceNotice,
  orderSortieTrack,
  type SortieSide,
} from '@/services/offsetRouteFpl'
import { assignG1000WaypointNames } from '@/utils/g1000WaypointName'
import { db, type AirportRecord, type WaypointRecord } from '@/db/schema'
import {
  assessSavedOffsetPlan,
  formatOffsetSavedAt,
  offsetFormIsDirty,
  offsetSequenceSignature,
  type SavedOffsetPlan,
} from '@/services/offsetPlanRecord'
import { setOffsetPlanLeaveGuard } from '@/services/offsetPlanLeaveGuard'
import {
  downloadBlockReason,
  legEntryReason,
  mergeReloadedWidths,
  pilotEntryMessage,
  publishedWidthNote,
  rowComplete,
  type PilotWidthRow,
  type PublishedWidthLeg,
} from '@/services/offsetPilotEntry'
import {
  buildOffsetRoutes,
  resolvePublishedLegWidths,
} from '@survey-planning/offsetRoutePlan.js'
import type {
  OffsetFlag,
  OffsetLegWidth,
  OffsetRoutePoint,
} from '@survey-planning/offsetRoutePlan.js'
export type OffsetPanelWaypoint = {
  originalName: string
  g1000Name: string
  lat: number
  lon: number
}

export type OffsetMapGeometry = {
  inner: OffsetRoutePoint[]
  outer: OffsetRoutePoint[]
  corridorLeft: OffsetRoutePoint[]
  corridorRight: OffsetRoutePoint[]
  flags: OffsetFlag[]
}

type WidthRow = PilotWidthRow

type ManualSeed = {
  message: string
  details: string[]
  rows: WidthRow[]
}

function emptyRow(): WidthRow {
  return { left: '', right: '', source: 'empty', reason: null, clause: null }
}

function pointsFrom(waypoints: OffsetPanelWaypoint[]): OffsetRoutePoint[] {
  return waypoints.map((wp) => {
    const parsed = parseWaypointCode(wp.originalName)
    return {
      ptIdent: parsed?.waypointLetter ?? wp.g1000Name,
      g1000Name: wp.g1000Name,
      originalName: wp.originalName,
      lat: wp.lat,
      lon: wp.lon,
    }
  })
}

function routeOf(waypoints: OffsetPanelWaypoint[]) {
  const parsed = waypoints
    .map((wp) => parseWaypointCode(wp.originalName))
    .filter((item): item is NonNullable<typeof item> => item != null)
  if (parsed.length === 0) return { kind: 'unknown' as const }
  const srOnly = parsed.every((item) => item.routeType === 'SR')
  if (srOnly) return { kind: 'sr' as const, routeNumber: parsed[0].routeNumber }
  const irvr = parsed.filter((item) => item.routeType === 'IR' || item.routeType === 'VR')
  if (irvr.length === 0) return { kind: 'unknown' as const }
  const first = irvr[0]
  const same = irvr.every(
    (item) => item.routeType === first.routeType && item.routeNumber === first.routeNumber
  )
  if (!same) return { kind: 'mixed' as const }
  return {
    kind: 'irvr' as const,
    routeType: first.routeType as 'IR' | 'VR',
    routeNumber: first.routeNumber,
  }
}

function parseWidthRow(row: WidthRow): OffsetLegWidth | null {
  const leftNm = Number(row.left)
  const rightNm = Number(row.right)
  if (!Number.isFinite(leftNm) || !Number.isFinite(rightNm) || leftNm < 0 || rightNm < 0) {
    return null
  }
  return { leftNm, rightNm }
}

function blankRows(count: number): WidthRow[] {
  return Array.from({ length: count }, () => emptyRow())
}

function rowKey(rows: { left: string; right: string }[]): string {
  return JSON.stringify(rows)
}

function applySavedPlan(
  plan: SavedOffsetPlan,
  setPublished: (legs: OffsetLegWidth[] | null) => void,
  setManual: (seed: ManualSeed | null) => void,
  setRows: (rows: WidthRow[]) => void
) {
  const seeded = plan.widths.map((width, index) => ({
    left: String(width.leftNm),
    right: String(width.rightNm),
    source: plan.sources?.[index] ?? 'pilot',
    reason: null,
    clause: null,
  }))
  if (plan.mode === 'published') {
    setPublished(plan.widths)
    setManual(null)
    setRows([])
    return
  }
  setPublished(null)
  setManual({
    message: plan.manualMessage ?? 'Using the widths saved with this flight plan.',
    details: [],
    rows: seeded,
  })
  setRows(seeded)
}

export function OffsetRoutePanel(props: {
  flightPlanId: string
  waypoints: OffsetPanelWaypoint[]
  departure: AirportRecord | null
  destination: AirportRecord | null
  sortie1Side: SortieSide | null
  onGeometry: (geometry: OffsetMapGeometry | null) => void
  onLegWidths?: (widths: OffsetLegWidth[] | null) => void
  /** Saved team for the crew selected on the map. Absent on the route-only view. */
  teamPlanDownload?: {
    team: TeamPlanTeam
    routeLabel: string
    waypoints: WaypointRecord[]
    points: TeamRoutePoint[]
    legWidths: Array<{ leftNm: number; rightNm: number } | null> | null
    policy?: { firstOffsetNm?: number; stepNm?: number }
  } | null
}) {
  const { flightPlanId, waypoints, departure, destination, sortie1Side, onGeometry, onLegWidths, teamPlanDownload } = props
  const signature = offsetSequenceSignature(waypoints)
  const points = useMemo(() => pointsFrom(waypoints), [signature])
  const route = useMemo(() => routeOf(waypoints), [signature])
  const legCount = Math.max(0, points.length - 1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [published, setPublished] = useState<OffsetLegWidth[] | null>(null)
  const [manual, setManual] = useState<ManualSeed | null>(null)
  const [rows, setRows] = useState<WidthRow[]>([])
  const [applyLeft, setApplyLeft] = useState('')
  const [applyRight, setApplyRight] = useState('')
  const [baseline, setBaseline] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [sequenceMismatchAt, setSequenceMismatchAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [faaNotes, setFaaNotes] = useState<string[]>([])
  const [namesOpen, setNamesOpen] = useState(false)
  const ignoreSavedRef = useRef(false)
  const pilotKeepRef = useRef<WidthRow[] | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const onGeometryRef = useRef(onGeometry)
  onGeometryRef.current = onGeometry
  const onLegWidthsRef = useRef(onLegWidths)
  onLegWidthsRef.current = onLegWidths

  useEffect(() => {
    ignoreSavedRef.current = false
  }, [flightPlanId])

  useEffect(() => {
    let cancelled = false
    setPublished(null)
    setManual(null)
    setLoadError(null)
    setSequenceMismatchAt(null)
    setSavedAt(null)
    setBaseline(null)
    setFaaNotes([])
    onGeometryRef.current(null)

    if (points.length < 2) return

    const seedManual = (message: string, details: string[], seeded: WidthRow[]) => {
      setManual({ message, details, rows: seeded })
      setRows(seeded)
      setBaseline(rowKey(seeded))
    }

    async function load() {
      const saved = await db.offsetPlans.get(flightPlanId)
      if (cancelled) return
      const decision = assessSavedOffsetPlan(saved, signature)
      if (!ignoreSavedRef.current && decision.status === 'match') {
        applySavedPlan(decision.plan, setPublished, setManual, setRows)
        setSavedAt(decision.plan.savedAt)
        setBaseline(
          decision.plan.mode === 'published'
            ? JSON.stringify(decision.plan.widths)
            : rowKey(
                decision.plan.widths.map((width) => ({
                  left: String(width.leftNm),
                  right: String(width.rightNm),
                }))
              )
        )
        onGeometryRef.current({
          inner: decision.plan.inner,
          outer: decision.plan.outer,
          corridorLeft: decision.plan.corridorLeft,
          corridorRight: decision.plan.corridorRight,
          flags: decision.plan.flags,
        })
        return
      }

      if (decision.status === 'mismatch') {
        setSequenceMismatchAt(decision.savedAt)
      }

      if (route.kind === 'sr') {
        seedManual(
          'SR routes have no FAA corridor width. Enter left and right nautical miles from Military Flight Bag / AP/1B. Nothing is guessed.',
          [],
          blankRows(legCount)
        )
        return
      }

      if (route.kind === 'mixed' || route.kind === 'unknown') {
        seedManual(
          'This sequence is not one IR or VR route, so FAA widths are not applied. Enter left and right nautical miles for each segment.',
          [],
          blankRows(legCount)
        )
        return
      }

      setLoading(true)
      try {
        const result = await fetchMtrWidthTexts(route.routeType, route.routeNumber)
        if (cancelled) return
        const resolved = resolvePublishedLegWidths(points, result.widthTexts)
        const notes = [
          ...(resolved.status === 'published'
            ? resolved.unparsed.map((clause) => `FAA text not readable: ${clause}`)
            : []),
          ...resolved.exclusions.map((clause) => `FAA text leaves this out: ${clause}`),
        ]
        setFaaNotes(notes)
        const faaRows = blankRows(legCount).map((row, index) => {
          const known = resolved.legs[index]
          if (known) {
            return {
              left: String(known.leftNm),
              right: String(known.rightNm),
              source: 'faa' as const,
              reason: null,
              clause: null,
            }
          }
          const gap = resolved.missing.find((leg) => leg.index === index)
          return {
            ...row,
            reason: gap?.reason ?? 'not-covered',
            clause: gap?.clause ?? null,
          }
        })
        const kept = pilotKeepRef.current
        pilotKeepRef.current = null
        const seeded = mergeReloadedWidths(faaRows, kept)
        if (resolved.status === 'published' && seeded.every((row) => row.source === 'faa')) {
          const legs = resolved.legs.flatMap((leg) => (leg ? [leg] : []))
          setPublished(legs)
          setBaseline(JSON.stringify(legs))
          return
        }
        const filled = seeded.filter((row) => row.source === 'faa').length
        seedManual(pilotEntryMessage(filled, legCount), [], seeded)
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Width lookup failed'
        setLoadError(message)
        seedManual(
          `FAA widths could not be loaded (${message}). Enter left and right nautical miles. Nothing was guessed.`,
          [],
          blankRows(legCount)
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [signature, legCount, points, route, flightPlanId, reloadNonce])

  const activeWidths = useMemo(() => {
    if (published) return published
    if (!manual || rows.length !== legCount) return null
    const parsed = rows.map(parseWidthRow)
    if (parsed.some((leg) => leg == null)) return null
    return parsed as OffsetLegWidth[]
  }, [published, manual, rows, legCount])

  const built = useMemo(() => {
    if (!activeWidths || points.length < 2) return null
    try {
      return buildOffsetRoutes(points, activeWidths)
    } catch {
      return null
    }
  }, [activeWidths, points])

  useEffect(() => {
    onLegWidthsRef.current?.(activeWidths)
  }, [activeWidths])

  useEffect(() => {
    if (!built) {
      onGeometryRef.current(null)
      return
    }
    onGeometryRef.current({
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      corridorLeft: built.corridorLeft,
      corridorRight: built.corridorRight,
      flags: built.flags,
    })
  }, [built])

  const dirty =
    manual != null && baseline != null && offsetFormIsDirty(baseline, rowKey(rows))
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    setOffsetPlanLeaveGuard(() => {
      if (!dirtyRef.current) return true
      return window.confirm('Unsaved changes. Leave without saving this offset plan?')
    })
    return () => setOffsetPlanLeaveGuard(null)
  }, [])

  useEffect(() => {
    if (!dirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Unsaved changes'
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  async function reloadFaaWidths() {
    pilotKeepRef.current = rows.map((row) => ({ ...row }))
    ignoreSavedRef.current = true
    await db.offsetPlans.delete(flightPlanId)
    setSavedAt(null)
    setReloadNonce((nonce) => nonce + 1)
  }

  async function saveOffsetPlan() {
    if (!built || !activeWidths) return
    setSaving(true)
    try {
      const record: SavedOffsetPlan = {
        flightPlanId,
        savedAt: new Date().toISOString(),
        sequenceSignature: signature,
        widths: activeWidths.map((width) => ({ leftNm: width.leftNm, rightNm: width.rightNm })),
        mode: published ? 'published' : 'manual',
        sources: published ? null : rows.map((row) => row.source),
        manualMessage: manual?.message ?? null,
        inner: built.inner.waypoints,
        outer: built.outer.waypoints,
        corridorLeft: built.corridorLeft,
        corridorRight: built.corridorRight,
        flags: built.flags,
      }
      await db.offsetPlans.put(record)
      setSavedAt(record.savedAt)
      setSequenceMismatchAt(null)
      setBaseline(manual ? rowKey(rows) : JSON.stringify(record.widths))
    } finally {
      setSaving(false)
    }
  }

  const routeLabel =
    route.kind === 'irvr'
      ? `${route.routeType}${route.routeNumber}`
      : route.kind === 'sr'
        ? `SR${route.routeNumber}`
        : 'MTR'

  const faaLegs: PublishedWidthLeg[] = []
  let pilotEntered = false
  if (published) {
    published.forEach((leg, index) => {
      faaLegs.push({
        fromPt: leg.fromPt || points[index]?.ptIdent || '',
        toPt: leg.toPt || points[index + 1]?.ptIdent || '',
        leftNm: leg.leftNm,
        rightNm: leg.rightNm,
      })
    })
  } else {
    rows.forEach((row, index) => {
      if (row.source === 'pilot' && rowComplete(row)) pilotEntered = true
      if (row.source !== 'faa' || !rowComplete(row)) return
      faaLegs.push({
        fromPt: points[index]?.ptIdent ?? '',
        toPt: points[index + 1]?.ptIdent ?? '',
        leftNm: Number(row.left),
        rightNm: Number(row.right),
      })
    })
  }
  const widthNote = publishedWidthNote(routeLabel, faaLegs, pilotEntered)
  const centerlineNamed = assignG1000WaypointNames(
    points.map((point) => ({ originalName: point.originalName || point.g1000Name || point.ptIdent }))
  )
  const centerlineNames = centerlineNamed.names
  const nameError = centerlineNamed.error || built?.nameError || null
  const sortieReady = sortie1Side === 'inner' || sortie1Side === 'outer'
  const sortie1SideLabel = sortie1Side === 'inner' || sortie1Side === 'outer' ? sortie1Side : ''
  const sortie2SideLabel = sortie1Side === 'inner' ? 'outer' : sortie1Side === 'outer' ? 'inner' : ''

  function sortieWaypoints(sortieNumber: 1 | 2) {
    if (!built || !sortie1Side) return null
    return orderSortieTrack({
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side,
      sortieNumber,
    })
  }

  function downloadSortie(sortieNumber: 1 | 2) {
    if (!built || !sortieReady || !sortie1Side || nameError) return
    const ordered = sortieWaypoints(sortieNumber)
    if (!ordered) return
    const file = buildSortieOffsetFpl({
      routeLabel,
      sortieNumber,
      side: ordered.side,
      waypoints: ordered.waypoints.map((wp) => ({
        g1000Name: wp.g1000Name || wp.ptIdent,
        lat: wp.lat,
        lon: wp.lon,
      })),
      departure: sortieNumber === 1 ? departure : destination,
      destination: sortieNumber === 1 ? destination : departure,
    })
    downloadSortieFpl(file.xml, file.filename)
  }

  if (waypoints.length < 2) return null

  return (
    <div className="shrink-0 px-4 py-3 border-b border-white/15 bg-black/40 text-white space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold">Offset flight plans</p>
        <button
          type="button"
          aria-expanded={namesOpen}
          aria-controls="offset-flight-plan-names"
          onClick={() => setNamesOpen((open) => !open)}
          className="px-3 py-1 text-sm font-medium rounded-lg bg-white/15 hover:bg-white/25"
        >
          {namesOpen ? 'Hide names' : 'Show names'}
        </button>
        {loading && <span className="text-xs text-white/70">Loading FAA widths…</span>}
        {loadError && <span className="text-xs text-cap-yellow">{loadError}</span>}
      </div>

      {sequenceMismatchAt && (
        <p className="text-sm text-cap-yellow">
          Saved offsets from {formatOffsetSavedAt(sequenceMismatchAt)} were built for a different
          waypoint sequence. They were not applied. Review the widths and save again.
        </p>
      )}

      {namesOpen && (
        <div id="offset-flight-plan-names" className="space-y-2">
          <p className="text-xs text-white/75">
            Inner is halfway from the centerline to the inside of the route's curve. Outer is halfway
            to the outside. Names below are in the same flight order as the sortie file.
          </p>
          {widthNote && <p className="text-xs text-white/80">{widthNote}</p>}
          <div className="max-h-28 overflow-auto rounded border border-white/15">
            <table className="w-full text-xs">
              <thead className="text-left text-white/70">
                <tr>
                  <th className="px-2 py-1">ForeFlight</th>
                  <th className="px-2 py-1">G1000</th>
                  <th className="px-2 py-1">Sortie 1{sortie1SideLabel ? ` (${sortie1SideLabel})` : ''}</th>
                  <th className="px-2 py-1">Sortie 2{sortie2SideLabel ? ` (${sortie2SideLabel})` : ''}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point, index) => {
                  const center = centerlineNames[index]
                  const sortie1List = sortie1Side ? sortieWaypoints(1)?.waypoints : null
                  const sortie2List = sortie1Side ? sortieWaypoints(2)?.waypoints : null
                  const sortie1 = sortie1List ? sortie1List[index] : built?.inner.waypoints[index]
                  const sortie2 = sortie2List
                    ? sortie2List[sortie2List.length - 1 - index]
                    : built?.outer.waypoints[index]
                  return (
                    <tr key={`${point.ptIdent}-${index}`} className="border-t border-white/10 font-mono">
                      <td className="px-2 py-1">{point.originalName || point.ptIdent}</td>
                      <td className="px-2 py-1">{nameError ? '—' : center?.g1000Name}</td>
                      <td className="px-2 py-1">{nameError ? '—' : sortie1?.g1000Name}</td>
                      <td className="px-2 py-1">{nameError ? '—' : sortie2?.g1000Name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {faaNotes.length > 0 && (
            <ul className="text-xs text-cap-yellow list-disc pl-5 space-y-1">
              {faaNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-cap-yellow">
            Before loading: delete earlier flight plans and user waypoints from the G1000 (per DO policy). If the G1000 shows &apos;One or more user waypoints renamed&apos;, old waypoints are still stored. Delete them and reload.
          </p>
        </div>
      )}
      {!teamPlanDownload && !sortieReady && (
        <p className="text-sm text-cap-yellow">
          {missingSortieChoiceNotice()}{' '}
          <Link to={`/flight-plans/${flightPlanId}`} className="underline font-medium">
            Open this flight plan
          </Link>
        </p>
      )}
      {nameError && <p className="text-sm text-cap-yellow">{nameError}</p>}

      {manual && (
        <div className="space-y-2">
          <p className="text-sm text-cap-yellow">{manual.message}</p>
          {manual.details.length > 0 && (
            <ul className="text-xs text-white/80 list-disc pl-5 space-y-1">
              {manual.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              Left NM for every segment
              <input
                value={applyLeft}
                onChange={(event) => setApplyLeft(event.target.value)}
                inputMode="decimal"
                className="mt-1 block w-28 px-2 py-1 rounded bg-white text-gray-900"
              />
            </label>
            <label className="text-xs">
              Right NM for every segment
              <input
                value={applyRight}
                onChange={(event) => setApplyRight(event.target.value)}
                inputMode="decimal"
                className="mt-1 block w-28 px-2 py-1 rounded bg-white text-gray-900"
              />
            </label>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-white/15 hover:bg-white/25"
              onClick={() => {
                setRows(
                  rows.map((row) => ({
                    ...row,
                    left: applyLeft,
                    right: applyRight,
                    source: 'pilot',
                  }))
                )
              }}
            >
              Apply to every segment
            </button>
          </div>
          <div className="max-h-36 overflow-auto border border-white/15 rounded-lg">
            <table className="w-full text-xs">
              <thead className="text-left text-white/70">
                <tr>
                  <th className="px-2 py-1">Segment</th>
                  <th className="px-2 py-1">Left NM</th>
                  <th className="px-2 py-1">Right NM</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, -1).map((point, index) => {
                  const row = rows[index]
                  const nextPoint = points[index + 1]
                  const needsEntry = !row || row.left.trim() === '' || row.right.trim() === ''
                  const why = legEntryReason(row?.reason ?? null, row?.clause)
                  return (
                    <tr
                      key={`${point.ptIdent}-${index}`}
                      className={`border-t border-white/10 ${needsEntry ? 'bg-cap-yellow/25' : ''}`}
                    >
                      <td className="px-2 py-1 font-mono">
                        <div>
                          {point.ptIdent}–{nextPoint?.ptIdent}
                        </div>
                        {row?.source === 'pilot' && (
                          <div className="text-cap-yellow">entered by pilot</div>
                        )}
                        {needsEntry && why && <div className="text-cap-yellow">{why}</div>}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Left width ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                          value={row?.left ?? ''}
                          onChange={(event) => {
                            const next = rows.slice()
                            next[index] = {
                              left: event.target.value,
                              right: rows[index]?.right ?? '',
                              source: 'pilot',
                              reason: rows[index]?.reason ?? null,
                              clause: rows[index]?.clause ?? null,
                            }
                            setRows(next)
                          }}
                          className="w-20 px-2 py-1 rounded bg-white text-gray-900"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Right width ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                          value={row?.right ?? ''}
                          onChange={(event) => {
                            const next = rows.slice()
                            next[index] = {
                              left: rows[index]?.left ?? '',
                              right: event.target.value,
                              source: 'pilot',
                              reason: rows[index]?.reason ?? null,
                              clause: rows[index]?.clause ?? null,
                            }
                            setRows(next)
                          }}
                          className="w-20 px-2 py-1 rounded bg-white text-gray-900"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/70">Map: ultramarine centerline with point letters, white edges, yellow sortie tracks, blue arrows.</span>
        {route.kind === 'irvr' && (
          <button
            type="button"
            onClick={() => void reloadFaaWidths()}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-silver text-cap-ultramarine hover:bg-cap-yellow"
          >
            Reload FAA widths
          </button>
        )}
        <button
          type="button"
          disabled={!built || saving}
          onClick={() => void saveOffsetPlan()}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-yellow text-cap-ultramarine disabled:opacity-40"
        >
          Save
        </button>
        {dirty ? (
          <span className="text-xs text-cap-yellow">Unsaved changes</span>
        ) : (
          savedAt && <span className="text-xs text-white/80">Saved {formatOffsetSavedAt(savedAt)}</span>
        )}
        {teamPlanDownload
          ? ([1, 2] as const).map((number) => {
              const offer = teamSortieDownloadOffer(
                teamPlanDownload.team,
                number,
                publishedSortieWidthReady(
                  teamPlanDownload.team,
                  teamPlanDownload.points,
                  teamPlanDownload.legWidths,
                  number
                )
              )
              return (
                <SortieFileButton
                  key={number}
                  label={`Download sortie ${number} .fpl`}
                  enabled={offer.enabled}
                  title={offer.title}
                  onClick={() => {
                    if (!offer.enabled || !teamPlanDownload.legWidths) return
                    const file = buildTeamPlanSortieFile({
                      team: teamPlanDownload.team,
                      points: teamPlanDownload.points,
                      legWidths: teamPlanDownload.legWidths,
                      waypoints: teamPlanDownload.waypoints,
                      routeLabel: teamPlanDownload.routeLabel,
                      policy: teamPlanDownload.policy,
                      sortieNumber: number,
                    })
                    downloadSortieFpl(file.xml, file.filename)
                  }}
                />
              )
            })
          : ([1, 2] as const).map((number) => {
              const enabled = Boolean(built) && sortieReady && !nameError
              const title = !sortieReady ? missingSortieChoiceNotice() : nameError ?? undefined
              return (
                <SortieFileButton
                  key={number}
                  label={`Download sortie ${number}${number === 1 && sortie1SideLabel ? ` (${sortie1SideLabel})` : number === 2 && sortie2SideLabel ? ` (${sortie2SideLabel})` : ''} .fpl`}
                  enabled={enabled}
                  title={title}
                  onClick={() => downloadSortie(number)}
                />
              )
            })}
        {!built && rows.length > 0 && (
          <span className="text-xs text-cap-yellow">{downloadBlockReason(rows)}</span>
        )}
      </div>

      {built && built.flags.length > 0 && (
        <ul className="text-xs text-cap-yellow list-disc pl-5 space-y-1">
          {built.flags.map((flag) => (
            <li key={`${flag.side}-${flag.index}-${flag.reason}`}>{flag.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
