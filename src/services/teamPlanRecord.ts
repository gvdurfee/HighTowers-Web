import { buildCoordinatorCrewOffsetFile } from '@/services/coordinatorOffsetExport'
import { buildSortieOffsetFpl } from '@/services/offsetRouteFpl'
import {
  emptyCrewOverlay,
  type CrewOverlayId,
  type CrewSerpentine,
  type SerpentinePass,
} from '@/services/crewSerpentineOverlay'
import type { SortieSide } from '@/services/offsetRouteFpl'
import type { OffsetLegWidth } from '@survey-planning/offsetRoutePlan.js'
import { laneWaypointName } from '@survey-planning/g1000Names.js'
import { buildOffsetTrack, reverseOffsetTrack, routeCurveSide, segmentCurveSide } from '@survey-planning/offsetRoutePlan.js'
import { nauticalMilesBetween } from '@survey-planning/surveyGeometry.js'
import { planSideLanes } from '@survey-planning/sortieLanePlan.js'
import {
  sortieProgressId,
  surveyStops,
  surveySummaryLine,
  coveredSurveyNm,
  waypointKey,
  type SortieProgress,
  type SurveyStop,
} from '@/services/teamPlanProgress'

export const NO_TEAM_PLAN_NOTE = 'No team plan saved. Set up teams in Team Dispatch.'
export const NO_SEGMENT_NOTE = 'No segment assigned.'
export const NO_SORTIE_SIDE_NOTE = 'No Sortie 1 side set.'
export const NO_SEGMENT_WIDTH_NOTE = 'No published width for this segment.'
export const LEGACY_SORTIE_NOTE = 'Re-run and save in Team Dispatch to show every planned sortie.'

export type TeamPlanSpanWidth = {
  fromPt: string
  toPt: string
  leftNm: number
  rightNm: number
}

