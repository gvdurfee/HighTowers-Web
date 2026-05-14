import type { WaypointRecord } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import type { ForeFlightUserWaypointsCsv } from '@/utils/foreflightUserWaypointsCsv'
import {
  findHeaderIndex,
  formatUserWaypointCsvLatLon,
  getCell,
  setCell,
  inferUserWaypointsColumns as inferCols,
  assertForeFlightUserWaypointsShape as assertShape,
  existingWaypointNames as existingNames,
  existingWaypointCoords as existingCoords,
  makeEmptyRowLike as makeEmpty,
  appendTowerAsWaypointRow as appendRow,
  metersBetween,
  nextWaypointName,
  suffixToIndex,
  indexToSuffix,
} from '@content-pack/core/contentPackWaypoints.js'

export type LatLon = { lat: number; lon: number }

export { metersBetween, nextWaypointName, suffixToIndex, indexToSuffix }

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

export type CsvColumns = {
  nameIdx: number | null
  descIdx: number | null
  latIdx: number | null
  lonIdx: number | null
  elevIdx: number | null
}

export function inferUserWaypointsColumns(doc: ForeFlightUserWaypointsCsv): CsvColumns {
  return inferCols(doc)
}

export function assertForeFlightUserWaypointsShape(doc: ForeFlightUserWaypointsCsv): void {
  assertShape(doc)
}

export function existingWaypointNames(doc: ForeFlightUserWaypointsCsv, cols: CsvColumns): string[] {
  return existingNames(doc, cols)
}

export function existingWaypointCoords(doc: ForeFlightUserWaypointsCsv, cols: CsvColumns): LatLon[] {
  return existingCoords(doc, cols)
}

export function makeEmptyRowLike(doc: ForeFlightUserWaypointsCsv): string[] {
  return makeEmpty(doc)
}

export function appendTowerAsWaypointRow(
  doc: ForeFlightUserWaypointsCsv,
  cols: CsvColumns,
  name: string,
  coord: LatLon
): void {
  appendRow(doc, cols, name, coord)
}

export { findHeaderIndex, formatUserWaypointCsvLatLon, getCell, setCell }
