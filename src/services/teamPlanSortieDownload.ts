import { plannerRouteName } from '@survey-planning/g1000Names.js'
import { buildSortieOffsetFpl } from '@/services/offsetRouteFpl'
import { routeCurveSide } from '@survey-planning/offsetRoutePlan.js'
import { nauticalMilesBetween } from '@survey-planning/surveyGeometry.js'
import {
  buildTeamSortieFile,
  NO_SEGMENT_NOTE,
  NO_SEGMENT_WIDTH_NOTE,
  NO_SORTIE_SIDE_NOTE,
  ONE_SORTIE_TOOLTIP,
  maxCourseChangeDeg,
  offsetSortieWaypoints,
  packedSortieFilename,
  sliceTeamSegment,
  sortie1Side,
  teamSortieOffsetRoute,
  type TeamPlanAirport,
  type TeamPlanTeam,
  type TeamRoutePoint,
} from '@/services/teamPlanRecord'
import type { SortieSide } from '@/services/offsetRouteFpl'

export function teamSortieFilename(routeLabel: string, airportIdent: string, sortieNumber: number): string {
  const safe = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '')
  return `${safe(routeLabel)}_${safe(airportIdent)}_S${sortieNumber}.fpl`
}

export function teamSortieDownloadOffer(
  team: {
    sorties: Array<{ number: number; side?: string | null }>
    packedSorties?: Array<{ number: number; side?: string | null; offsetsNm?: number[]; returnHomeOnly?: boolean; fromPt?: string; toPt?: string }>
    segmentFrom?: string | null
    segmentTo?: string | null
    departure?: unknown
  } | null,
  sortieNumber: number,
  widthsReady = true
): { enabled: boolean; title?: string } {
  if (!team) return { enabled: false, title: 'Choose Sortie 1 side in Flight Plans before downloading offset routes.' }
  const packed = team.packedSorties?.find((item) => item.number === sortieNumber)
  if (packed) {
    if (!team.departure) return { enabled: false, title: 'No departure airport set.' }
    if (packed.returnHomeOnly || (packed.offsetsNm?.length ?? 0) === 0) return { enabled: true }
    if (!packed.side) return { enabled: false, title: NO_SORTIE_SIDE_NOTE }
    if (!packed.fromPt || !packed.toPt) return { enabled: false, title: NO_SEGMENT_NOTE }
    if (!widthsReady) return { enabled: false, title: NO_SEGMENT_WIDTH_NOTE }
    return { enabled: true }
  }
  const sortie = team.sorties.find((item) => item.number === sortieNumber)
  if (!sortie) return { enabled: false, title: ONE_SORTIE_TOOLTIP }
  if (!sortie.side) return { enabled: false, title: NO_SORTIE_SIDE_NOTE }
  if (!team.segmentFrom || !team.segmentTo) return { enabled: false, title: NO_SEGMENT_NOTE }
  if (!team.departure) return { enabled: false, title: 'No departure airport set.' }
  if (!widthsReady) return { enabled: false, title: NO_SEGMENT_WIDTH_NOTE }
  return { enabled: true }
}

/** A stored 0 is an empty width box, not a published corridor. */
export function publishedSortieWidthReady(
  team: TeamPlanTeam,
  points: TeamRoutePoint[],
  legWidths: Array<{ leftNm: number; rightNm: number } | null> | null,
  sortieNumber: number
): boolean {
  if (!legWidths) return false
  const packed = team.packedSorties?.find((sortie) => sortie.number === sortieNumber)
  if (packed) {
    if (packed.returnHomeOnly || packed.offsetsNm.length === 0) return true
    const slice = sliceTeamSegment(points, legWidths, {
      ...team,
      segmentFrom: packed.fromPt,
      segmentTo: packed.toPt,
    })
    if ('error' in slice) return false
    const curve = routeCurveSide(points)
    const geo = packed.side === 'inner' ? curve.innerSide : curve.outerSide
    return slice.widths.some((leg) => (geo === 'left' ? leg.leftNm : leg.rightNm) > 0)
  }
  const slice = sliceTeamSegment(points, legWidths, team)
  if ('error' in slice) return false
  const first = sortie1Side(team)
  if (first !== 'inner' && first !== 'outer') return false
  const curve = routeCurveSide(points)
  const role = sortieNumber === 1 ? first : first === 'inner' ? 'outer' : 'inner'
  const geo = role === 'inner' ? curve.innerSide : curve.outerSide
  return slice.widths.some((leg) => (geo === 'left' ? leg.leftNm : leg.rightNm) > 0)
}