export type TeamPlanAirport = {
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

/** One sortie on a saved team. The offset track is built later by the shared planner. */
export type TeamPlanSortie = {
  number: number
  side: SortieSide | null
  order: 'forward' | 'reverse'
}

/** One budget-sized sortie from the planner. Older saved plans omit this list. */
export type PackedTeamSortie = {
  number: number
  side: SortieSide | null
  surveySide: 'left' | 'right' | null
  offsetsNm: number[]
  fromPt: string
  toPt: string
  departureIdent: string
  landingIdent: string
  distanceNm: number
  returnHomeOnly: boolean
  startAt: string | null
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
  /** Budget-sized sorties from the planner. Older records omit this and keep the two-sortie draw. */
  packedSorties?: PackedTeamSortie[]
  /** The side the coordinator picked. Kept so a reload does not relabel the crew from one sortie. */
  chosenSide?: SortieSide | null
}

/** One record per flight plan. Replaced on the next save. */
export type SavedTeamPlan = {
  flightPlanId: string
  savedAt: string
  /** First parallel offset, in NM. Older records omit this and use 3. */
  firstOffsetNm?: number
  /** Spacing between lanes, in NM. Older records omit this and use 6. */
  stepNm?: number
  /** Max planned NM per sortie. Older records omit this. Values above 500 load as 500. */
  sortieBudgetNm?: number
  /**
   * Left and right NM for each span, as saved from Team Dispatch.
   * Older records omit this. Map View then uses the FAA text.
   */
  spanWidths?: TeamPlanSpanWidth[]
  /** A comparison boundary that is not a published waypoint. Older records omit this. */
  routeInsert?: {
    afterIdent: string
    alongNm: number
    point: { ptIdent: string; lat: number; lon: number; g1000Name?: string; originalName?: string }
  } | null
  /**
   * Where each crew stopped. Keyed by team id and sortie number.
   * Older records omit this and read as not started. This does not change the sortie list.
   */
  progress?: Record<string, SortieProgress>
  /** One notice when a later save clears marks for sorties whose waypoints changed. */
  progressNotice?: string | null
  teams: TeamPlanTeam[]
}

export type SortieLaneSummary = {
  number: number
  side: SortieSide
  surveySide: 'left' | 'right'
  lanes: number
  waypoints: number
  distanceNm: number
  offsetsNm: number[]
  routeSequence: string[]
  startAt: string | null
  fromPt?: string
  toPt?: string
  departureIdent?: string
  landingIdent?: string
  includesFerry?: boolean
  returnHomeOnly?: boolean
  /** Home field named on this crew's last sortie. */
  ferryHome?: string | null
}

function lanePhrase(offsets: number[]): string {
  if (offsets.length === 1) return `lanes ${offsets[0]} NM`
  const last = offsets[offsets.length - 1]
  const rest = offsets.slice(0, -1).join(', ')
  const listed = offsets.length === 2 ? `${offsets[0]} and ${last}` : `${rest}, and ${last}`
  return `lanes ${listed} NM`
}

export function formatSortieHeader(
  summary: {
    number: number
    lanes: number
    waypoints: number
    distanceNm: number
    includesFerry?: boolean
    offsetsNm?: number[]
    returnHomeOnly?: boolean
    landingIdent?: string | null
    departureIdent?: string | null
    ferryHome?: string | null
  },
  refuelIdent?: string | null
): string {
  const ferry = summary.includesFerry ? ', includes ferry' : ''
  const lanes =
    summary.includesFerry && summary.offsetsNm && summary.offsetsNm.length > 0
      ? lanePhrase(summary.offsetsNm)
      : `${summary.lanes} lanes`
  const base = `Sortie ${summary.number}: ${lanes}, ${summary.waypoints} waypoints, ${summary.distanceNm} NM${ferry}`
  const departureIdent = summary.departureIdent ?? null
  const endsKnown = Boolean(departureIdent || summary.landingIdent)
  const touchesRefuel =
    Boolean(refuelIdent) &&
    [departureIdent, summary.landingIdent].some(
      (ident) => (ident ?? '').toUpperCase() === (refuelIdent ?? '').toUpperCase()
    )
  if (summary.returnHomeOnly && summary.landingIdent) return `${base} (ferry home to ${summary.landingIdent})`
  const refueled = refuelIdent && (!endsKnown || touchesRefuel) ? `${base} (refuel at ${refuelIdent})` : base
  if (summary.ferryHome) return `${refueled} (ferry home to ${summary.ferryHome})`
  return refueled
}

/** Older records have no packed list, so the map still draws the two saved sides. */
export function legacySortieNote(
  team: { packedSorties?: PackedTeamSortie[] | null } | null | undefined
): string | null {
  if (!team || (team.packedSorties && team.packedSorties.length > 0)) return null
  return LEGACY_SORTIE_NOTE
}

export const ONE_SORTIE_TOOLTIP = 'This team flies one sortie'

export type MapSortieButton = {
  number: number
  enabled: boolean
  /** Present when the button is disabled, so the control can explain why. */
  title?: string
}

/** Sortie 2 is available when the saved team record lists a second sortie. */
export function mapSortieButtons(
  sorties: Array<{ number: number; distanceNm?: number }>
): MapSortieButton[] {
  const numbers = [...new Set(sorties.map((sortie) => sortie.number).filter((number) => number > 0))]
  const packed = sorties.some((sortie) => typeof sortie.distanceNm === 'number') || numbers.some((number) => number > 2)
  if (packed) {
    return [...sorties]
      .sort((a, b) => a.number - b.number)
      .map((sortie) => ({ number: sortie.number, enabled: true }))
  }
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
  sortieBudgetNm?: number
  spanWidths?: TeamPlanSpanWidth[]
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
    ...(opts.sortieBudgetNm != null ? { sortieBudgetNm: opts.sortieBudgetNm } : {}),
    ...(opts.spanWidths && opts.spanWidths.length > 0 ? { spanWidths: opts.spanWidths } : {}),
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
        chosenSide: opts.sides[crew.id] ?? null,
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

/** Miles along the same waypoint list the .fpl writes, including the ferry airports. */
export function measurePackedSortieNm(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null>
  sortieNumber: number
  firstOffsetNm?: number
  stepNm?: number
  homeIdent?: string
  homes?: string[]
}): number | null {
  const route = teamSortieOffsetRoute({
    team: opts.team,
    points: opts.points,
    legWidths: opts.legWidths,
    sortieNumber: opts.sortieNumber,
    firstOffsetNm: opts.firstOffsetNm,
    stepNm: opts.stepNm,
    homeIdent: opts.homeIdent,
    homes: opts.homes,
  })
  if (!('waypoints' in route) || route.waypoints.length === 0) return null
  const path = [
    { lat: route.departure.latitude, lon: route.departure.longitude },
    ...route.waypoints.map((point) => ({ lat: point.lat, lon: point.lon })),
    { lat: route.landing.latitude, lon: route.landing.longitude },
  ]
  let sum = 0
  for (let index = 1; index < path.length; index += 1) sum += nauticalMilesBetween(path[index - 1], path[index])
  return Math.round(sum * 10) / 10
}

export function buildTeamSortieFile(opts: {
  team: TeamPlanTeam
  routeLabel: string
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null>
  sortieNumber: number
  firstOffsetNm?: number
  stepNm?: number
  /** Crew home field. Filenames and waypoint letters use this, not the sortie's departure. */
  homeIdent?: string
  homes?: string[]
}): { xml: string; filename: string; routeName: string; userNames: string[]; maxTurnDeg?: number } | { ferryOnly: true } | { error: string } {
  const packed = opts.team.packedSorties?.find((sortie) => sortie.number === opts.sortieNumber)
  if (packed) {
    if (packed.returnHomeOnly || packed.offsetsNm.length === 0) return { ferryOnly: true }
    const homeIdent = opts.homeIdent || opts.team.departure?.identifier || ''
    const route = teamSortieOffsetRoute({
      team: opts.team,
      points: opts.points,
      legWidths: opts.legWidths,
      sortieNumber: opts.sortieNumber,
      firstOffsetNm: opts.firstOffsetNm,
      stepNm: opts.stepNm,
      homeIdent,
      homes: opts.homes,
    })
    if ('error' in route) return route
    if (route.waypoints.length === 0) return { ferryOnly: true }
    const filename = packedSortieFilename(
      opts.routeLabel,
      homeIdent || route.departure.identifier,
      packed.fromPt,
      packed.toPt,
      opts.sortieNumber
    )
    const routeName = filename.replace(/\.fpl$/i, '')
    const file = buildSortieOffsetFpl({
      routeLabel: routeName,
      routeName,
      sortieNumber: opts.sortieNumber,
      side: route.side,
      waypoints: route.waypoints,
      departure: route.departure,
      destination: route.landing,
    })
    return {
      xml: file.xml,
      filename,
      routeName: filename.replace(/\.fpl$/i, ''),
      userNames: route.waypoints.map((point) => point.g1000Name),
      maxTurnDeg: maxCourseChangeDeg(
        [route.departure, ...route.waypoints, route.landing].map((point) => ({
          lat: 'lat' in point ? point.lat : point.latitude,
          lon: 'lon' in point ? point.lon : point.longitude,
        }))
      ),
    }
  }
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
    sortieNumber: opts.sortieNumber === 2 ? 2 : 1,
    departure: opts.team.departure,
    destination: opts.team.landing,
  })
}

