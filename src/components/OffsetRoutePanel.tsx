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
import { packedDownloadLabel, type TeamPlanTeam, type TeamRoutePoint } from '@/services/teamPlanRecord'
import {
  buildSortieOffsetFpl,
  missingSortieChoiceNotice,
  orderSortieTrack,
  type SortieSide,
} from '@/services/offsetRouteFpl'
import { singleAircrewSortieTrack } from '@/services/singleAircrewSpur'
import { assignG1000WaypointNames } from '@/utils/g1000WaypointName'
import { db, type AirportRecord, type FlightPlanCreationLoadMethod, type WaypointRecord } from '@/db/schema'
import {
  isSingleAircrewPlan,
  SINGLE_AIRCREW_MAP_LEGEND,
  SINGLE_AIRCREW_TRACK_LINE,
  visibleOffsetFlags,
} from '@/services/singleAircrewMap'
import {
  assessSavedOffsetPlan,
  blankTrackRecord,
  formatOffsetSavedAt,
  OFFSET_PLAN_VERSION,
  offsetFormIsDirty,
  offsetPlanFingerprint,
  offsetSequenceSignature,
  RESAVE_IN_MAP_VIEW,
  SPUR_PROPOSAL_VERSION,
  trackRecordFromLeg,
  type OffsetFreshnessInput,
  type SavedOffsetPlan,
  type TrackOffsetRecord,
} from '@/services/offsetPlanRecord'
import { setOffsetPlanLeaveGuard } from '@/services/offsetPlanLeaveGuard'
import {
  FAA_WIDTH_FALLBACK_NOTE,
  savedWidthsForPoints,
  teamPlanOwnsCorridor,
  teamPlanSpanWidths,
  teamPlanTrackSpacing,
} from '@/services/teamPlanCorridor'
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

type TrackDraft = { left: string; right: string }

function emptyTrack(): TrackDraft {
  return { left: '', right: '' }
}

function blankTracks(count: number): TrackDraft[] {
  return Array.from({ length: count }, () => emptyTrack())
}

/** Empty means the legacy halfway track. A typed value is the flown distance. */
function parseTrackField(text: string): number | null | 'invalid' {
  if (text.trim() === '') return null
  const nm = Number(text)
  if (!Number.isFinite(nm) || nm < 0) return 'invalid'
  return nm
}

function tracksFromSaved(plan: SavedOffsetPlan, count: number): TrackDraft[] {
  return Array.from({ length: count }, (_, index) => {
    const track = plan.trackOffsets?.[index] ?? blankTrackRecord()
    return {
      left: track.leftMode === 'explicit' && track.leftNm != null ? String(track.leftNm) : '',
      right: track.rightMode === 'explicit' && track.rightNm != null ? String(track.rightNm) : '',
    }
  })
}

function formKey(corridor: unknown, tracks: TrackDraft[]): string {
  return JSON.stringify({ corridor, tracks })
}

function typedCorridorNm(text: string): number | null | 'invalid' {
  if (text.trim() === '') return null
  const nm = Number(text)
  if (!Number.isFinite(nm) || nm < 0) return 'invalid'
  return nm
}

/** A hidden blank corridor uses the typed track offset. A saved corridor number is kept. */
export function legWidthFromEntry(
  row: { left: string; right: string },
  track: TrackDraft | undefined,
  singleAircrew: boolean
): OffsetLegWidth | null {
  const trackLeftNm = parseTrackField(track?.left ?? '')
  const trackRightNm = parseTrackField(track?.right ?? '')
  if (trackLeftNm === 'invalid' || trackRightNm === 'invalid') return null
  if (!singleAircrew) {
    const leftNm = Number(row.left)
    const rightNm = Number(row.right)
    if (!Number.isFinite(leftNm) || !Number.isFinite(rightNm) || leftNm < 0 || rightNm < 0) return null
    return { leftNm, rightNm, trackLeftNm, trackRightNm }
  }
  const leftTyped = typedCorridorNm(row.left)
  const rightTyped = typedCorridorNm(row.right)
  if (leftTyped === 'invalid' || rightTyped === 'invalid') return null
  const leftNm = leftTyped ?? (typeof trackLeftNm === 'number' ? trackLeftNm : null)
  const rightNm = rightTyped ?? (typeof trackRightNm === 'number' ? trackRightNm : null)
  if (leftNm == null || rightNm == null) return null
  return { leftNm, rightNm, trackLeftNm, trackRightNm }
}

