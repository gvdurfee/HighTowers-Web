/**
 * Geometry for georeferenced raster overlays (Mapbox `image` sources).
 * @see docs/IMAGERY_OVERLAY_IMPLEMENTATION.md
 */

const METERS_PER_DEG_LAT = 111_320
const MILES_TO_METERS = 1609.344

export type LngLat = [number, number]

/** West, south, east, north in decimal degrees */
export type Wgs84Bbox = { west: number; south: number; east: number; north: number }

/**
 * Half-width of a square in meters at latitude `latDeg` (for longitude spacing).
 */
function metersPerDegLon(latDeg: number): number {
  return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180)
}

/**
 * Axis-aligned square bbox in WGS-84 centered at (lat, lon).
 * @param halfSideMiles Half of the square's width (and height) in miles (default 0.5 mi → 1 mi square).
 */
export function computeSquareBbox(
  centerLat: number,
  centerLon: number,
  halfSideMiles: number = 0.5
): Wgs84Bbox {
  const halfM = halfSideMiles * MILES_TO_METERS
  const dLat = halfM / METERS_PER_DEG_LAT
  const dLon = halfM / metersPerDegLon(centerLat)
  return {
    west: centerLon - dLon,
    east: centerLon + dLon,
    south: centerLat - dLat,
    north: centerLat + dLat,
  }
}

/**
 * Mapbox GL `image` source `coordinates`: clockwise from top-left
 * (see https://docs.mapbox.com/mapbox-gl-js/style-spec/sources/#image).
 */
export function bboxToImageCoordinates(b: Wgs84Bbox): [LngLat, LngLat, LngLat, LngLat] {
  const { west, south, east, north } = b
  return [
    [west, north], // top-left
    [east, north], // top-right
    [east, south], // bottom-right
    [west, south], // bottom-left
  ]
}

/**
 * Full helper: default ~1 statute mile square centered on map center.
 */
export function computeOneMileSquareImageCoordinates(
  centerLat: number,
  centerLon: number
): [LngLat, LngLat, LngLat, LngLat] {
  return bboxToImageCoordinates(computeSquareBbox(centerLat, centerLon, 0.5))
}
