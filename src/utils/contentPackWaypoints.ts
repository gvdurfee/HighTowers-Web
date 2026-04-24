import type { WaypointRecord } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import {
  findHeaderIndex,
  getCell,
  setCell,
  type ForeFlightUserWaypointsCsv,
} from '@/utils/foreflightUserWaypointsCsv'

export type LatLon = { lat: number; lon: number }

export function primaryRouteNumberFromWaypoints(waypoints: WaypointRecord[]): string | null {
  const counts = new Map<string, number>()
  for (const w of waypoints) {
    const p = parseWaypointCode(w.originalName)
    if (!p) continue
    counts.set(p.routeNumber, (counts.get(p.routeNumber) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = k
    }
  }
  return best
}

export function metersBetween(a: LatLon, b: LatLon): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const s =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// A..Z => 0..25, AA => 26, AB => 27, ...
export function suffixToIndex(suffix: string): number | null {
  const s = suffix.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(s)) return null
  let n = 0
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 65 + 1)
  }
  return n - 1
}

export function indexToSuffix(idx: number): string {
  let n = idx + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export function nextWaypointName(routeNumber: string, existingNames: string[]): string {
  const prefix = routeNumber.trim()
  const indices: number[] = []
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

export type CsvColumns = {
  nameIdx: number | null
  descIdx: number | null
  latIdx: number | null
  lonIdx: number | null
  elevIdx: number | null
}

export function inferUserWaypointsColumns(doc: ForeFlightUserWaypointsCsv): CsvColumns {
  return {
    nameIdx: findHeaderIndex(doc.header, ['WAYPOINT_NAME', 'waypoint_name', 'Waypoint name']),
    descIdx: findHeaderIndex(doc.header, ['Waypoint description', 'Description', 'desc']),
    latIdx: findHeaderIndex(doc.header, ['Latitude', 'Lat']),
    lonIdx: findHeaderIndex(doc.header, ['Longitude', 'Lon', 'Long']),
    elevIdx: findHeaderIndex(doc.header, ['Elevation', 'Elev']),
  }
}

export function existingWaypointNames(doc: ForeFlightUserWaypointsCsv, cols: CsvColumns): string[] {
  if (cols.nameIdx == null) return []
  return doc.rows.map((r) => getCell(r, cols.nameIdx)).filter(Boolean)
}

export function existingWaypointCoords(doc: ForeFlightUserWaypointsCsv, cols: CsvColumns): LatLon[] {
  if (cols.latIdx == null || cols.lonIdx == null) return []
  const out: LatLon[] = []
  for (const r of doc.rows) {
    const lat = Number(getCell(r, cols.latIdx))
    const lon = Number(getCell(r, cols.lonIdx))
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({ lat, lon })
  }
  return out
}

export function makeEmptyRowLike(doc: ForeFlightUserWaypointsCsv): string[] {
  return new Array(doc.header.length).fill('')
}

export function appendTowerAsWaypointRow(
  doc: ForeFlightUserWaypointsCsv,
  cols: CsvColumns,
  name: string,
  coord: LatLon
): void {
  const row = makeEmptyRowLike(doc)
  setCell(row, cols.nameIdx, name)
  setCell(row, cols.latIdx, coord.lat.toString())
  setCell(row, cols.lonIdx, coord.lon.toString())
  // Match ForeFlight’s placeholder cells for description/elevation (often empty quoted fields).
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