function blankRows(count: number): WidthRow[] {
  return Array.from({ length: count }, () => emptyRow())
}

function applySavedPlan(
  plan: SavedOffsetPlan,
  setPublished: (legs: OffsetLegWidth[] | null) => void,
  setManual: (seed: ManualSeed | null) => void,
  setRows: (rows: WidthRow[]) => void,
  setTrackRows: (tracks: TrackDraft[]) => void
) {
  setTrackRows(tracksFromSaved(plan, plan.widths.length))
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
  creationLoadMethod?: FlightPlanCreationLoadMethod | null
  /** Undefined while the team-plan lookup is still running. Null when none is saved. */
  savedTeamPlan?: unknown
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
  const { flightPlanId, waypoints, departure, destination, sortie1Side, creationLoadMethod, savedTeamPlan, onGeometry, onLegWidths, teamPlanDownload } = props
  const singleAircrew =
    savedTeamPlan !== undefined && isSingleAircrewPlan({ creationLoadMethod }, savedTeamPlan)
  const teamCorridor = teamPlanOwnsCorridor(savedTeamPlan)
  const teamSpacing = teamPlanTrackSpacing(savedTeamPlan)
  const signature = offsetSequenceSignature(waypoints)
  const points = useMemo(() => pointsFrom(waypoints), [signature])
  const lockedLegs = useMemo(() => {
    const stored = teamPlanSpanWidths(savedTeamPlan)
    return stored ? savedWidthsForPoints(points, stored) : null
  }, [savedTeamPlan, points])
  const route = useMemo(() => routeOf(waypoints), [signature])
  const legCount = Math.max(0, points.length - 1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [published, setPublished] = useState<OffsetLegWidth[] | null>(null)
  const [manual, setManual] = useState<ManualSeed | null>(null)
  const [rows, setRows] = useState<WidthRow[]>([])
  const [trackRows, setTrackRows] = useState<TrackDraft[]>([])
  const [applyLeft, setApplyLeft] = useState('')
  const [applyRight, setApplyRight] = useState('')
  const [applyTrackLeft, setApplyTrackLeft] = useState('')
  const [applyTrackRight, setApplyTrackRight] = useState('')
  const [baseline, setBaseline] = useState<string | null>(null)
  const [savedRecord, setSavedRecord] = useState<SavedOffsetPlan | undefined>(undefined)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [sequenceMismatchAt, setSequenceMismatchAt] = useState<string | null>(null)
  const [legacySave, setLegacySave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [faaNotes, setFaaNotes] = useState<string[]>([])
  const [faaWidthFallback, setFaaWidthFallback] = useState(false)
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
    setRows([])
    setTrackRows(blankTracks(legCount))
    setLoadError(null)
    setSequenceMismatchAt(null)
    setLegacySave(false)
    setSavedRecord(undefined)
    setSavedAt(null)
    setBaseline(null)
    setFaaNotes([])
    setFaaWidthFallback(false)
    onGeometryRef.current(null)

    if (points.length < 2) return

    if (teamCorridor && lockedLegs && lockedLegs.length === legCount) {
      const tracks = blankTracks(legCount)
      setPublished(lockedLegs)
      setManual(null)
      setRows([])
      setTrackRows(tracks)
      setBaseline(formKey(lockedLegs, tracks))
      return
    }
    if (teamCorridor) setFaaWidthFallback(true)

    const seedManual = (message: string, details: string[], seeded: WidthRow[]) => {
      const tracks = blankTracks(seeded.length)
      setManual({ message, details, rows: seeded })
      setRows(seeded)
      setTrackRows(tracks)
      setBaseline(
        formKey(
          seeded.map((row) => ({ left: row.left, right: row.right })),
          tracks
        )
      )
    }

    async function load() {
      const saved = await db.offsetPlans.get(flightPlanId)
      if (cancelled) return
      const sequenceMatches = Boolean(saved && saved.sequenceSignature === signature)
      if (!teamCorridor && !ignoreSavedRef.current && saved && sequenceMatches) {
        applySavedPlan(saved, setPublished, setManual, setRows, setTrackRows)
        setSavedRecord(saved)
        setSavedAt(saved.savedAt)
        setLegacySave(saved.planVersion !== OFFSET_PLAN_VERSION || !saved.fingerprint)
        const corridorKey =
          saved.mode === 'published'
            ? saved.widths
            : saved.widths.map((width) => ({
                left: String(width.leftNm),
                right: String(width.rightNm),
              }))
        setBaseline(formKey(corridorKey, tracksFromSaved(saved, saved.widths.length)))
        return
      }

      if (saved && !sequenceMatches) {
        setSequenceMismatchAt(saved.savedAt)
        setSavedRecord(saved)
        setLegacySave(saved.planVersion !== OFFSET_PLAN_VERSION || !saved.fingerprint)
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
          const tracks = blankTracks(legs.length)
          setPublished(legs)
          setTrackRows(tracks)
          setBaseline(formKey(legs, tracks))
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
  }, [signature, legCount, points, route, flightPlanId, reloadNonce, teamCorridor, lockedLegs])

  const spacingFirst = teamSpacing?.firstOffsetNm ?? null
  useEffect(() => {
    if (spacingFirst == null || legCount === 0) return
    const text = String(spacingFirst)
    setTrackRows((current) => {
      if (current.length === legCount && current.every((row) => row.left === text && row.right === text)) return current
      return Array.from({ length: legCount }, () => ({ left: text, right: text }))
    })
  }, [spacingFirst, legCount, published, manual])

  const trackError = trackRows.some(
    (track) => parseTrackField(track.left) === 'invalid' || parseTrackField(track.right) === 'invalid'
  )
    ? 'Track offset must be a finite number of nautical miles, zero or greater. Leave a box blank to fly halfway to the corridor edge.'
    : null

  const activeWidths = useMemo(() => {
    const tracks = trackRows.length === legCount ? trackRows : blankTracks(legCount)
    if (published) {
      if (published.length !== legCount) return null
      const parsed = published.map((leg, index) => {
        const trackLeftNm = parseTrackField(tracks[index]?.left ?? '')
        const trackRightNm = parseTrackField(tracks[index]?.right ?? '')
        if (trackLeftNm === 'invalid' || trackRightNm === 'invalid') return null
        return { ...leg, trackLeftNm, trackRightNm }
      })
      if (parsed.some((leg) => leg == null)) return null
      return parsed as OffsetLegWidth[]
    }
    if (!manual || rows.length !== legCount) return null
    const parsed = rows.map((row, index) => legWidthFromEntry(row, tracks[index], singleAircrew))
    if (parsed.some((leg) => leg == null)) return null
    return parsed as OffsetLegWidth[]
  }, [published, manual, rows, trackRows, legCount, singleAircrew])

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
      corridorLeft: singleAircrew ? [] : built.corridorLeft,
      corridorRight: singleAircrew ? [] : built.corridorRight,
      flags: visibleOffsetFlags(built.flags, singleAircrew, points),
    })
  }, [built, singleAircrew])

  const corridorKey = published
    ? published
    : rows.map((row) => ({ left: row.left, right: row.right }))
  const dirty = !teamCorridor && baseline != null && offsetFormIsDirty(baseline, formKey(corridorKey, trackRows))
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    setOffsetPlanLeaveGuard(() => {
      if (teamCorridor || !dirtyRef.current) return true
      return window.confirm('Unsaved changes. Leave without saving this offset plan?')
    })
    return () => setOffsetPlanLeaveGuard(null)
  }, [teamCorridor])

  useEffect(() => {
    if (!dirty || teamCorridor) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Unsaved changes'
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty, teamCorridor])

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
      const trackOffsets: TrackOffsetRecord[] = activeWidths.map((width) => trackRecordFromLeg(width))
      const freshness: OffsetFreshnessInput = {
        waypoints,
        widths: activeWidths.map((width) => ({ leftNm: width.leftNm, rightNm: width.rightNm })),
        trackOffsets,
        sortie1Side: sortie1Side === 'inner' || sortie1Side === 'outer' ? sortie1Side : null,
        departureIdent: departure?.identifier ?? null,
        destinationIdent: destination?.identifier ?? null,
        spurDecision: 'unset',
        spurProposalVersion: SPUR_PROPOSAL_VERSION,
      }
      const record: SavedOffsetPlan = {
        flightPlanId,
        savedAt: new Date().toISOString(),
        sequenceSignature: signature,
        widths: freshness.widths,
        mode: published ? 'published' : 'manual',
        sources: published ? null : rows.map((row) => row.source),
        manualMessage: manual?.message ?? null,
        inner: built.inner.waypoints,
        outer: built.outer.waypoints,
        corridorLeft: built.corridorLeft,
        corridorRight: built.corridorRight,
        flags: built.flags,
        planVersion: OFFSET_PLAN_VERSION,
        fingerprint: offsetPlanFingerprint(freshness),
        trackOffsets,
        sortie1Side: freshness.sortie1Side,
        departureIdent: freshness.departureIdent,
        destinationIdent: freshness.destinationIdent,
        spurDecision: 'unset',
        spurProposalVersion: SPUR_PROPOSAL_VERSION,
      }
      await db.offsetPlans.put(record)
      setSavedRecord(record)
      setSavedAt(record.savedAt)
      setLegacySave(false)
      setSequenceMismatchAt(null)
      setBaseline(formKey(published ? record.widths : corridorKey, trackRows))
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
    if (singleAircrew) {
      return singleAircrewSortieTrack({
        centerline: points,
        inner: built.inner.waypoints,
        outer: built.outer.waypoints,
        sortie1Side,
        sortieNumber,
      })
    }
    return orderSortieTrack({
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side,
      sortieNumber,
    })
  }

  const sortie1List = sortie1Side ? sortieWaypoints(1)?.waypoints : null
  const sortie2List = sortie1Side ? sortieWaypoints(2)?.waypoints : null
  const nameRowCount = singleAircrew
    ? Math.max(points.length, sortie1List?.length ?? 0, sortie2List?.length ?? 0)
    : points.length

  const exportFreshness: OffsetFreshnessInput | null = activeWidths
    ? {
        waypoints,
        widths: activeWidths.map((width) => ({ leftNm: width.leftNm, rightNm: width.rightNm })),
        trackOffsets: activeWidths.map((width) => trackRecordFromLeg(width)),
        sortie1Side: sortie1Side === 'inner' || sortie1Side === 'outer' ? sortie1Side : null,
        departureIdent: departure?.identifier ?? null,
        destinationIdent: destination?.identifier ?? null,
        spurDecision: 'unset',
        spurProposalVersion: SPUR_PROPOSAL_VERSION,
      }
    : null
  const exportDecision = exportFreshness
    ? assessSavedOffsetPlan(savedRecord, exportFreshness)
    : ({ status: 'none' } as const)
  const offsetExportReady = exportDecision.status === 'match' && !dirty && !trackError
  const offsetExportHold = offsetExportReady
    ? null
    : savedRecord || sequenceMismatchAt
      ? RESAVE_IN_MAP_VIEW
      : 'Save the offset plan in Map View before downloading.'

  function downloadSortie(sortieNumber: 1 | 2) {
    if (!offsetExportReady || !savedRecord || !sortieReady || !sortie1Side || nameError) return
    const ordered = singleAircrew
      ? singleAircrewSortieTrack({
          centerline: points,
          inner: savedRecord.inner as OffsetRoutePoint[],
          outer: savedRecord.outer as OffsetRoutePoint[],
          sortie1Side,
          sortieNumber,
        })
      : orderSortieTrack({
          inner: savedRecord.inner as OffsetRoutePoint[],
          outer: savedRecord.outer as OffsetRoutePoint[],
          sortie1Side,
          sortieNumber,
        })
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
        {teamCorridor && teamSpacing && (
          <>
            <p className="text-sm text-white/80">
              Corridor widths and track offsets are read-only. First track {teamSpacing.firstOffsetNm} NM, then every{' '}
              {teamSpacing.stepNm} NM. The saved team plan is used instead of a map offset record.
            </p>
            <Link
              to={`/coordinator/survey?plan=${flightPlanId}`}
              className="text-sm font-medium text-cap-yellow underline"
            >
              Edit in Team Dispatch
            </Link>
          </>
        )}
        {teamCorridor && faaWidthFallback && !loading && (
          <p className="text-sm text-white/80">{FAA_WIDTH_FALLBACK_NOTE}</p>
        )}
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
          {RESAVE_IN_MAP_VIEW} Saved offsets from {formatOffsetSavedAt(sequenceMismatchAt)} were built
          for a different waypoint sequence. They were not applied.
        </p>
      )}
      {!sequenceMismatchAt && legacySave && (
        <p className="text-sm text-cap-yellow">
          {RESAVE_IN_MAP_VIEW} This save has no track-offset fingerprint, so its stored coordinates stay
          off the download buttons.
        </p>
      )}
      {trackError && <p className="text-sm text-cap-yellow">{trackError}</p>}

      {namesOpen && !teamCorridor && (
        <div id="offset-flight-plan-names" className="space-y-2">
          <p className="text-xs text-white/75">
            Inner is the inside of the route&apos;s curve. Outer is the outside. A blank track offset flies
            halfway from the centerline to the corridor edge. A filled-in track offset is the flown
            distance, and it may equal the corridor width. Turns and mitered corners can fall outside
            the corridor. Names below are in the same flight order as the sortie file.
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
                {Array.from({ length: nameRowCount }, (_, index) => {
                  const point = points[index]
                  const center = centerlineNames[index]
                  const sortie1 = sortie1List ? sortie1List[index] : built?.inner.waypoints[index]
                  const sortie2 = sortie2List
                    ? singleAircrew
                      ? sortie2List[index]
                      : sortie2List[sortie2List.length - 1 - index]
                    : built?.outer.waypoints[index]
                  return (
                    <tr key={`name-${index}`} className="border-t border-white/10 font-mono">
                      <td className="px-2 py-1">{point ? point.originalName || point.ptIdent : ''}</td>
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
        <fieldset disabled={teamCorridor} className="space-y-2 border-0 p-0 m-0 min-w-0">
          {!singleAircrew && <p className="text-sm text-cap-yellow">{manual.message}</p>}
          {!singleAircrew && manual.details.length > 0 && (
            <ul className="text-xs text-white/80 list-disc pl-5 space-y-1">
              {manual.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            {!singleAircrew && (
              <>
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
                  Apply corridor to every segment
                </button>
              </>
            )}
            <label className="text-xs">
              Track offset left NM for every segment
              <input
                value={applyTrackLeft}
                onChange={(event) => setApplyTrackLeft(event.target.value)}
                inputMode="decimal"
                aria-label="Track offset left NM for every segment"
                className="mt-1 block w-28 px-2 py-1 rounded bg-white text-gray-900"
              />
            </label>
            <label className="text-xs">
              Track offset right NM for every segment
              <input
                value={applyTrackRight}
                onChange={(event) => setApplyTrackRight(event.target.value)}
                inputMode="decimal"
                aria-label="Track offset right NM for every segment"
                className="mt-1 block w-28 px-2 py-1 rounded bg-white text-gray-900"
              />
            </label>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-white/15 hover:bg-white/25"
              onClick={() => {
                setTrackRows(rows.map(() => ({ left: applyTrackLeft, right: applyTrackRight })))
              }}
            >
              Apply track offset to every segment
            </button>
          </div>
          <p className="text-xs text-white/75">
            {singleAircrew
              ? SINGLE_AIRCREW_TRACK_LINE
              : 'Corridor half-width is the white edge on each side. Track offset is the yellow flown path. Leave track offset blank to keep the halfway path. A track offset equal to the corridor width is allowed. Corners can still fall outside the corridor.'}
          </p>
          <div className="max-h-36 overflow-auto border border-white/15 rounded-lg">
            <table className="w-full text-xs">
              <thead className="text-left text-white/70">
                <tr>
                  <th className="px-2 py-1">Segment</th>
                  {!singleAircrew && <th className="px-2 py-1">Corridor left NM</th>}
                  {!singleAircrew && <th className="px-2 py-1">Corridor right NM</th>}
                  <th className="px-2 py-1">Track offset left NM</th>
                  <th className="px-2 py-1">Track offset right NM</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, -1).map((point, index) => {
                  const row = rows[index]
                  const nextPoint = points[index + 1]
                  const needsEntry =
                    !singleAircrew && (!row || row.left.trim() === '' || row.right.trim() === '')
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
                        {row?.source === 'pilot' && !singleAircrew && (
                          <div className="text-cap-yellow">entered by pilot</div>
                        )}
                        {needsEntry && why && <div className="text-cap-yellow">{why}</div>}
                      </td>
                      {!singleAircrew && (
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
                      )}
                      {!singleAircrew && (
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
                      )}
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Track offset left ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                          value={trackRows[index]?.left ?? ''}
                          onChange={(event) => {
                            const next = trackRows.slice()
                            next[index] = { left: event.target.value, right: trackRows[index]?.right ?? '' }
                            setTrackRows(next)
                          }}
                          className="w-20 px-2 py-1 rounded bg-white text-gray-900"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Track offset right ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                          value={trackRows[index]?.right ?? ''}
                          onChange={(event) => {
                            const next = trackRows.slice()
                            next[index] = { left: trackRows[index]?.left ?? '', right: event.target.value }
                            setTrackRows(next)
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
        </fieldset>
      )}

      {published && (
        <fieldset disabled={teamCorridor} className="space-y-2 border-0 p-0 m-0 min-w-0">
          <p className="text-xs text-white/75">
            {singleAircrew
              ? SINGLE_AIRCREW_TRACK_LINE
              : 'Corridor half-width comes from the published width. Track offset is the yellow flown path. A track offset equal to the corridor width is allowed. Corners can still fall outside the corridor.'}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              Track offset left NM for every segment
              <input
                value={applyTrackLeft}
                onChange={(event) => setApplyTrackLeft(event.target.value)}
                inputMode="decimal"
                aria-label="Track offset left NM for every segment"
                className="mt-1 block w-28 px-2 py-1 rounded bg-white text-gray-900"
              />
            </label>
            <label className="text-xs">
              Track offset right NM for every segment
              <input
                value={applyTrackRight}
                onChange={(event) => setApplyTrackRight(event.target.value)}
                inputMode="decimal"
                aria-label="Track offset right NM for every segment"
                className="mt-1 block w-28 px-2 py-1 rounded bg-white text-gray-900"
              />
            </label>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-white/15 hover:bg-white/25"
              onClick={() => setTrackRows(published.map(() => ({ left: applyTrackLeft, right: applyTrackRight })))}
            >
              Apply track offset to every segment
            </button>
          </div>
          <div className="max-h-36 overflow-auto border border-white/15 rounded-lg">
            <table className="w-full text-xs">
              <thead className="text-left text-white/70">
                <tr>
                  <th className="px-2 py-1">Segment</th>
                  <th className="px-2 py-1">Track offset left NM</th>
                  <th className="px-2 py-1">Track offset right NM</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, -1).map((point, index) => {
                  const nextPoint = points[index + 1]
                  return (
                    <tr key={`track-${point.ptIdent}-${index}`} className="border-t border-white/10">
                      <td className="px-2 py-1 font-mono">
                        {point.ptIdent}–{nextPoint?.ptIdent}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Track offset left ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                          value={trackRows[index]?.left ?? ''}
                          onChange={(event) => {
                            const next = trackRows.slice()
                            next[index] = { left: event.target.value, right: trackRows[index]?.right ?? '' }
                            setTrackRows(next)
                          }}
                          className="w-20 px-2 py-1 rounded bg-white text-gray-900"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Track offset right ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                          value={trackRows[index]?.right ?? ''}
                          onChange={(event) => {
                            const next = trackRows.slice()
                            next[index] = { left: trackRows[index]?.left ?? '', right: event.target.value }
                            setTrackRows(next)
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
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/70">
          {singleAircrew
            ? SINGLE_AIRCREW_MAP_LEGEND
            : 'Map: ultramarine centerline with point letters, white edges, yellow sortie tracks, blue arrows.'}
        </span>
        {route.kind === 'irvr' && !singleAircrew && !teamCorridor && (
          <button
            type="button"
            onClick={() => void reloadFaaWidths()}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-silver text-cap-ultramarine hover:bg-cap-yellow"
          >
            Reload FAA widths
          </button>
        )}
        {!teamCorridor && (
          <button
            type="button"
            disabled={!built || saving}
            onClick={() => void saveOffsetPlan()}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-yellow text-cap-ultramarine disabled:opacity-40"
          >
            Save
          </button>
        )}
        {dirty ? (
          <span className="text-xs text-cap-yellow">Unsaved changes</span>
        ) : (
          savedAt && <span className="text-xs text-white/80">Saved {formatOffsetSavedAt(savedAt)}</span>
        )}
        {teamPlanDownload && !singleAircrew
          ? (teamPlanDownload.team.packedSorties ?? []).map((sortie) => sortie.number).map((number) => {
              const packed = teamPlanDownload.team.packedSorties?.find((sortie) => sortie.number === number)
              if (packed && (packed.returnHomeOnly || packed.offsetsNm.length === 0)) {
                return (
                  <span key={number} className="text-sm text-gray-700">
                    Ferry only, no survey file
                  </span>
                )
              }
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
                  label={
                    packed
                      ? packedDownloadLabel(
                          teamPlanDownload.team.departure?.identifier ?? 'crew',
                          packed,
                          teamPlanDownload.points
                        )
                      : `Download sortie ${number} .fpl`
                  }
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
              const enabled = Boolean(built) && sortieReady && !nameError && offsetExportReady
              const title = !sortieReady
                ? missingSortieChoiceNotice()
                : nameError ?? offsetExportHold ?? undefined
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
        {!singleAircrew && !built && rows.length > 0 && (
          <span className="text-xs text-cap-yellow">{downloadBlockReason(rows)}</span>
        )}
        {!teamPlanDownload && offsetExportHold && (
          <span className="text-xs text-cap-yellow">{offsetExportHold}</span>
        )}
      </div>

      {built && visibleOffsetFlags(built.flags, singleAircrew, points).length > 0 && (
        <ul className="text-xs text-cap-yellow list-disc pl-5 space-y-1">
          {visibleOffsetFlags(built.flags, singleAircrew, points).map((flag) => (
            <li key={`${flag.side}-${flag.index}-${flag.reason}`}>{flag.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