function geographicSide(
  side: SortieSide,
  route: Array<{ lat: number; lon: number; ptIdent?: string }>,
  fromIdent?: string | null,
  toIdent?: string | null
): 'left' | 'right' {
  const first = fromIdent || route.find((point) => point.ptIdent)?.ptIdent
  const last = toIdent || [...route].reverse().find((point) => point.ptIdent)?.ptIdent
  const curve =
    first && last && first !== last ? segmentCurveSide(route, first, last) : routeCurveSide(route)
  return side === 'inner' ? curve.innerSide : curve.outerSide
}

function airportByIdent(team: TeamPlanTeam, ident: string | null | undefined): TeamPlanAirport | null {
  if (!ident) return null
  if (sameIdent(team.departure?.identifier, ident)) return team.departure
  if (sameIdent(team.refuelStop?.identifier, ident)) return team.refuelStop ?? null
  if (sameIdent(team.landing?.identifier, ident)) return team.landing
  return null
}

function ferryForSortie(team: TeamPlanTeam, number: number): {
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

export function maxCourseChangeDeg(points: Array<{ lat: number; lon: number }>): number {
  const bearing = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const lat1 = (a.lat * Math.PI) / 180
    const lat2 = (b.lat * Math.PI) / 180
    const dLon = ((b.lon - a.lon) * Math.PI) / 180
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    return (Math.atan2(y, x) * 180) / Math.PI
  }
  let max = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    let turn = bearing(points[index], points[index + 1]) - bearing(points[index - 1], points[index])
    while (turn > 180) turn -= 360
    while (turn < -180) turn += 360
    max = Math.max(max, Math.abs(turn))
  }
  return Math.round(max)
}

