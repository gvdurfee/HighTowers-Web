import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { downloadBlockReason } from '@/services/offsetPilotEntry'
import {
  buildSortieOffsetFpl,
  orderSortieTrack,
  type SortieSide,
} from '@/services/offsetRouteFpl'
import {
  buildOffsetRoutes,
  type OffsetLegWidth,
  type OffsetRoutePoint,
} from '@survey-planning/offsetRoutePlan.js'

export type CoordinatorOffsetAirport = {
  identifier: string
  name?: string
  latitude: number
  longitude: number
  elevation?: number
}

export type CoordinatorOffsetCrew = {
  id: string
  label: string
  departure: CoordinatorOffsetAirport | null
  destination: CoordinatorOffsetAirport | null
}

/**
 * Sortie 1 leaves the crew's airport. The plan's other airport is the destination.
 * A crew with no airport yet does not borrow one end of the plan by itself.
 */
export function crewOffsetAirports(opts: {
  crewDeparture: CoordinatorOffsetAirport | null
  planDeparture: CoordinatorOffsetAirport | null
  planDestination: CoordinatorOffsetAirport | null
}): { departure: CoordinatorOffsetAirport | null; destination: CoordinatorOffsetAirport | null } {
  const departure = opts.crewDeparture ?? opts.planDeparture
  if (!departure) return { departure: null, destination: null }
  const destination =
    [opts.planDestination, opts.planDeparture].find(
      (airport) => airport && airport.identifier.toUpperCase() !== departure.identifier.toUpperCase()
    ) ?? null
  return { departure, destination }
}

export function coordinatorMissingSideNotice(): string {
  return "Choose this crew's Sortie 1 side before downloading offset routes."
}

export const SAVED_SIDE_CHANGED_NOTICE =
  'Side changed since this plan was saved — save the plan again to download the new side'

/** Same curve rule as the offset track: Inner/Outer, then left or right of the course as flown. */
export function sortieButtonLabel(
  sortieNumber: 1 | 2,
  side: SortieSide,
  curve: { innerSide: 'left' | 'right'; outerSide: 'left' | 'right' }
): string {
  const role = side === 'inner' ? 'Inner' : 'Outer'
  const flown = side === 'inner' ? curve.innerSide : curve.outerSide
  return `Sortie ${sortieNumber} — ${role} (${flown} of course)`
}

/** Same disable rules as Map View: every leg needs both widths, and Sortie 1 side is chosen. */
export function coordinatorOffsetDownloadBlock(opts: {
  rows: Array<{ left: string; right: string }>
  sortie1Side: SortieSide | null
  nameError?: string | null
}): string | null {
  const widthRows = opts.rows.length > 0 ? opts.rows : [{ left: '', right: '' }]
  const widthBlock = downloadBlockReason(widthRows)
  if (widthBlock) return widthBlock
  if (opts.sortie1Side !== 'inner' && opts.sortie1Side !== 'outer') return coordinatorMissingSideNotice()
  if (opts.nameError) return opts.nameError
  return null
}

export function offsetPointsFromWaypoints(
  waypoints: Array<{ originalName: string; g1000Name?: string; latitude: number; longitude: number }>
): OffsetRoutePoint[] {
  return waypoints.map((wp) => {
    const parsed = parseWaypointCode(wp.originalName)
    return {
      ptIdent: parsed?.waypointLetter ?? wp.g1000Name ?? wp.originalName,
      g1000Name: wp.g1000Name,
      originalName: wp.originalName,
      lat: wp.latitude,
      lon: wp.longitude,
    }
  })
}

/**
 * Waypoints for one sortie, in the order the G1000 file flies them.
 * Sortie 1 follows the crew's chosen side. Sortie 2 is the other side, reversed.
 */
export function crewOffsetSortieTrack(opts: {
  points: OffsetRoutePoint[]
  legWidths: OffsetLegWidth[]
  sortie1Side: SortieSide
  sortieNumber: 1 | 2
  shapePoints?: Array<{ lat: number; lon: number; ptIdent?: string; originalName?: string }>
}): { side: SortieSide; waypoints: OffsetRoutePoint[] } | { error: string } {
  const built = buildOffsetRoutes(opts.points, opts.legWidths, opts.shapePoints)
  if (built.nameError) return { error: built.nameError }
  return orderSortieTrack({
    inner: built.inner.waypoints,
    outer: built.outer.waypoints,
    sortie1Side: opts.sortie1Side,
    sortieNumber: opts.sortieNumber,
  })
}

/**
 * One crew's offset .fpl, built with the same helpers as the Map View download.
 * Waypoints are already in the order that sortie should fly.
 */
export function buildCoordinatorCrewOffsetFile(opts: {
  routeLabel: string
  points: OffsetRoutePoint[]
  legWidths: OffsetLegWidth[]
  sortie1Side: SortieSide
  sortieNumber: 1 | 2
  shapePoints?: Array<{ lat: number; lon: number; ptIdent?: string; originalName?: string }>
  departure?: CoordinatorOffsetAirport | null
  destination?: CoordinatorOffsetAirport | null
}): { xml: string; filename: string; routeName: string; userNames: string[] } | { error: string } {
  const ordered = crewOffsetSortieTrack(opts)
  if ('error' in ordered) return ordered
  const file = buildSortieOffsetFpl({
    routeLabel: opts.routeLabel,
    sortieNumber: opts.sortieNumber,
    side: ordered.side,
    waypoints: ordered.waypoints.map((wp) => ({
      g1000Name: wp.g1000Name || wp.ptIdent,
      lat: wp.lat,
      lon: wp.lon,
    })),
    departure: opts.sortieNumber === 1 ? opts.departure : opts.destination,
    destination: opts.sortieNumber === 1 ? opts.destination : opts.departure,
  })
  return { ...file, userNames: ordered.waypoints.map((wp) => wp.g1000Name || wp.ptIdent) }
}
