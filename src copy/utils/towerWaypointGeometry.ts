/**
 * Tower / Waypoint geometry - haversine, bearing, cross-track.
 * Ported from HighTowers-2025 TowerWaypointGeometry.
 */

export interface WaypointLike {
  latitude: number
  longitude: number
  sequence: number
  originalName?: string
}

const R_NM = 3440.065 // Earth radius in nautical miles

function distanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R_NM * c
}

function bearingFromWaypointToTower(
  waypointLat: number,
  waypointLon: number,
  towerLat: number,
  towerLon: number
): number {
  const φ1 = (waypointLat * Math.PI) / 180
  const φ2 = (towerLat * Math.PI) / 180
  const Δλ = ((towerLon - waypointLon) * Math.PI) / 180
  const x = Math.sin(Δλ) * Math.cos(φ2)
  const y =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  let θ = (Math.atan2(x, y) * 180) / Math.PI
  if (θ < 0) θ += 360
  return θ
}

function distanceFromTowerToSegment(
  towerLat: number,
  towerLon: number,
  wp1Lat: number,
  wp1Lon: number,
  wp2Lat: number,
  wp2Lon: number
): number {
  const d13 = distanceNm(wp1Lat, wp1Lon, towerLat, towerLon)
  const d12 = distanceNm(wp1Lat, wp1Lon, wp2Lat, wp2Lon)
  const θ13 =
    (bearingFromWaypointToTower(wp1Lat, wp1Lon, towerLat, towerLon) *
      Math.PI) /
    180
  const θ12 =
    (bearingFromWaypointToTower(wp1Lat, wp1Lon, wp2Lat, wp2Lon) * Math.PI) /
    180
  const δ13 = d13 / R_NM
  const sinArg = Math.sin(δ13) * Math.sin(θ13 - θ12)
  const δxt = Math.asin(Math.max(-1, Math.min(1, sinArg)))
  const dxt = Math.abs(δxt) * R_NM
  const cosδxt = Math.cos(δxt)
  if (cosδxt <= 1e-10) return dxt
  const δat = Math.acos(Math.min(1, Math.cos(δ13) / cosδxt))
  const dat = δat * R_NM
  if (dat < 0) return d13
  if (dat > d12) return distanceNm(towerLat, towerLon, wp2Lat, wp2Lon)
  return dxt
}

export function nearestWaypointInfo(
  towerLat: number,
  towerLon: number,
  waypoints: WaypointLike[]
): { waypoint: WaypointLike; distanceNm: number; bearingDeg: number } | null {
  const sorted = [...waypoints].sort((a, b) => a.sequence - b.sequence)
  if (sorted.length < 1) return null

  if (sorted.length === 1) {
    const wp = sorted[0]
    const dist = distanceNm(towerLat, towerLon, wp.latitude, wp.longitude)
    const bearing = bearingFromWaypointToTower(
      wp.latitude,
      wp.longitude,
      towerLat,
      towerLon
    )
    return { waypoint: wp, distanceNm: dist, bearingDeg: bearing }
  }

  let bestSegmentDist = Infinity
  let closestWaypoint: WaypointLike | null = null
  let bestDistFromWaypoint = Infinity
  let bestBearing = 0

  for (let i = 0; i < sorted.length - 1; i++) {
    const wp1 = sorted[i]
    const wp2 = sorted[i + 1]
    const segDist = distanceFromTowerToSegment(
      towerLat,
      towerLon,
      wp1.latitude,
      wp1.longitude,
      wp2.latitude,
      wp2.longitude
    )
    if (segDist >= bestSegmentDist) continue

    bestSegmentDist = segDist
    const d1 = distanceNm(towerLat, towerLon, wp1.latitude, wp1.longitude)
    const d2 = distanceNm(towerLat, towerLon, wp2.latitude, wp2.longitude)
    if (d1 <= d2) {
      closestWaypoint = wp1
      bestDistFromWaypoint = d1
      bestBearing = bearingFromWaypointToTower(
        wp1.latitude,
        wp1.longitude,
        towerLat,
        towerLon
      )
    } else {
      closestWaypoint = wp2
      bestDistFromWaypoint = d2
      bestBearing = bearingFromWaypointToTower(
        wp2.latitude,
        wp2.longitude,
        towerLat,
        towerLon
      )
    }
  }

  if (!closestWaypoint) return null
  return {
    waypoint: closestWaypoint,
    distanceNm: bestDistFromWaypoint,
    bearingDeg: bestBearing,
  }
}

export function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceNm: number
): { lat: number; lon: number } {
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const θ = (bearingDeg * Math.PI) / 180
  const d = distanceNm / R_NM
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ)
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
    )
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI }
}

export function shortWaypointId(originalName: string): string {
  const parts = originalName.split('-')
  return parts[parts.length - 1] ?? originalName
}