function placesApart(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * 60
  const dLon = (b.lon - a.lon) * 60 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/**
 * A width change can offset the same published point twice on one lane.
 * The second place keeps the side letter last and inserts a letter, not a lane digit: B1I, then B1AI.
 */
function resolveLaneName(
  name: string,
  point: { lat: number; lon: number },
  seen: Map<string, { lat: number; lon: number }>
): { name: string } | { error: string } {
  const prior = seen.get(name)
  if (!prior || placesApart(prior, point) <= 0.1) return { name }
  const letter = name.slice(-1)
  let stem = name.slice(0, -1)
  while (stem.length > 0) {
    for (const mark of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const candidate = `${stem}${mark}${letter}`
      if (candidate.length > 6) break
      const taken = seen.get(candidate)
      if (!taken || placesApart(taken, point) <= 0.1) return { name: candidate }
    }
    stem = stem.slice(0, -1)
  }
  return { error: `G1000 name ${name} would be used for two different places.` }
}

/** Lane 1 is  the first-track offset on every sortie. A later sortie does not start again at lane 1. */
export function absoluteLaneNumber(offsetNm: number, firstOffsetNm = 3, stepNm = 6): number {
  if (!Number.isFinite(stepNm) || stepNm <= 0) return 1
  return Math.round((offsetNm - firstOffsetNm) / stepNm) + 1
}

/** One letter for a crew's home field, unique among the homes on this plan. */
export function crewWaypointPrefix(homeIdent: string, homes: string[] = []): string {
  const idents = [...new Set((homes.length > 0 ? homes : [homeIdent]).map((item) => item.trim().toUpperCase()).filter(Boolean))].sort()
  const used = new Set<string>()
  const assigned = new Map<string, string>()
  for (const ident of idents) {
    const letters = ident.replace(/[^A-Z]/g, '')
    let choice = ''
    for (let index = letters.length - 1; index >= 0; index -= 1) {
      if (!used.has(letters[index])) {
        choice = letters[index]
        break
      }
    }
    if (!choice) {
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (!used.has(letter)) {
          choice = letter
          break
        }
      }
    }
    if (choice) used.add(choice)
    assigned.set(ident, choice || 'X')
  }
  return assigned.get(homeIdent.trim().toUpperCase()) || 'X'
}

export function packedSortieFilename(
  routeLabel: string,
  departureIdent: string,
  fromPt: string,
  toPt: string,
  sortieNumber: number
): string {
  const safe = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return `${safe(routeLabel)}_${safe(departureIdent)}_${safe(fromPt)}${safe(toPt)}_S${sortieNumber}.fpl`
}

/** The first export keeps the name. The next export of that same name adds _2, then _3. */
export function uniqueSortieFilename(filename: string, used: Map<string, number>): string {
  const base = filename.replace(/\.fpl$/i, '')
  const count = (used.get(base) ?? 0) + 1
  used.set(base, count)
  return count === 1 ? filename : `${base}_${count}.fpl`
}

const COMPASS_WORDS = ['north', 'east', 'south', 'west'] as const

/** Which compass side of the flown course a left or right offset sits on. */
export function lateralCompassSide(
  lateral: 'left' | 'right',
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): string {
  const midLat = ((from.lat + to.lat) / 2) * (Math.PI / 180)
  const course = (Math.atan2((to.lon - from.lon) * Math.cos(midLat), to.lat - from.lat) * 180) / Math.PI
  const side = (course + (lateral === 'left' ? -90 : 90) + 360) % 360
  return `${COMPASS_WORDS[Math.round(side / 90) % 4]} side`
}

/** The first centerline leg the sortie actually flies, skipping legs shorter than 1 NM. */
export function firstFlownLeg(
  points: Array<{ ptIdent: string; lat: number; lon: number }>,
  fromPt: string,
  toPt: string,
  startAt?: string | null
): { from: { lat: number; lon: number }; to: { lat: number; lon: number } } | null {
  const start = points.findIndex((point) => sameIdent(point.ptIdent, fromPt))
  const end = points.findIndex((point) => sameIdent(point.ptIdent, toPt))
  if (start < 0 || end <= start) return null
  const slice = points.slice(start, end + 1)
  const ordered = startAt && !sameIdent(startAt, slice[0]?.ptIdent) ? [...slice].reverse() : slice
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (nauticalMilesBetween(ordered[index], ordered[index + 1]) >= 1) {
      return { from: ordered[index], to: ordered[index + 1] }
    }
  }
  return ordered.length >= 2 ? { from: ordered[0], to: ordered[1] } : null
}

