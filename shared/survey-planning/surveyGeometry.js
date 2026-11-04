/**
 * Great-circle distance and parallel-track offset list helpers for survey planning.
 */

const EARTH_RADIUS_M = 6371000
const M_PER_NM = 1852

/**
 * @typedef {object} LatLon
 * @property {number} lat
 * @property {number} lon
 */

/**
 * Haversine distance in meters.
 * @param {LatLon} a
 * @param {LatLon} b
 */
export function metersBetween(a, b) {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

/**
 * @param {LatLon} a
 * @param {LatLon} b
 * @returns {number} nautical miles
 */
export function nauticalMilesBetween(a, b) {
  return metersBetween(a, b) / M_PER_NM
}

/**
 * @typedef {object} ParallelTrackPolicy
 * @property {number} firstOffsetNm - First G1000 parallel offset (default 3)
 * @property {number} stepNm - Spacing between track centers (default 6)
 * @property {number} [outerMarginNm] - Kept for older callers. Passes stop at the published width.
 */

export const DEFAULT_PARALLEL_TRACK_POLICY = {
  firstOffsetNm: 3,
  stepNm: 6,
  outerMarginNm: 0,
}

export const NO_PUBLISHED_WIDTH_NOTE = 'No published width for this side.'
export const NO_OFFSET_INSIDE_NOTE = 'No offset fits inside the published width.'
export const OFFSET_PAST_EDGE_NOTE = 'Offsets past the corridor edge are not planned.'

/**
 * Parallel offsets at or inside the published half-width.
 * A 20 NM side at 3 NM / 6 NM spacing is 3, 9, 15. 21 is past the edge and is dropped.
 * Nothing is added when the first offset is already past the width.
 * @param {number | null | undefined} halfWidthNm
 * @param {Partial<ParallelTrackPolicy>} [policy]
 * @returns {number[]}
 */
export function parallelOffsetsForHalfWidth(halfWidthNm, policy = {}) {
  const p = { ...DEFAULT_PARALLEL_TRACK_POLICY, ...policy }
  const width = Number(halfWidthNm)
  if (!Number.isFinite(width) || width <= 0) return []
  if (!Number.isFinite(p.firstOffsetNm) || p.firstOffsetNm <= 0) return []
  if (!Number.isFinite(p.stepNm) || p.stepNm <= 0) return []
  const offsets = []
  let o = p.firstOffsetNm
  while (o <= width + 1e-6) {
    offsets.push(o)
    o += p.stepNm
  }
  return offsets
}

/**
 * Keep only offsets that sit on or inside the published width.
 * A missing width plans nothing.
 * @param {number[] | null | undefined} offsets
 * @param {number | null | undefined} halfWidthNm
 * @returns {{ offsets: number[], dropped: number[], note: string | null }}
 */
export function offsetsInsidePublishedWidth(offsets, halfWidthNm) {
  const width = Number(halfWidthNm)
  if (!Number.isFinite(width) || width <= 0) {
    return { offsets: [], dropped: [], note: NO_PUBLISHED_WIDTH_NOTE }
  }
  const kept = []
  const dropped = []
  for (const offset of offsets ?? []) {
    if (!Number.isFinite(offset) || offset <= 0) continue
    if (offset <= width + 1e-6) kept.push(offset)
    else dropped.push(offset)
  }
  if (kept.length === 0) {
    return { offsets: [], dropped, note: NO_OFFSET_INSIDE_NOTE }
  }
  return {
    offsets: kept,
    dropped,
    note: dropped.length > 0 ? OFFSET_PAST_EDGE_NOTE : null,
  }
}

/**
 * @param {number[]} leftOffsets
 * @param {number[]} rightOffsets
 * @returns {string}
 */
export function formatOffsetsPerSide(leftOffsets, rightOffsets) {
  const parts = []
  if (leftOffsets?.length) parts.push(`L ${leftOffsets.join(', ')}`)
  if (rightOffsets?.length) parts.push(`R ${rightOffsets.join(', ')}`)
  return parts.join(' / ')
}

/**
 * Centerline chain length in NM along ordered waypoints (sum of consecutive legs).
 * @param {Array<{ lat: number, lon: number, ptIdent?: string }>} orderedWaypoints
 * @param {number} startIdx inclusive
 * @param {number} endIdx inclusive
 */
export function chainLengthNm(orderedWaypoints, startIdx, endIdx) {
  if (startIdx >= endIdx || orderedWaypoints.length < 2) return 0
  let total = 0
  for (let i = startIdx; i < endIdx; i++) {
    const a = orderedWaypoints[i]
    const b = orderedWaypoints[i + 1]
    total += nauticalMilesBetween(
      { lat: a.lat, lon: a.lon },
      { lat: b.lat, lon: b.lon }
    )
  }
  return total
}

/**
 * Index of waypoint closest to departure (entry recommendation).
 * @param {LatLon} departure
 * @param {Array<{ lat: number, lon: number }>} waypoints
 */
export function closestWaypointIndex(departure, waypoints) {
  let best = 0
  let bestNm = Infinity
  for (let i = 0; i < waypoints.length; i++) {
    const nm = nauticalMilesBetween(departure, {
      lat: waypoints[i].lat,
      lon: waypoints[i].lon,
    })
    if (nm < bestNm) {
      bestNm = nm
      best = i
    }
  }
  return best
}

/**
 * Estimate NM for one sortie: multi-offset maneuver on a waypoint sub-chain.
 * @param {object} opts
 * @param {number} opts.ferryInNm - dep → entry
 * @param {number} opts.chainNm - centerline length of assigned range
 * @param {number} opts.offsetLegCount - number of directed legs (equals offsets.length)
 * @param {number} opts.ferryOutNm - last position → dep
 */
export function estimateSortieNm({ ferryInNm, chainNm, offsetLegCount, ferryOutNm }) {
  return ferryInNm + offsetLegCount * chainNm + ferryOutNm
}
