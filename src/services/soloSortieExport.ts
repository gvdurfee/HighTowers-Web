import type { OffsetRoutePoint } from '@survey-planning/offsetRoutePlan.js'
import {
  assessSavedOffsetPlan,
  RESAVE_IN_MAP_VIEW,
  type OffsetFreshnessInput,
  type OffsetPlanPoint,
  type SavedOffsetPlan,
} from '@/services/offsetPlanRecord'
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

export function pointOrderLabel(point: NamedPoint): string {
  return point.originalName || point.ptIdent || point.g1000Name || 'point'
}

export type SoloSortieCard = {
  sortieNumber: 1 | 2
  role: SortieSide
  lateral: LateralSide
  label: string
  fromIdent: string
  toIdent: string
  order: string[]
  enabled: boolean
  disabledReason: string | null
}

export type SoloSortiePanel =
  | { status: 'hidden' }
  | { status: 'none' }
  | { status: 'stale'; reason: 'legacy' | 'sequence' | 'fingerprint'; savedAt: string; cards: [SoloSortieCard, SoloSortieCard] }
  | { status: 'choose-side'; cards: [SoloSortieCard, SoloSortieCard] }
  | { status: 'ready'; cards: [SoloSortieCard, SoloSortieCard] }

function disabledCard(
  sortieNumber: 1 | 2,
  reason: string,
  label = 'Waiting for a saved offset plan'
): SoloSortieCard {
  return {
    sortieNumber,
    role: 'inner',
    lateral: 'left',
    label,
    fromIdent: '',
    toIdent: '',
    order: [],
    enabled: false,
    disabledReason: reason,
  }
}

function cardFor(opts: {
  sortieNumber: 1 | 2
  sortie1Side: SortieSide
  curve: RouteCurveSides
  plan: SavedOffsetPlan
  fromIdent: string
  toIdent: string
  enabled: boolean
  disabledReason: string | null
  /** When set, a reciprocal spur is flown once on Sortie 1 and omitted on Sortie 2. */
  singleAircrew?: boolean
  centerline?: Array<{ lat: number; lon: number; originalName?: string; ptIdent?: string }>
}): SoloSortieCard {
  const plain = orderSortieTrack({
    inner: opts.plan.inner as OffsetRoutePoint[],
    outer: opts.plan.outer as OffsetRoutePoint[],
    sortie1Side: opts.sortie1Side,
    sortieNumber: opts.sortieNumber,
  })
  const ordered =
    opts.singleAircrew && opts.centerline
      ? singleAircrewSortieTrack({
          centerline: opts.centerline,
          inner: opts.plan.inner as OffsetRoutePoint[],
          outer: opts.plan.outer as OffsetRoutePoint[],
          sortie1Side: opts.sortie1Side,
          sortieNumber: opts.sortieNumber,
        })
      : plain
  const lateral = lateralFor(ordered.side, opts.curve)
  const rewritten = ordered.waypoints.length !== plain.waypoints.length
  return {
    sortieNumber: opts.sortieNumber,
    role: ordered.side,
    lateral,
    label: sideOfRouteLabel(ordered.side, lateral),
    fromIdent: opts.fromIdent,
    toIdent: opts.toIdent,
    order: rewritten
      ? ordered.waypoints.map((point) => point.g1000Name || point.ptIdent)
      : (ordered.waypoints as NamedPoint[]).map(pointOrderLabel),
    enabled: opts.enabled,
    disabledReason: opts.disabledReason,
  }
}

/**
 * Detail-page offer for the two solo offset files.
 * Coordinates come only from the plan Map View saved. This does not rebuild offsets.
 */
export function soloSortiePanel(opts: {
  isAnchorPlan: boolean
  saved: SavedOffsetPlan | undefined
  freshness: OffsetFreshnessInput
  sortie1Side: SortieSide | null | undefined
  curve: RouteCurveSides
  departureIdent: string | null
  destinationIdent: string | null
  singleAircrew?: boolean
  centerline?: Array<{ lat: number; lon: number; originalName?: string; ptIdent?: string }>
}): SoloSortiePanel {
  if (opts.isAnchorPlan) return { status: 'hidden' }
  const decision = assessSavedOffsetPlan(opts.saved, opts.freshness)
  if (decision.status === 'none') return { status: 'none' }
  const side = opts.sortie1Side === 'inner' || opts.sortie1Side === 'outer' ? opts.sortie1Side : null
  const from = opts.departureIdent ?? 'Departure'
  const to = opts.destinationIdent ?? 'Destination'
  const airportReason =
    opts.departureIdent && opts.destinationIdent
      ? null
      : 'Set a departure and a destination before downloading.'
  if (decision.status === 'stale') {
    const reason = RESAVE_IN_MAP_VIEW
    const cards = [1, 2].map((sortieNumber) => {
      const role = side ? (sortieNumber === 1 ? side : otherSortieSide(side)) : null
      const label = role
        ? sideOfRouteLabel(role, lateralFor(role, opts.curve))
        : 'Waiting for a matching Map View save'
      return disabledCard(sortieNumber as 1 | 2, reason, label)
    }) as [SoloSortieCard, SoloSortieCard]
    return { status: 'stale', reason: decision.reason, savedAt: decision.savedAt, cards }
  }
  if (!side) {
    const reason = 'Choose the side flown first. Downloads stay off until you choose a side.'
    const cards = [1, 2].map((sortieNumber) =>
      disabledCard(sortieNumber as 1 | 2, reason, 'Choose the side flown first')
    ) as [SoloSortieCard, SoloSortieCard]
    return { status: 'choose-side', cards }
  }
  const cards = [1, 2].map((sortieNumber) =>
    cardFor({
      sortieNumber: sortieNumber as 1 | 2,
      sortie1Side: side,
      curve: opts.curve,
      plan: decision.plan,
      fromIdent: sortieNumber === 1 ? from : to,
      toIdent: sortieNumber === 1 ? to : from,
      enabled: airportReason == null,
      disabledReason: airportReason,
      singleAircrew: opts.singleAircrew,
      centerline: opts.centerline,
    })
  ) as [SoloSortieCard, SoloSortieCard]
  return { status: 'ready', cards }
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
