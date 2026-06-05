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
 * @property {number} outerMarginNm - NM past published half-width on last track (default 1)
 */

export const DEFAULT_PARALLEL_TRACK_POLICY = {
  firstOffsetNm: 3,
  stepNm: 6,
  outerMarginNm: 1,
}

/**
 * G1000 parallel offsets for one side given published half-width (e.g. 20 NM → [3,9,15,21]).
 * @param {number} halfWidthNm
 * @param {Partial<ParallelTrackPolicy>} [policy]
 * @returns {number[]}
 */
export function parallelOffsetsForHalfWidth(halfWidthNm, policy = {}) {
  const p = { ...DEFAULT_PARALLEL_TRACK_POLICY, ...policy }
  const target = halfWidthNm + p.outerMarginNm
  const offsets = []
  let o = p.firstOffsetNm
  while (o <= target + 1e-6) {
    offsets.push(o)
    o += p.stepNm
  }
  if (offsets.length === 0) offsets.push(p.firstOffsetNm)
  return offsets
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
