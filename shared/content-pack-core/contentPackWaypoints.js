/**
 * Waypoint CSV helpers (shared). Port of src/utils/contentPackWaypoints.ts (minus flight-plan-specific bits).
 */
import {
  findHeaderIndex,
  formatUserWaypointCsvLatLon,
  getCell,
  setCell,
} from './foreflightUserWaypointsCsv.js'

/** Re-exported for `src/utils/contentPackWaypoints.ts` and consumers of this package. */
export { findHeaderIndex, formatUserWaypointCsvLatLon, getCell, setCell }

export function metersBetween(a, b) {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

export function suffixToIndex(suffix) {
  const s = suffix.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(s)) return null
  let n = 0
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 65 + 1)
  }
  return n - 1
}

export function indexToSuffix(idx) {
  let n = idx + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export function nextWaypointName(routeNumber, existingNames) {
  const prefix = routeNumber.trim()
  const indices = []
  for (const name of existingNames) {
    const m = name.trim().toUpperCase().match(/^(\d+)([A-Z]+)$/)
    if (!m) continue
    if (m[1] !== prefix) continue
    const idx = suffixToIndex(m[2])
    if (idx != null) indices.push(idx)
  }
  const next = (indices.length ? Math.max(...indices) : -1) + 1
  return `${prefix}${indexToSuffix(next)}`
}

/**
 * Derive a content pack's primary MTR route number from its waypoint names
 * (e.g. "112A", "112B", … → "112"). Returns the most common numeric prefix,
 * or `null` when no rows look like MTR-style waypoints.
 *
 * Used at upload time and by the migration backfill so that callers can
 * auto-match a pack to the route it covers without an extra join.
 *
 * @param {{ header: string[], rows: string[][] }} doc
 * @returns {string | null}
 */
export function primaryRouteNumberFromCsvDoc(doc) {
  const cols = inferUserWaypointsColumns(doc)
  if (cols.nameIdx == null) return null
  const counts = new Map()
  for (const r of doc.rows) {
    const cell = getCell(r, cols.nameIdx)
    if (!cell) continue
    const m = cell.trim().toUpperCase().match(/^(\d+)[A-Z]+$/)
    if (!m) continue
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  let best = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = k
    }
  }
  return best
}

export function inferUserWaypointsColumns(doc) {
  return {
    nameIdx: findHeaderIndex(doc.header, ['WAYPOINT_NAME', 'waypoint_name', 'Waypoint name']),
    descIdx: findHeaderIndex(doc.header, ['Waypoint description', 'Description', 'desc']),
    latIdx: findHeaderIndex(doc.header, ['Latitude', 'Lat']),
    lonIdx: findHeaderIndex(doc.header, ['Longitude', 'Lon', 'Long']),
    elevIdx: findHeaderIndex(doc.header, ['Elevation', 'Elev']),
  }
}

export function assertForeFlightUserWaypointsShape(doc) {
  const cols = inferUserWaypointsColumns(doc)
  if (cols.nameIdx == null || cols.latIdx == null || cols.lonIdx == null) {
    throw new Error(
      'This file does not look like ForeFlight user_waypoints data (need Waypoint name, Latitude, and Longitude columns). ' +
        'Use the file inside navdata in your Content Pack, not a macOS metadata file or a document saved from Numbers/Pages.'
    )
  }
}

export function existingWaypointNames(doc, cols) {
  if (cols.nameIdx == null) return []
  return doc.rows.map((r) => getCell(r, cols.nameIdx)).filter(Boolean)
}

export function existingWaypointCoords(doc, cols) {
  if (cols.latIdx == null || cols.lonIdx == null) return []
  const out = []
  for (const r of doc.rows) {
    const lat = Number(getCell(r, cols.latIdx))
    const lon = Number(getCell(r, cols.lonIdx))
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({ lat, lon })
  }
  return out
}

export function makeEmptyRowLike(doc) {
  return new Array(doc.header.length).fill('')
}

export function appendTowerAsWaypointRow(doc, cols, name, coord) {
  const row = makeEmptyRowLike(doc)
  setCell(row, cols.nameIdx, name)
  setCell(row, cols.latIdx, formatUserWaypointCsvLatLon(coord.lat))
  setCell(row, cols.lonIdx, formatUserWaypointCsvLatLon(coord.lon))
  if (doc.rows.length > 0) {
    const template = doc.rows[0]
    if (cols.descIdx != null) setCell(row, cols.descIdx, getCell(template, cols.descIdx))
    if (cols.elevIdx != null) setCell(row, cols.elevIdx, getCell(template, cols.elevIdx))
  } else {
    setCell(row, cols.descIdx, '')
    setCell(row, cols.elevIdx, '')
  }
  doc.rows.push(row)
}