function offsetFile(opts: {
  routeLabel: string
  sortieNumber: number
  side: SortieSide
  waypoints: Array<{ g1000Name: string; lat: number; lon: number }>
  departure: TeamPlanAirport
  landing: TeamPlanAirport
  homeIdent: string
  filename?: string
}): { xml: string; filename: string } {
  const filename = opts.filename ?? teamSortieFilename(opts.routeLabel, opts.homeIdent, opts.sortieNumber)
  const laneLetters = new Set(
    opts.waypoints.map((point) => point.g1000Name.slice(-1)).filter((letter) => letter === 'I' || letter === 'O')
  )
  const file = buildSortieOffsetFpl({
    routeLabel: opts.routeLabel,
    routeName: plannerRouteName(filename, laneLetters.size > 1 ? null : opts.side),
    sortieNumber: opts.sortieNumber,
    side: opts.side,
    waypoints: opts.waypoints,
    departure: opts.departure,
    destination: opts.landing,
  })
  return { xml: file.xml, filename }
}

/** One offset-lane file. Results-row and fragment exports use this same writer. */
export function buildNamedOffsetSortieFile(opts: {
  points: TeamRoutePoint[]
  legWidths: Array<{ leftNm: number; rightNm: number } | null>
  fromPt: string
  toPt: string
  side: SortieSide
  departure: TeamPlanAirport
  landing: TeamPlanAirport
  routeLabel: string
  sortieNumber: number
  homeIdent?: string
  policy?: { firstOffsetNm?: number; stepNm?: number }
  offsets?: number[]
  startAt?: string | null
  namePrefix?: string
}): { xml: string; filename: string; distanceNm: number; maxTurnDeg: number } {
  const home = opts.homeIdent ?? opts.departure.identifier
  const named = offsetSortieWaypoints({
    points: opts.points,
    legWidths: opts.legWidths,
    fromPt: opts.fromPt,
    toPt: opts.toPt,
    side: opts.side,
    departure: opts.departure,
    landing: opts.landing,
    firstOffsetNm: opts.policy?.firstOffsetNm,
    stepNm: opts.policy?.stepNm,
    offsets: opts.offsets,
    startAt: opts.startAt,
    namePrefix: opts.namePrefix,
  })
  if ('error' in named) throw new Error(named.error)
  const filename = packedSortieFilename(opts.routeLabel, home, opts.fromPt, opts.toPt, opts.sortieNumber)
  const file = offsetFile({
    routeLabel: opts.routeLabel,
    sortieNumber: opts.sortieNumber,
    side: opts.side,
    waypoints: named.waypoints,
    departure: opts.departure,
    landing: opts.landing,
    homeIdent: home,
    filename,
  })
  const path = [opts.departure, ...named.waypoints, opts.landing].map((point) => ({
    lat: 'lat' in point ? point.lat : point.latitude,
    lon: 'lon' in point ? point.lon : point.longitude,
  }))
  let distance = 0
  for (let index = 1; index < path.length; index += 1) distance += nauticalMilesBetween(path[index - 1], path[index])
  return {
    xml: file.xml,
    filename,
    distanceNm: Math.round(distance * 10) / 10,
    maxTurnDeg: maxCourseChangeDeg(path),
  }
}

/** The Map View download. Each lane is its own user waypoints at the offset coordinates. */
export function buildTeamPlanSortieFile(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<{ leftNm: number; rightNm: number } | null>
  waypoints?: unknown
  routeLabel: string
  policy?: { firstOffsetNm?: number; stepNm?: number }
  sortieNumber: number
  created?: Date
}): { xml: string; filename: string } {
  void opts.waypoints
  void opts.created
  const home = opts.team.departure
  if (!home) throw new Error('No departure airport set.')
  if (!opts.team.packedSorties?.length) {
    const route = teamSortieOffsetRoute({
      team: opts.team,
      points: opts.points,
      legWidths: opts.legWidths,
      sortieNumber: opts.sortieNumber,
      firstOffsetNm: opts.policy?.firstOffsetNm,
      stepNm: opts.policy?.stepNm,
    })
    if ('error' in route) throw new Error(route.error)
    return offsetFile({
      routeLabel: opts.routeLabel,
      sortieNumber: opts.sortieNumber,
      side: route.side,
      waypoints: route.waypoints,
      departure: route.departure,
      landing: route.landing,
      homeIdent: home.identifier,
    })
  }
  const file = buildTeamSortieFile({
    team: opts.team,
    routeLabel: opts.routeLabel,
    points: opts.points,
    legWidths: opts.legWidths,
    sortieNumber: opts.sortieNumber,
    firstOffsetNm: opts.policy?.firstOffsetNm,
    stepNm: opts.policy?.stepNm,
  })
  if ('error' in file) throw new Error(file.error)
  if ('ferryOnly' in file) throw new Error('Ferry only, no survey file')
  return { xml: file.xml, filename: file.filename }
}
