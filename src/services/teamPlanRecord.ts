import { buildCoordinatorCrewOffsetFile } from '@/services/coordinatorOffsetExport'
import {
  emptyCrewOverlay,
  type CrewOverlayId,
  type CrewSerpentine,
  type SerpentinePass,
} from '@/services/crewSerpentineOverlay'
import type { SortieSide } from '@/services/offsetRouteFpl'
import type { OffsetLegWidth } from '@survey-planning/offsetRoutePlan.js'
import { laneWaypointName } from '@survey-planning/g1000Names.js'
import { buildOffsetTrack, reverseOffsetTrack, routeCurveSide } from '@survey-planning/offsetRoutePlan.js'
import { planSideLanes } from '@survey-planning/sortieLanePlan.js'

export const NO_TEAM_PLAN_NOTE = 'No team plan saved. Set up teams in Team Dispatch.'
export const NO_SEGMENT_NOTE = 'No segment assigned.'
export const NO_SORTIE_SIDE_NOTE = 'No Sortie 1 side set.'
export const NO_SEGMENT_WIDTH_NOTE = 'No published width for this segment.'

export type TeamPlanAirport = {
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

/** One sortie on a saved team. The offset track is built later by the shared planner. */
export type TeamPlanSortie = {
  number: 1 | 2
  side: SortieSide | null
  order: 'forward' | 'reverse'
}

export type TeamPlanTeam = {
  id: CrewOverlayId
  label: string
  departure: TeamPlanAirport | null
  /** Defaults to the home airport when the console does not set a different landing field. */
  landing: TeamPlanAirport | null
  segmentFrom: string | null
  segmentTo: string | null
  startPoint: string | null
  sorties: TeamPlanSortie[]
  /** Set when this team lands Sortie 1 at a refuel airport and departs Sortie 2 from there. */
  refuelStop?: TeamPlanAirport | null
}

/** One record per flight plan. Replaced on the next save. */
export type SavedTeamPlan = {
  flightPlanId: string
  savedAt: string
  /** First parallel offset, in NM. Older records omit this and use 3. */
  firstOffsetNm?: number
  /** Spacing between lanes, in NM. Older records omit this and use 6. */
  stepNm?: number
  /** A comparison boundary that is not a published waypoint. Older records omit this. */
  routeInsert?: {
    afterIdent: string
    alongNm: number
    point: { ptIdent: string; lat: number; lon: number; g1000Name?: string; originalName?: string }
  } | null
  teams: TeamPlanTeam[]
}

export type SortieLaneSummary = {
  number: 1 | 2
  side: SortieSide
  surveySide: 'left' | 'right'
  lanes: number
  waypoints: number
  distanceNm: number
  offsetsNm: number[]
  routeSequence: string[]
  startAt: string | null
}

export function formatSortieHeader(
  summary: {
    number: number
    lanes: number
    waypoints: number
    distanceNm: number
  },
  refuelIdent?: string | null
): string {
  const base = `Sortie ${summary.number}: ${summary.lanes} lanes, ${summary.waypoints} waypoints, ${summary.distanceNm} NM`
  return refuelIdent ? `${base} (refuel at ${refuelIdent})` : base
}

export const ONE_SORTIE_TOOLTIP = 'This team flies one sortie'

export type MapSortieButton = {
  number: 1 | 2
  enabled: boolean
  /** Present when the button is disabled, so the control can explain why. */
  title?: string
}

/** Sortie 2 is available when the saved team record lists a second sortie. */
export function mapSortieButtons(sorties: Array<{ number: number }>): MapSortieButton[] {
  const hasSecond = sorties.some((sortie) => sortie.number === 2)
  return [
    { number: 1, enabled: true },
    hasSecond
      ? { number: 2, enabled: true }
      : { number: 2, enabled: false, title: ONE_SORTIE_TOOLTIP },
  ]
}

export type TeamRoutePoint = {
  ptIdent: string
  originalName: string
  lat: number
  lon: number
  g1000Name?: string
}

export type TeamPlanStore = {
  get(flightPlanId: string): Promise<SavedTeamPlan | undefined>
  put(plan: SavedTeamPlan): Promise<void>
}

export function memoryTeamPlanStore(): TeamPlanStore {
  const records = new Map<string, SavedTeamPlan>()
  return {
    async get(flightPlanId) {
      const found = records.get(flightPlanId)
      return found ? structuredClone(found) : undefined
    },
    async put(plan) {
      records.set(plan.flightPlanId, structuredClone(plan))
    },
  }
}

function sameIdent(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
}

/** Landing falls back to the home airport. A missing home stays blank. */
export function landingAirportFor(
  departure: TeamPlanAirport | null,
  landing: TeamPlanAirport | null
): TeamPlanAirport | null {
  return landing ?? departure
}

export function sortiesForSide(side: SortieSide | null): TeamPlanSortie[] {
  return [
    { number: 1, side, order: 'forward' },
    { number: 2, side: side === 'inner' ? 'outer' : side === 'outer' ? 'inner' : null, order: 'reverse' },
  ]
}

export function draftTeamPlan(opts: {
  flightPlanId: string
  savedAt: string
  firstOffsetNm?: number
  stepNm?: number
  crews: Array<{
    id: CrewOverlayId
    label: string
    departure: TeamPlanAirport | null
    landing?: TeamPlanAirport | null
    refuelStop?: TeamPlanAirport | null
  }>
  sides: Record<string, SortieSide | null | undefined>
  segments: Record<string, { from: string; to: string; start: string } | null | undefined>
}): SavedTeamPlan {
  return {
    flightPlanId: opts.flightPlanId,
    savedAt: opts.savedAt,
    ...(opts.firstOffsetNm != null ? { firstOffsetNm: opts.firstOffsetNm } : {}),
    ...(opts.stepNm != null ? { stepNm: opts.stepNm } : {}),
    teams: opts.crews.map((crew) => {
      const segment = opts.segments[crew.id] ?? null
      const departure = crew.departure
      return {
        id: crew.id,
        label: crew.label,
        departure,
        landing: landingAirportFor(departure, crew.refuelStop ?? crew.landing ?? null),
        refuelStop: crew.refuelStop ?? null,
        segmentFrom: segment?.from ?? null,
        segmentTo: segment?.to ?? null,
        startPoint: segment?.start ?? null,
        sorties: sortiesForSide(opts.sides[crew.id] ?? null),
      }
    }),
  }
}

export function sliceTeamSegment(
  points: TeamRoutePoint[],
  widths: Array<OffsetLegWidth | null>,
  team: TeamPlanTeam
): { points: TeamRoutePoint[]; widths: OffsetLegWidth[] } | { error: string } {
  if (!team.segmentFrom || !team.segmentTo) return { error: NO_SEGMENT_NOTE }
  const start = points.findIndex((point) => sameIdent(point.ptIdent, team.segmentFrom))
  const end = points.findIndex((point) => sameIdent(point.ptIdent, team.segmentTo))
  if (start < 0 || end < 0 || end <= start) return { error: NO_SEGMENT_NOTE }
  const slicedPoints = points.slice(start, end + 1)
  const slicedWidths = widths.slice(start, end)
  if (slicedWidths.length !== slicedPoints.length - 1 || slicedWidths.some((leg) => leg == null)) {
    return { error: NO_SEGMENT_WIDTH_NOTE }
  }
  return { points: slicedPoints, widths: slicedWidths as OffsetLegWidth[] }
}

export function sortie1Side(team: TeamPlanTeam): SortieSide | null {
  return team.sorties.find((sortie) => sortie.number === 1)?.side ?? null
}

export function buildTeamSortieFile(opts: {
  team: TeamPlanTeam
  routeLabel: string
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null>
  sortieNumber: 1 | 2
}): { xml: string; filename: string; routeName: string; userNames: string[] } | { error: string } {
  const side = sortie1Side(opts.team)
  if (!side) return { error: NO_SORTIE_SIDE_NOTE }
  const slice = sliceTeamSegment(opts.points, opts.legWidths, opts.team)
  if ('error' in slice) return slice
  return buildCoordinatorCrewOffsetFile({
    routeLabel: opts.routeLabel,
    points: slice.points,
    legWidths: slice.widths,
    shapePoints: opts.points,
    sortie1Side: side,
    sortieNumber: opts.sortieNumber,
    departure: opts.team.departure,
    destination: opts.team.landing,
  })
}

function geographicSide(
  side: SortieSide,
  route: Array<{ lat: number; lon: number; ptIdent?: string }>
): 'left' | 'right' {
  const curve = routeCurveSide(route)
  return side === 'inner' ? curve.innerSide : curve.outerSide
}

function ferryForSortie(team: TeamPlanTeam, number: 1 | 2): {
  departure: TeamPlanAirport | null
  landing: TeamPlanAirport | null
} {
  const home = team.departure
  if (team.refuelStop) {
    if (number === 1) return { departure: home, landing: team.refuelStop }
    return { departure: team.refuelStop, landing: home }
  }
  const land = team.landing ?? team.departure
  if (number === 2) return { departure: land, landing: home }
  return { departure: home, landing: land }
}

export type TeamOffsetWaypoint = {
  g1000Name: string
  ptIdent: string
  lat: number
  lon: number
  offsetNm: number
}

type OffsetLane = {
  offsetNm: number
  direction?: string
  waypoints: Array<{ ptIdent: string; originalName?: string; lat: number; lon: number }>
}

function placesApart(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * 60
  const dLon = (b.lon - a.lon) * 60 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/**
 * A width change can offset the same published point twice on one lane.
 * The second place keeps the side letter last: B1I, then B12I.
 */
function resolveLaneName(
  name: string,
  point: { lat: number; lon: number },
  seen: Map<string, { lat: number; lon: number }>
): { name: string } | { error: string } {
  const prior = seen.get(name)
  if (!prior || placesApart(prior, point) <= 0.1) return { name }
  const letter = name.slice(-1)
  const stem = name.slice(0, -1)
  for (let visit = 2; visit <= 9; visit++) {
    const candidate = `${stem}${visit}${letter}`
    if (candidate.length > 6) break
    const taken = seen.get(candidate)
    if (!taken || placesApart(taken, point) <= 0.1) return { name: candidate }
  }
  return { error: `G1000 name ${name} would be used for two different places.` }
}

/** Lane 1 is the lane nearest the centerline. The same offset keeps that number on every sortie. */
export function nameOffsetLanePoints(
  lanes: OffsetLane[],
  side: SortieSide
): { waypoints: TeamOffsetWaypoint[] } | { error: string } {
  const ranks = [...new Set(lanes.map((lane) => lane.offsetNm))].sort((a, b) => a - b)
  const waypoints: TeamOffsetWaypoint[] = []
  const seen = new Map<string, { lat: number; lon: number }>()
  for (const lane of lanes) {
    const laneNumber = ranks.indexOf(lane.offsetNm) + 1
    for (const point of lane.waypoints) {
      const named = laneWaypointName(point.originalName || point.ptIdent, side, laneNumber)
      if (named.error || !named.name) return { error: named.error || 'G1000 name was not created.' }
      const resolved = resolveLaneName(named.name, point, seen)
      if ('error' in resolved) return resolved
      seen.set(resolved.name, { lat: point.lat, lon: point.lon })
      waypoints.push({
        g1000Name: resolved.name,
        ptIdent: point.ptIdent,
        lat: point.lat,
        lon: point.lon,
        offsetNm: lane.offsetNm,
      })
    }
  }
  return { waypoints }
}

/** Offset-coordinate waypoints for one side of a segment, in serpentine order. */
export function offsetSortieWaypoints(opts: {
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null>
  fromPt: string
  toPt: string
  side: SortieSide
  departure: { latitude: number; longitude: number; identifier: string }
  landing: { latitude: number; longitude: number; identifier: string }
  firstOffsetNm?: number
  stepNm?: number
  offsets?: number[]
}): { waypoints: TeamOffsetWaypoint[] } | { error: string } {
  const slice = sliceTeamSegment(opts.points, opts.legWidths, {
    segmentFrom: opts.fromPt,
    segmentTo: opts.toPt,
  } as TeamPlanTeam)
  if ('error' in slice) return slice
  const planned = planSideLanes({
    points: slice.points,
    legWidths: slice.widths,
    side: geographicSide(opts.side, opts.points),
    policy: {
      ...(opts.firstOffsetNm != null ? { firstOffsetNm: opts.firstOffsetNm } : {}),
      ...(opts.stepNm != null ? { stepNm: opts.stepNm } : {}),
    },
    departure: {
      lat: opts.departure.latitude,
      lon: opts.departure.longitude,
      identifier: opts.departure.identifier,
    },
    landing: {
      lat: opts.landing.latitude,
      lon: opts.landing.longitude,
      identifier: opts.landing.identifier,
    },
  })
  let lanes: OffsetLane[] = planned.lanes
  if (opts.offsets && opts.offsets.length > 0) {
    const geo = geographicSide(opts.side, opts.points)
    const forwardFirst = planned.lanes.length === 0 || planned.lanes[0].direction === 'forward'
    lanes = opts.offsets.map((offsetNm, index) => {
      const track = buildOffsetTrack(
        slice.points,
        slice.widths.map(() => offsetNm),
        slice.widths.map((width) => (geo === 'left' ? width.leftNm : width.rightNm)),
        geo
      )
      const forward = forwardFirst ? index % 2 === 0 : index % 2 !== 0
      return {
        offsetNm,
        direction: forward ? 'forward' : 'reverse',
        waypoints: forward ? track.waypoints : reverseOffsetTrack(track.waypoints),
      }
    })
  }
  if (lanes.length === 0) return { error: planned.note || 'No offset lanes for this sortie.' }
  return nameOffsetLanePoints(lanes, opts.side)
}

/** Offset-coordinate waypoints for one sortie, in serpentine order, with the ferry airports. */
export function teamSortieOffsetRoute(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null>
  sortieNumber: 1 | 2
  firstOffsetNm?: number
  stepNm?: number
}):
  | {
      side: SortieSide
      departure: TeamPlanAirport
      landing: TeamPlanAirport
      waypoints: TeamOffsetWaypoint[]
    }
  | { error: string } {
  const sortie = opts.team.sorties.find((item) => item.number === opts.sortieNumber)
  if (!sortie?.side) return { error: NO_SORTIE_SIDE_NOTE }
  if (!opts.team.segmentFrom || !opts.team.segmentTo) return { error: NO_SEGMENT_NOTE }
  const ferry = ferryForSortie(opts.team, opts.sortieNumber)
  if (!ferry.departure || !ferry.landing) return { error: 'No departure airport set.' }
  const named = offsetSortieWaypoints({
    points: opts.points,
    legWidths: opts.legWidths,
    fromPt: opts.team.segmentFrom,
    toPt: opts.team.segmentTo,
    side: sortie.side,
    departure: ferry.departure,
    landing: ferry.landing,
    firstOffsetNm: opts.firstOffsetNm,
    stepNm: opts.stepNm,
  })
  if ('error' in named) return named
  return { side: sortie.side, departure: ferry.departure, landing: ferry.landing, waypoints: named.waypoints }
}

export function drawSavedTeam(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null> | null
  firstOffsetNm?: number
  stepNm?: number
}): { overlay: CrewSerpentine; notes: string[]; sorties: SortieLaneSummary[] } {
  const notes: string[] = []
  if (!opts.team.departure) notes.push('No departure airport set.')
  if (!opts.team.landing) notes.push('No landing airport set.')
  if (!opts.team.segmentFrom || !opts.team.segmentTo) notes.push(NO_SEGMENT_NOTE)
  const side = sortie1Side(opts.team)
  if (!side) notes.push(NO_SORTIE_SIDE_NOTE)
  if (!opts.legWidths) notes.push(NO_SEGMENT_WIDTH_NOTE)
  const blocked = notes.some(
    (note) => note === NO_SEGMENT_NOTE || note === NO_SORTIE_SIDE_NOTE || note === NO_SEGMENT_WIDTH_NOTE
  )
  if (blocked || !opts.legWidths || !side) {
    const overlay = emptyCrewOverlay(opts.team.id, opts.team.label)
    overlay.airport = opts.team.departure?.identifier ?? null
    return { overlay, notes, sorties: [] }
  }
  const slice = sliceTeamSegment(opts.points, opts.legWidths, opts.team)
  if ('error' in slice) {
    const overlay = emptyCrewOverlay(opts.team.id, opts.team.label)
    overlay.airport = opts.team.departure?.identifier ?? null
    return { overlay, notes: [slice.error], sorties: [] }
  }

  const policy = {
    ...(opts.firstOffsetNm != null ? { firstOffsetNm: opts.firstOffsetNm } : {}),
    ...(opts.stepNm != null ? { stepNm: opts.stepNm } : {}),
  }
  const passes: SerpentinePass[] = []
  const sorties: SortieLaneSummary[] = []
  for (const sortie of opts.team.sorties) {
    if (!sortie.side) continue
    const ferry = ferryForSortie(opts.team, sortie.number)
    const planned = planSideLanes({
      points: slice.points,
      legWidths: slice.widths,
      side: geographicSide(sortie.side, opts.points),
      policy,
      departure: ferry.departure
        ? { lat: ferry.departure.latitude, lon: ferry.departure.longitude, identifier: ferry.departure.identifier }
        : null,
      landing: ferry.landing
        ? { lat: ferry.landing.latitude, lon: ferry.landing.longitude, identifier: ferry.landing.identifier }
        : null,
    })
    if (planned.note && planned.lanes.length === 0) notes.push(planned.note)
    const named = nameOffsetLanePoints(planned.lanes, sortie.side)
    if ('error' in named) {
      notes.push(named.error)
    } else {
      let cursor = 0
      for (const lane of planned.lanes) {
        const slice = named.waypoints.slice(cursor, cursor + lane.waypoints.length)
        cursor += lane.waypoints.length
        passes.push({
          number: sortie.number,
          side: sortie.side,
          laneIndex: lane.laneIndex,
          laneGroup: lane.laneGroup,
          offsetNm: lane.offsetNm,
          surveySide: planned.side,
          names: slice.map((point) => point.g1000Name),
          coordinates: slice.map((point) => [point.lon, point.lat]),
          waypoints: slice.map((point) => ({
            lat: point.lat,
            lon: point.lon,
            name: point.g1000Name,
          })),
        })
      }
    }
    sorties.push({
      number: sortie.number,
      side: sortie.side,
      surveySide: planned.side,
      lanes: planned.lanes.length,
      waypoints: planned.routeSequence.length,
      distanceNm: planned.distanceNm,
      offsetsNm: planned.offsetsNm,
      routeSequence: planned.routeSequence,
      startAt: planned.startAt,
    })
  }

  const overlay = emptyCrewOverlay(opts.team.id, opts.team.label)
  overlay.airport = opts.team.departure?.identifier ?? null
  overlay.passes = passes
  return { overlay, notes: [...new Set(notes)], sorties }
}
