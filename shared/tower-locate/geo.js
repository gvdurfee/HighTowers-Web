/**
 * Pure geo helpers for Gemini tower-locate experiment (client + server + tests).
 */

const METERS_PER_DEG_LAT = 111_320
const NM_TO_METERS = 1852

/**
 * Great-circle distance in meters (haversine).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lon2 - lon1)
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function metersToNm(m) {
  return m / NM_TO_METERS
}

/**
 * Axis-aligned square bbox (degrees) centered on lat/lon.
 * @param {number} lat
 * @param {number} lon
 * @param {number} halfSideNm half-width of square in nautical miles
 */
export function squareBboxNm(lat, lon, halfSideNm) {
  const halfM = halfSideNm * NM_TO_METERS
  const dLat = halfM / METERS_PER_DEG_LAT
  const dLon = halfM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  return {
    west: lon - dLon,
    east: lon + dLon,
    south: lat - dLat,
    north: lat + dLat,
  }
}

/**
 * Convert pixel offset in a square satellite tile to lat/lon.
 * Tile is assumed north-up, centered on centerLat/centerLon, covering ±halfSideNm.
 * Pixel (0,0) = NW corner; +x east, +y south (image coordinates).
 */
export function pixelOffsetToLatLon(opts) {
  const {
    centerLat,
    centerLon,
    halfSideNm,
    pixelX,
    pixelY,
    widthPx,
    heightPx,
  } = opts
  const bbox = squareBboxNm(centerLat, centerLon, halfSideNm)
  const u = (Number(pixelX) + 0.5) / Number(widthPx)
  const v = (Number(pixelY) + 0.5) / Number(heightPx)
  const lon = bbox.west + u * (bbox.east - bbox.west)
  const lat = bbox.north - v * (bbox.north - bbox.south)
  return { lat, lon }
}

/**
 * Build one comparison row for the eval table.
 */
export function buildEvalRow(input) {
  const {
    id,
    timestamp,
    missionId,
    towerLabel,
    priorLat,
    priorLon,
    humanLat,
    humanLon,
    geminiLat,
    geminiLon,
    confidence,
    model,
    imagerySource,
    notes,
    rawReason,
  } = input

  const errorMeters =
    Number.isFinite(humanLat) &&
    Number.isFinite(humanLon) &&
    Number.isFinite(geminiLat) &&
    Number.isFinite(geminiLon)
      ? haversineMeters(humanLat, humanLon, geminiLat, geminiLon)
      : null

  return {
    id,
    timestamp,
    missionId: missionId ?? '',
    towerLabel: towerLabel ?? '',
    priorLat,
    priorLon,
    humanLat,
    humanLon,
    geminiLat,
    geminiLon,
    errorMeters: errorMeters != null ? Math.round(errorMeters * 10) / 10 : null,
    errorNm:
      errorMeters != null ? Math.round(metersToNm(errorMeters) * 1000) / 1000 : null,
    confidence: confidence ?? null,
    model: model ?? '',
    imagerySource: imagerySource ?? '',
    notes: notes ?? '',
    rawReason: rawReason ?? '',
  }
}

export const EVAL_CSV_HEADER = [
  'id',
  'timestamp',
  'missionId',
  'towerLabel',
  'priorLat',
  'priorLon',
  'humanLat',
  'humanLon',
  'geminiLat',
  'geminiLon',
  'errorMeters',
  'errorNm',
  'confidence',
  'model',
  'imagerySource',
  'notes',
].join(',')

export function evalRowToCsvLine(row) {
  const cells = [
    row.id,
    row.timestamp,
    row.missionId,
    row.towerLabel,
    row.priorLat,
    row.priorLon,
    row.humanLat,
    row.humanLon,
    row.geminiLat,
    row.geminiLon,
    row.errorMeters ?? '',
    row.errorNm ?? '',
    row.confidence ?? '',
    row.model,
    row.imagerySource,
    csvEscape(row.notes),
  ]
  return cells.join(',')
}

function csvEscape(s) {
  const t = String(s ?? '')
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}
