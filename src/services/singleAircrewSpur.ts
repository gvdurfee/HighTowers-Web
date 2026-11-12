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
  sortieNumber: 1 | 2
}): { side: SortieSide; waypoints: SingleAircrewTrackPoint[] } {
  const plain = orderSortieTrack(opts)
  const hits = detectReciprocalSpurs(opts.centerline)
  if (hits.length === 0) return plain
  if (opts.inner.length !== opts.centerline.length || opts.outer.length !== opts.centerline.length) return plain

  const curve = routeCurveSide(opts.centerline)
  const side = plain.side
  const ownLateral = side === 'inner' ? curve.innerSide : curve.outerSide
  const otherSide = otherSortieSide(side)
  const otherLateral = otherSide === 'inner' ? curve.innerSide : curve.outerSide
  const own = side === 'inner' ? opts.inner : opts.outer
  const other = side === 'inner' ? opts.outer : opts.inner
  const sorted = [...hits].sort((a, b) => a.index - b.index)

  if (opts.sortieNumber === 2) {
    const drop = new Set<number>()
    for (const hit of sorted) {
      drop.add(hit.index)
      drop.add(hit.index + 1)
    }
    const kept = own
      .map((point, index) => ({ point, index }))
      .filter((item) => !drop.has(item.index))
      .reverse()
    return {
      side,
      waypoints: withFileNames(
        kept.map((item) => tagged(item.point, side, ownLateral, opts.centerline[item.index]))
      ),
    }
  }

  const pieces: Tagged[] = []
  let cursor = 0
  for (const hit of sorted) {
    const entry = hit.index
    const tip = hit.index + 1
    const back = hit.index + 2
    if (back >= own.length || entry < cursor) continue
    for (let index = cursor; index < entry; index += 1) {
      pieces.push(tagged(own[index], side, ownLateral, opts.centerline[index]))
    }
    pieces.push(tagged(own[entry], side, ownLateral, opts.centerline[entry]))
    pieces.push(tagged(own[tip], side, ownLateral, opts.centerline[tip]))
    pieces.push(tagged(other[tip], otherSide, otherLateral, opts.centerline[tip]))
    pieces.push(tagged(own[back], side, ownLateral, opts.centerline[back]))
    cursor = back + 1
  }
  for (let index = cursor; index < own.length; index += 1) {
    pieces.push(tagged(own[index], side, ownLateral, opts.centerline[index]))
  }
  return { side, waypoints: withFileNames(pieces) }
}