export function packedDownloadLabel(
  ident: string,
  sortie: PackedTeamSortie,
  points: Array<{ ptIdent: string; lat: number; lon: number }>
): string {
  const role = sortie.side === 'outer' ? 'Outer' : sortie.side === 'inner' ? 'Inner' : 'Survey'
  const leg = firstFlownLeg(points, sortie.fromPt, sortie.toPt, sortie.startAt)
  const reversed = Boolean(sortie.startAt && !sameIdent(sortie.startAt, sortie.fromPt))
  const flownSide =
    sortie.surveySide === 'left' || sortie.surveySide === 'right'
      ? reversed
        ? sortie.surveySide === 'left'
          ? 'right'
          : 'left'
        : sortie.surveySide
      : null
  const compass = leg && flownSide ? lateralCompassSide(flownSide, leg.from, leg.to) : null
  return compass
    ? `Download ${ident} Sortie ${sortie.number}, ${role} (${compass}) .fpl`
    : `Download ${ident} Sortie ${sortie.number}, ${role} .fpl`
}

/** Lane 1 is the lane nearest the centerline. The same offset keeps that number on every sortie. */
export function nameOffsetLanePoints(
  lanes: OffsetLane[],
  side: SortieSide,
  naming?: { firstOffsetNm?: number; stepNm?: number; prefix?: string },
  seen: Map<string, { lat: number; lon: number }> = new Map()
): { waypoints: TeamOffsetWaypoint[] } | { error: string } {
  let first = naming?.firstOffsetNm
  let step = naming?.stepNm
  if (!(typeof first === 'number' && first > 0) || !(typeof step === 'number' && step > 0)) {
    const offsets = [...new Set(lanes.map((lane) => lane.offsetNm))].filter((nm) => nm > 0).sort((a, b) => a - b)
    if (offsets.length === 0) return { error: 'Survey track spacing was not passed.' }
    first = offsets[0]
    step = offsets.length > 1 ? Math.round((offsets[1] - offsets[0]) * 10) / 10 : first
  }
  const waypoints: TeamOffsetWaypoint[] = []
  for (const lane of lanes) {
    const laneNumber = absoluteLaneNumber(lane.offsetNm, first, step)
    for (const point of lane.waypoints) {
      const named = laneWaypointName(point.originalName || point.ptIdent, side, laneNumber, naming?.prefix ?? '')
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
  startAt?: string | null
  lateral?: 'left' | 'right'
  namePrefix?: string
  seen?: Map<string, { lat: number; lon: number }>
}): { waypoints: TeamOffsetWaypoint[] } | { error: string } {
  const slice = sliceTeamSegment(opts.points, opts.legWidths, {
    segmentFrom: opts.fromPt,
    segmentTo: opts.toPt,
  } as TeamPlanTeam)
  if ('error' in slice) return slice
  const geo = opts.lateral ?? geographicSide(opts.side, opts.points, opts.fromPt, opts.toPt)
  const planned = planSideLanes({
    points: slice.points,
    legWidths: slice.widths,
    side: geo,
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
  const forwardFirst = !opts.startAt || sameIdent(opts.startAt, slice.points[0]?.ptIdent)
  let lanes: OffsetLane[] = planned.lanes
  const requested = opts.offsets ?? []
  const wanted = new Set(requested.map((offset) => Math.round(offset * 10)))
  const matched = planned.lanes.filter((lane) => wanted.has(Math.round(lane.offsetNm * 10)))
  if (requested.length > 0 && matched.length === requested.length && !opts.startAt) {
    lanes = matched
  } else if (requested.length > 0) {
    lanes = requested.map((offsetNm, index) => {
      const fromIndex = opts.points.findIndex((point) => sameIdent(point.ptIdent, opts.fromPt))
      const toIndex = opts.points.findIndex((point) => sameIdent(point.ptIdent, opts.toPt))
      const track = buildOffsetTrack(
        slice.points,
        slice.widths.map(() => offsetNm),
        slice.widths.map((width) => (geo === 'left' ? width.leftNm : width.rightNm)),
        geo,
        {
          before: fromIndex > 0 ? opts.points[fromIndex - 1] : null,
          after: toIndex >= 0 && toIndex + 1 < opts.points.length ? opts.points[toIndex + 1] : null,
        }
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
  return nameOffsetLanePoints(
    lanes,
    opts.side,
    {
      firstOffsetNm: opts.firstOffsetNm,
      stepNm: opts.stepNm,
      prefix: opts.namePrefix,
    },
    opts.seen
  )
}

/** Offset-coordinate waypoints for one sortie, in serpentine order, with the ferry airports. */
export function teamSortieOffsetRoute(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null>
  sortieNumber: number
  firstOffsetNm?: number
  stepNm?: number
  homeIdent?: string
  homes?: string[]
}):
  | {
      side: SortieSide
      departure: TeamPlanAirport
      landing: TeamPlanAirport
      waypoints: TeamOffsetWaypoint[]
    }
  | { error: string } {
  const packed = opts.team.packedSorties?.find((item) => item.number === opts.sortieNumber)
  if (packed) {
    const departure = airportByIdent(opts.team, packed.departureIdent)
    const landing = airportByIdent(opts.team, packed.landingIdent)
    if (!departure || !landing) return { error: 'No departure airport set.' }
    if (packed.returnHomeOnly || packed.offsetsNm.length === 0 || !packed.side) {
      return { side: packed.side ?? 'inner', departure, landing, waypoints: [] }
    }
    const homeIdent = opts.homeIdent || opts.team.departure?.identifier || departure.identifier
    const seen = new Map<string, { lat: number; lon: number }>()
    const nameOne = (item: PackedTeamSortie) => {
      const itemDeparture = airportByIdent(opts.team, item.departureIdent) ?? departure
      const itemLanding = airportByIdent(opts.team, item.landingIdent) ?? landing
      const flown = item.surveySide === 'left' || item.surveySide === 'right' ? item.surveySide : null
      return offsetSortieWaypoints({
        points: opts.points,
        legWidths: opts.legWidths,
        fromPt: item.fromPt,
        toPt: item.toPt,
        side: item.side ?? packed.side ?? 'inner',
        departure: itemDeparture,
        landing: itemLanding,
        firstOffsetNm: opts.firstOffsetNm,
        stepNm: opts.stepNm,
        offsets: item.offsetsNm,
        startAt: item.startAt,
        lateral: flown ?? undefined,
        namePrefix: crewWaypointPrefix(homeIdent, opts.homes ?? [homeIdent]),
        seen,
      })
    }
    for (const earlier of opts.team.packedSorties ?? []) {
      if (earlier.number >= packed.number || earlier.returnHomeOnly || earlier.offsetsNm.length === 0 || !earlier.side) continue
      const reserved = nameOne(earlier)
      if ('error' in reserved) return reserved
    }
    const named = nameOne(packed)
    if ('error' in named) return named
    const waypoints: TeamOffsetWaypoint[] = []
    for (const point of named.waypoints) {
      const previous = waypoints[waypoints.length - 1]
      if (previous && placesApart(previous, point) <= 0.05) continue
      waypoints.push(point)
    }
    return {
      side: packed.side,
      departure,
      landing,
      waypoints,
    }
  }
  const sortie = opts.team.sorties.find((item) => item.number === opts.sortieNumber)
  if (!sortie?.side) return { error: NO_SORTIE_SIDE_NOTE }
  if (!opts.team.segmentFrom || !opts.team.segmentTo) return { error: NO_SEGMENT_NOTE }
  const ferry = ferryForSortie(opts.team, opts.sortieNumber === 2 ? 2 : 1)
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

function drawPackedTeam(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null> | null
  firstOffsetNm?: number
  stepNm?: number
  homes?: string[]
}): { overlay: CrewSerpentine; notes: string[]; sorties: SortieLaneSummary[] } {
  const notes: string[] = []
  const packed = opts.team.packedSorties ?? []
  if (!opts.team.departure) notes.push('No departure airport set.')
  if (!opts.legWidths) notes.push(NO_SEGMENT_WIDTH_NOTE)
  const passes: SerpentinePass[] = []
  const sorties: SortieLaneSummary[] = []
  for (const sortie of packed) {
    const departure = airportByIdent(opts.team, sortie.departureIdent)
    const landing = airportByIdent(opts.team, sortie.landingIdent)
    const summary: SortieLaneSummary = {
      number: sortie.number,
      side: sortie.side ?? 'inner',
      surveySide: sortie.surveySide ?? 'left',
      lanes: sortie.returnHomeOnly ? 0 : sortie.offsetsNm.length,
      waypoints: 0,
      distanceNm: sortie.distanceNm,
      offsetsNm: sortie.offsetsNm,
      routeSequence: [],
      startAt: sortie.startAt,
      fromPt: sortie.fromPt,
      toPt: sortie.toPt,
      departureIdent: sortie.departureIdent,
      landingIdent: sortie.landingIdent,
      includesFerry: true,
      returnHomeOnly: sortie.returnHomeOnly,
      ferryHome: packed[packed.length - 1] === sortie ? opts.team.departure?.identifier ?? sortie.landingIdent : null,
    }
    if (sortie.returnHomeOnly || sortie.offsetsNm.length === 0 || !sortie.side) {
      if (departure && landing) {
        passes.push({
          number: sortie.number,
          side: summary.side,
          names: [departure.identifier, landing.identifier],
          coordinates: [
            [departure.longitude, departure.latitude],
            [landing.longitude, landing.latitude],
          ],
          waypoints: [
            { lat: departure.latitude, lon: departure.longitude, name: departure.identifier },
            { lat: landing.latitude, lon: landing.longitude, name: landing.identifier },
          ],
        })
      }
      sorties.push(summary)
      continue
    }
    if (!opts.legWidths || !departure || !landing) {
      sorties.push(summary)
      continue
    }
    const named = teamSortieOffsetRoute({
      team: opts.team,
      points: opts.points,
      legWidths: opts.legWidths,
      sortieNumber: sortie.number,
      firstOffsetNm: opts.firstOffsetNm,
      stepNm: opts.stepNm,
      homeIdent: opts.team.departure?.identifier,
      homes: opts.homes,
    })
    if ('error' in named) {
      notes.push(named.error)
      sorties.push(summary)
      continue
    }
    if (named.waypoints.length > 0) {
      passes.push({
        number: sortie.number,
        side: named.side,
        offsetNm: sortie.offsetsNm[0],
        surveySide: sortie.surveySide ?? undefined,
        names: named.waypoints.map((point) => point.g1000Name),
        coordinates: named.waypoints.map((point) => [point.lon, point.lat]),
        waypoints: named.waypoints.map((point) => ({ lat: point.lat, lon: point.lon, name: point.g1000Name })),
      })
    }
    summary.waypoints = named.waypoints.length
    summary.routeSequence = named.waypoints.map((point) => point.g1000Name)
    sorties.push(summary)
  }
  const overlay = emptyCrewOverlay(opts.team.id, opts.team.label)
  overlay.airport = opts.team.departure?.identifier ?? null
  overlay.passes = passes
  return { overlay, notes: [...new Set(notes)], sorties }
}

export function drawSavedTeam(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null> | null
  firstOffsetNm?: number
  stepNm?: number
  homes?: string[]
}): { overlay: CrewSerpentine; notes: string[]; sorties: SortieLaneSummary[] } {
  if (opts.team.packedSorties && opts.team.packedSorties.length > 0) return drawPackedTeam(opts)
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
      side: geographicSide(sortie.side, opts.points, opts.team.segmentFrom, opts.team.segmentTo),
      policy,
      departure: ferry.departure
        ? { lat: ferry.departure.latitude, lon: ferry.departure.longitude, identifier: ferry.departure.identifier }
        : null,
      landing: ferry.landing
        ? { lat: ferry.landing.latitude, lon: ferry.landing.longitude, identifier: ferry.landing.identifier }
        : null,
    })
    if (planned.note && planned.lanes.length === 0) notes.push(planned.note)
    const named = nameOffsetLanePoints(planned.lanes, sortie.side, {
      firstOffsetNm: opts.firstOffsetNm,
      stepNm: opts.stepNm,
    })
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

function turnOrient(a: { lat: number; lon: number }, b: { lat: number; lon: number }, c: { lat: number; lon: number }): number {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon)
}

function segmentsCross(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  c: { lat: number; lon: number },
  d: { lat: number; lon: number }
): boolean {
  return turnOrient(a, b, c) * turnOrient(a, b, d) < 0 && turnOrient(c, d, a) * turnOrient(c, d, b) < 0
}

/** One line when a ferry or lane-change leg crosses another crew's lanes. */
export function ferryCrossingNote(opts: {
  departure: { lat: number; lon: number }
  landing: { lat: number; lon: number }
  own: Array<{ lat: number; lon: number; offsetNm?: number }>
  others: Array<{ ident: string; fromPt: string; toPt: string; points: Array<{ lat: number; lon: number }> }>
}): string | null {
  if (opts.own.length === 0) return null
  const path: Array<{ lat: number; lon: number; offsetNm?: number }> = [opts.departure, ...opts.own, opts.landing]
  const ferries: Array<[(typeof path)[number], (typeof path)[number]]> = []
  for (let index = 1; index < path.length; index += 1) {
    const left = path[index - 1]
    const right = path[index]
    if (!(left.offsetNm != null && left.offsetNm === right.offsetNm)) ferries.push([left, right])
  }
  const hits: string[] = []
  for (const other of opts.others) {
    const crossed = ferries.some((ferry) =>
      other.points.some((point, index) => index > 0 && segmentsCross(ferry[0], ferry[1], other.points[index - 1], point))
    )
    const piece = `${other.ident} ${other.fromPt}–${other.toPt}`
    if (crossed && !hits.includes(piece)) hits.push(piece)
  }
  if (hits.length === 0) return null
  return `The ferry crosses ${hits.join(' and ')}. Cross at the assigned altitude and announce.`
}

export type TeamProgressSortie = {
  id: string
  teamId: CrewOverlayId
  number: number
  /** Crew home field, for the summary line. */
  crew: string
  /** Home field and sortie number, for the stale-progress notice. */
  label: string
  stops: SurveyStop[]
  waypointKey: string
}

/** Survey waypoints for each packed sortie. Does not read or change the sortie list. */
export function teamProgressCatalog(opts: {
  plan: SavedTeamPlan
  points: TeamRoutePoint[]
  legWidths: Array<OffsetLegWidth | null> | null
}): TeamProgressSortie[] {
  const homes = opts.plan.teams.map((team) => team.departure?.identifier ?? '').filter(Boolean)
  const rows: TeamProgressSortie[] = []
  for (const team of opts.plan.teams) {
    const crew = team.departure?.identifier || team.label
    for (const sortie of team.packedSorties ?? []) {
      if (sortie.returnHomeOnly || sortie.offsetsNm.length === 0) continue
      const id = sortieProgressId(team.id, sortie.number)
      const label = `${crew} sortie ${sortie.number}`
      if (!opts.legWidths || !sortie.side) {
        rows.push({ id, teamId: team.id, number: sortie.number, crew, label, stops: [], waypointKey: '' })
        continue
      }
      const route = teamSortieOffsetRoute({
        team,
        points: opts.points,
        legWidths: opts.legWidths,
        sortieNumber: sortie.number,
        firstOffsetNm: opts.plan.firstOffsetNm,
        stepNm: opts.plan.stepNm,
        homeIdent: team.departure?.identifier,
        homes,
      })
      const stops =
        'waypoints' in route
          ? surveyStops(route.waypoints, [
              sortie.departureIdent,
              sortie.landingIdent,
              team.departure?.identifier,
              team.landing?.identifier,
              team.refuelStop?.identifier,
            ])
          : []
      rows.push({
        id,
        teamId: team.id,
        number: sortie.number,
        crew,
        label,
        stops,
        waypointKey: waypointKey(stops),
      })
    }
  }
  return rows
}

export function progressSummaryLines(
  catalog: TeamProgressSortie[],
  progress: Record<string, SortieProgress> | undefined
): { crews: string[]; plan: string } {
  const byCrew = new Map<string, { surveyed: number; total: number }>()
  let surveyed = 0
  let total = 0
  for (const sortie of catalog) {
    const miles = surveyLaneNmOf(sortie, progress)
    const bucket = byCrew.get(sortie.crew) ?? { surveyed: 0, total: 0 }
    bucket.surveyed = Math.round((bucket.surveyed + miles.surveyed) * 10) / 10
    bucket.total = Math.round((bucket.total + miles.total) * 10) / 10
    byCrew.set(sortie.crew, bucket)
    surveyed = Math.round((surveyed + miles.surveyed) * 10) / 10
    total = Math.round((total + miles.total) * 10) / 10
  }
  return {
    crews: [...byCrew.entries()].map(([crew, miles]) => `${crew}: ${surveySummaryLine(miles.surveyed, miles.total)}`),
    plan: `Plan: ${surveySummaryLine(surveyed, total)}`,
  }
}

function surveyLaneNmOf(
  sortie: TeamProgressSortie,
  progress: Record<string, SortieProgress> | undefined
): { surveyed: number; total: number } {
  return {
    surveyed: coveredSurveyNm(sortie.stops, progress?.[sortie.id]),
    total: coveredSurveyNm(sortie.stops, { status: 'completed' }),
  }
}
