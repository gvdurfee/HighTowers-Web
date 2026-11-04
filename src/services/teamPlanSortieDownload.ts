import { buildSortieOffsetFpl } from '@/services/offsetRouteFpl'
import { routeCurveSide } from '@survey-planning/offsetRoutePlan.js'
import {
  NO_SEGMENT_NOTE,
  NO_SEGMENT_WIDTH_NOTE,
  NO_SORTIE_SIDE_NOTE,
  ONE_SORTIE_TOOLTIP,
  offsetSortieWaypoints,
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
  team: { sorties: Array<{ number: number; side?: string | null }>; segmentFrom?: string | null; segmentTo?: string | null; departure?: unknown } | null,
  sortieNumber: 1 | 2,
  widthsReady = true
): { enabled: boolean; title?: string } {
  if (!team) return { enabled: false, title: 'Choose Sortie 1 side in Flight Plans before downloading offset routes.' }
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
  sortieNumber: 1 | 2
): boolean {
  if (!legWidths) return false
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
  sortieNumber: 1 | 2
  side: SortieSide
  waypoints: Array<{ g1000Name: string; lat: number; lon: number }>
  departure: TeamPlanAirport
  landing: TeamPlanAirport
  homeIdent: string
}): { xml: string; filename: string } {
  const file = buildSortieOffsetFpl({
    routeLabel: opts.routeLabel,
    sortieNumber: opts.sortieNumber,
    side: opts.side,
    waypoints: opts.waypoints,
    departure: opts.departure,
    destination: opts.landing,
  })
  return {
    xml: file.xml,
    filename: teamSortieFilename(opts.routeLabel, opts.homeIdent, opts.sortieNumber),
  }
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
  sortieNumber: 1 | 2
  homeIdent?: string
  policy?: { firstOffsetNm?: number; stepNm?: number }
  offsets?: number[]
}): { xml: string; filename: string } {
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
  })
  if ('error' in named) throw new Error(named.error)
  return offsetFile({
    routeLabel: opts.routeLabel,
    sortieNumber: opts.sortieNumber,
    side: opts.side,
    waypoints: named.waypoints,
    departure: opts.departure,
    landing: opts.landing,
    homeIdent: opts.homeIdent ?? opts.departure.identifier,
  })
}

/** The Map View download. Each lane is its own user waypoints at the offset coordinates. */
export function buildTeamPlanSortieFile(opts: {
  team: TeamPlanTeam
  points: TeamRoutePoint[]
  legWidths: Array<{ leftNm: number; rightNm: number } | null>
  waypoints?: unknown
  routeLabel: string
  policy?: { firstOffsetNm?: number; stepNm?: number }
  sortieNumber: 1 | 2
  created?: Date
}): { xml: string; filename: string } {
  void opts.waypoints
  void opts.created
  const home = opts.team.departure
  if (!home) throw new Error('No departure airport set.')
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
