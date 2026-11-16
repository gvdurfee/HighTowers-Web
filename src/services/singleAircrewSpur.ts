import { assignOffsetWaypointNames } from '@survey-planning/g1000Names.js'
import { routeCurveSide, type OffsetRoutePoint } from '@survey-planning/offsetRoutePlan.js'
import { orderSortieTrack, otherSortieSide, type SortieSide } from '@/services/offsetRouteFpl'
import { detectReciprocalSpurs, type SpurPoint } from '@/services/spurPreview'

export type SingleAircrewTrackPoint = OffsetRoutePoint & {
  originalName?: string
  /** Which side of the direction of flight this drawn point sits on. */
  surveySide?: 'left' | 'right'
}

type Tagged = SingleAircrewTrackPoint & { routeSide: SortieSide }

/**
 * Centerline indexes of spur tips that Sortie 1 now flies out and back.
 * A spur is the existing reciprocal check: X → Y → X, a turn of about 180°,
 * and at least one waypoint after the return. Any other reversal is not one.
 */
export function handledSpurTipIndexes(centerline: SpurPoint[]): number[] {
  return detectReciprocalSpurs(centerline).map((hit) => hit.index + 1)
}

function sourceName(point: SpurPoint | undefined, fallback: OffsetRoutePoint): string {
  return point?.originalName || point?.ptIdent || fallback.originalName || fallback.ptIdent || fallback.g1000Name || ''
}

function tagged(
  point: OffsetRoutePoint,
  routeSide: SortieSide,
  lateral: 'left' | 'right',
  source: SpurPoint | undefined
): Tagged {
  return {
    ...point,
    originalName: sourceName(source, point),
    ptIdent: point.ptIdent || source?.ptIdent || sourceName(source, point),
    routeSide,
    surveySide: lateral,
  }
}

function groupByVertex(track: OffsetRoutePoint[], centerline: SpurPoint[]): OffsetRoutePoint[][] {
  const grouped = centerline.map(() => [] as OffsetRoutePoint[])
  let index = 0
  for (const point of track) {
    if (point.ptIdent !== centerline[index]?.ptIdent) {
      let next = index + 1
      while (next < centerline.length && centerline[next]?.ptIdent !== point.ptIdent) next += 1
      if (next < centerline.length) index = next
    }
    grouped[index].push(point)
  }
  return grouped
}

function withFileNames(points: Tagged[]): SingleAircrewTrackPoint[] {
  const named = assignOffsetWaypointNames(
    points.map((point, index) => ({
      originalName: point.originalName || point.ptIdent,
      side: point.routeSide,
      sequence: index + 1,
    }))
  )
  if (named.error) {
    return points.map(({ routeSide: _routeSide, ...point }) => point)
  }
  return points.map((point, index) => {
    const { routeSide: _routeSide, ...rest } = point
    return { ...rest, g1000Name: named.names[index].g1000Name }
  })
}

/**
 * Sortie waypoint list for a single-aircrew plan.
 * A route with no reciprocal spur is returned unchanged, names included.
 * Sortie 1 flies the spur out on its own side, crosses at the far end, and
 * returns on the other side to the corner that continues on its own side.
 * Sortie 2 omits the spur and keeps that continuing corner.
 */
export function singleAircrewSortieTrack(opts: {
  centerline: SpurPoint[]
  inner: OffsetRoutePoint[]
  outer: OffsetRoutePoint[]
  sortie1Side: SortieSide
  sortieNumber: number
}): { side: SortieSide; waypoints: SingleAircrewTrackPoint[] } {
  const plain = orderSortieTrack(opts)
  const hits = detectReciprocalSpurs(opts.centerline)
  if (hits.length === 0) return plain
  const ownGroupsFor = (track: OffsetRoutePoint[]) => groupByVertex(track, opts.centerline)
  if (ownGroupsFor(opts.inner).some((group) => group.length === 0) || ownGroupsFor(opts.outer).some((group) => group.length === 0)) {
    return plain
  }

  const curve = routeCurveSide(opts.centerline)
  const side = plain.side
  const ownLateral = side === 'inner' ? curve.innerSide : curve.outerSide
  const otherSide = otherSortieSide(side)
  const otherLateral = otherSide === 'inner' ? curve.innerSide : curve.outerSide
  const ownTrack = side === 'inner' ? opts.inner : opts.outer
  const otherTrack = side === 'inner' ? opts.outer : opts.inner
  const own = groupByVertex(ownTrack, opts.centerline)
  const other = groupByVertex(otherTrack, opts.centerline)
  const sorted = [...hits].sort((a, b) => a.index - b.index)
  const pushGroup = (pieces: Tagged[], group: OffsetRoutePoint[], index: number, routeSide: SortieSide, lateral: 'left' | 'right') => {
    for (const point of group) pieces.push(tagged(point, routeSide, lateral, opts.centerline[index]))
  }

  if (opts.sortieNumber === 2) {
    const drop = new Set<number>()
    for (const hit of sorted) {
      drop.add(hit.index)
      drop.add(hit.index + 1)
    }
    const kept: Tagged[] = []
    for (let index = own.length - 1; index >= 0; index -= 1) {
      if (drop.has(index)) continue
      pushGroup(kept, [...own[index]].reverse(), index, side, ownLateral)
    }
    return { side, waypoints: withFileNames(kept) }
  }

  const pieces: Tagged[] = []
  let cursor = 0
  for (const hit of sorted) {
    const entry = hit.index
    const tip = hit.index + 1
    const back = hit.index + 2
    if (back >= own.length || entry < cursor) continue
    for (let index = cursor; index < entry; index += 1) pushGroup(pieces, own[index], index, side, ownLateral)
    pushGroup(pieces, own[entry], entry, side, ownLateral)
    pushGroup(pieces, own[tip], tip, side, ownLateral)
    pushGroup(pieces, other[tip], tip, otherSide, otherLateral)
    pushGroup(pieces, own[back], back, side, ownLateral)
    cursor = back + 1
  }
  for (let index = cursor; index < own.length; index += 1) pushGroup(pieces, own[index], index, side, ownLateral)
  return { side, waypoints: withFileNames(pieces) }
}
