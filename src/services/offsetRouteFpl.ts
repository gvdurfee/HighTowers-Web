import { G1000Service } from '@/services/g1000'
import {
  G1000_ROUTE_NAME_MAX_LEN,
  sortieFileName,
  sortieRouteName,
} from '@survey-planning/g1000Names.js'
import { reverseOffsetTrack, type OffsetRoutePoint } from '@survey-planning/offsetRoutePlan.js'

type AirportLike = {
  identifier: string
  name?: string
  latitude: number
  longitude: number
  elevation?: number
}

type OffsetWaypoint = {
  g1000Name: string
  lat: number
  lon: number
}

export type SortieSide = 'inner' | 'outer'

export function otherSortieSide(side: SortieSide): SortieSide {
  return side === 'inner' ? 'outer' : 'inner'
}

/**
 * The waypoint list one sortie flies, in file order.
 * Sortie 1 is the chosen side. Sortie 2 is the other side, reversed.
 * Map labels and the .fpl download both use this list.
 */
export function orderSortieTrack(opts: {
  inner: OffsetRoutePoint[]
  outer: OffsetRoutePoint[]
  sortie1Side: SortieSide
  sortieNumber: 1 | 2
}): { side: SortieSide; waypoints: OffsetRoutePoint[] } {
  const side = opts.sortieNumber === 1 ? opts.sortie1Side : otherSortieSide(opts.sortie1Side)
  const track = side === 'inner' ? opts.inner : opts.outer
  const waypoints = opts.sortieNumber === 1 ? track : reverseOffsetTrack(track)
  return { side, waypoints }
}

export function sortie2Explanation(_departureIdent: string | null | undefined): string {
  return 'Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own .fpl file.'
}

export function missingSortieChoiceNotice(): string {
  return 'Choose Sortie 1 side in Flight Plans before downloading offset routes.'
}

/** Inner or outer halfway track as one G1000 sortie. Waypoints are already in flight order. */
export function buildSortieOffsetFpl(opts: {
  routeLabel: string
  sortieNumber: 1 | 2
  side: SortieSide
  waypoints: OffsetWaypoint[]
  departure?: AirportLike | null
  destination?: AirportLike | null
}): { xml: string; filename: string; routeName: string } {
  const toAirport = (airport: AirportLike) => ({
    identifier: airport.identifier,
    name: airport.name ?? airport.identifier,
    latitude: airport.latitude,
    longitude: airport.longitude,
    elevation: airport.elevation,
  })
  const routeName = sortieRouteName(opts.routeLabel, opts.sortieNumber, opts.side)
  const sideLabel = opts.side

  const xml = G1000Service.generateFlightPlan({
    id: routeName,
    name: routeName,
    routeName,
    departureAirport: opts.departure ? toAirport(opts.departure) : undefined,
    destinationAirport: opts.destination ? toAirport(opts.destination) : undefined,
    waypoints: opts.waypoints.map((wp, sequence) => ({
      id: `${sideLabel}-${sequence}`,
      originalName: wp.g1000Name,
      g1000Name: wp.g1000Name,
      latitude: wp.lat,
      longitude: wp.lon,
      routeType: 'IR',
      sequence,
    })),
  })

  return {
    xml,
    filename: sortieFileName(opts.routeLabel, opts.sortieNumber, opts.side),
    routeName: routeName.slice(0, G1000_ROUTE_NAME_MAX_LEN),
  }
}
