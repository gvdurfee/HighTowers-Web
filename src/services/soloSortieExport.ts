import type { OffsetRoutePoint } from '@survey-planning/offsetRoutePlan.js'
import { type OffsetPlanPoint, type SavedOffsetPlan } from '@/services/offsetPlanRecord'
import {
  buildSortieOffsetFpl,
  orderSortieTrack,
  otherSortieSide,
  type SortieSide,
} from '@/services/offsetRouteFpl'
import { singleAircrewSortieTrack } from '@/services/singleAircrewSpur'

export type LateralSide = 'left' | 'right'

export type RouteCurveSides = {
  innerSide: LateralSide
  outerSide: LateralSide
}

type AirportLike = {
  identifier: string
  name?: string
  latitude: number
  longitude: number
  elevation?: number
}

type NamedPoint = OffsetPlanPoint & { originalName?: string }

export function sideOfRouteLabel(role: SortieSide, lateral: LateralSide): string {
  const name = role === 'inner' ? 'Inner' : 'Outer'
  const place = role === 'inner' ? 'inside the curve' : 'outside the curve'
  return `${name}, ${lateral} of the route (${place})`
}

export function lateralFor(role: SortieSide, curve: RouteCurveSides): LateralSide {
  return role === 'inner' ? curve.innerSide : curve.outerSide
}

/** Build one sortie file from the saved inner or outer track. Does not recompute geometry. */
export function soloSortieDownload(opts: {
  routeLabel: string
  sortieNumber: 1 | 2
  sortie1Side: SortieSide
  plan: SavedOffsetPlan
  departure?: AirportLike | null
  destination?: AirportLike | null
  singleAircrew?: boolean
  centerline?: Array<{ lat: number; lon: number; originalName?: string; ptIdent?: string }>
}): { xml: string; filename: string; routeName: string; side: SortieSide; points: NamedPoint[] } {
  const ordered =
    opts.singleAircrew && opts.centerline
      ? singleAircrewSortieTrack({
          centerline: opts.centerline,
          inner: opts.plan.inner as OffsetRoutePoint[],
          outer: opts.plan.outer as OffsetRoutePoint[],
          sortie1Side: opts.sortie1Side,
          sortieNumber: opts.sortieNumber,
        })
      : orderSortieTrack({
          inner: opts.plan.inner as OffsetRoutePoint[],
          outer: opts.plan.outer as OffsetRoutePoint[],
          sortie1Side: opts.sortie1Side,
          sortieNumber: opts.sortieNumber,
        })
  const points = ordered.waypoints as NamedPoint[]
  const file = buildSortieOffsetFpl({
    routeLabel: opts.routeLabel,
    sortieNumber: opts.sortieNumber,
    side: ordered.side,
    waypoints: points.map((point) => ({
      g1000Name: point.g1000Name || point.ptIdent,
      lat: point.lat,
      lon: point.lon,
    })),
    departure: opts.sortieNumber === 1 ? opts.departure : opts.destination,
    destination: opts.sortieNumber === 1 ? opts.destination : opts.departure,
  })
  return { ...file, side: ordered.side, points }
}

export function oppositeSideSentence(sortie1Side: SortieSide | null | undefined, curve: RouteCurveSides): string {
  if (sortie1Side !== 'inner' && sortie1Side !== 'outer') {
    return 'Sortie 2 is flown on the opposite side of the one you choose here.'
  }
  const opposite = otherSortieSide(sortie1Side)
  return `Sortie 2 is flown on the opposite side: ${sideOfRouteLabel(opposite, lateralFor(opposite, curve))}.`
}
