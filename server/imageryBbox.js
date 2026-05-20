const METERS_PER_DEG_LAT = 111_320
const MILES_TO_METERS = 1609.344

/** @param {number} centerLat @param {number} centerLon @param {number} halfSideMiles */
export function computeSquareBbox(centerLat, centerLon, halfSideMiles = 0.5) {
  const halfM = halfSideMiles * MILES_TO_METERS
  const dLat = halfM / METERS_PER_DEG_LAT
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.max(cosLat, 0.01)
  const dLon = halfM / metersPerDegLon
  return {
    west: centerLon - dLon,
    east: centerLon + dLon,
    south: centerLat - dLat,
    north: centerLat + dLat,
  }
}
