/**
 * Apply tower survey positions to ForeFlight user_waypoints CSV.
 * Port of src/utils/applyTowerToUserWaypointsCsv.ts — keep in sync.
 */
import {
  appendTowerAsWaypointRow,
  assertForeFlightUserWaypointsShape,
  existingWaypointNames,
  inferUserWaypointsColumns,
  metersBetween,
  nextWaypointName,
} from './contentPackWaypoints.js'
import {
  formatUserWaypointCsvLatLon,
  getCell,
  parseForeFlightUserWaypointsCsv,
  roundCoordForUserWaypointCsv,
  setCell,
  stringifyForeFlightUserWaypointsCsv,
} from './foreflightUserWaypointsCsv.js'

export const TOWER_ANALYSIS_MSL_AGL_NOTE =
  'Elevation MSL and AGL figures are calculated from Tower Data Analysis.'

export const REFINEMENT_NOTE_FOR_CUSTOMER =
  'This tower was previously reported, but the Content Pack waypoint coordinates were updated (four-decimal-degree rounding, matching ForeFlight exports). ' +
  TOWER_ANALYSIS_MSL_AGL_NOTE

export const CONTENT_PACK_COORDS_UNCHANGED_NOTE =
  'After four-decimal-degree rounding, this tower matches the ForeFlight waypoint coordinates; the Content Pack CSV was not changed. ' +
  TOWER_ANALYSIS_MSL_AGL_NOTE

export const CONTENT_PACK_APPEND_NOTE =
  'A new waypoint row was added to the Content Pack. ' + TOWER_ANALYSIS_MSL_AGL_NOTE

const DEFAULT_THRESHOLD_M = 30

function findNearestRowWithin(doc, cols, tower, maxM) {
  if (cols.latIdx == null || cols.lonIdx == null) return null
  let best = null
  for (let i = 0; i < doc.rows.length; i++) {
    const r = doc.rows[i]
    const lat = Number(getCell(r, cols.latIdx))
    const lon = Number(getCell(r, cols.lonIdx))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const d = metersBetween({ lat, lon }, tower)
    if (d > maxM) continue
    if (!best || d < best.distanceM) {
      const waypointName =
        cols.nameIdx != null ? getCell(r, cols.nameIdx).trim() || `row ${i + 1}` : `row ${i + 1}`
      best = { rowIndex: i, waypointName, distanceM: d }
    }
  }
  return best
}

function roundedCsvCoordsMatchExisting(existingLat, existingLon, towerLat, towerLon) {
  if (!Number.isFinite(existingLat) || !Number.isFinite(existingLon)) return false
  const aLat = roundCoordForUserWaypointCsv(existingLat)
  const aLon = roundCoordForUserWaypointCsv(existingLon)
  const bLat = roundCoordForUserWaypointCsv(towerLat)
  const bLon = roundCoordForUserWaypointCsv(towerLon)
  return aLat === bLat && aLon === bLon
}

export function applyAllMissionTowersToUserWaypointsCsvText(input) {
  let text = input.csvText
  const items = []
  let appendedCount = 0
  let refinedCount = 0
  let unchangedCount = 0
  let blockedCount = 0

  for (const tv of input.towers) {
    const tower = { lat: tv.lat, lon: tv.lon }
    const r = applyTowerToUserWaypointsCsv({
      csvText: text,
      tower,
      routeNumber: input.routeNumber,
      thresholdM: input.thresholdM,
    })
    if (!r.ok) {
      if (r.reason === 'no_route_number') {
        blockedCount++
        items.push({
          towerLat: tower.lat,
          towerLon: tower.lon,
          groundElevationFt: tv.groundElevationFt,
          outcome: 'blocked',
          blockedReason: r.message,
        })
        continue
      }
      return r
    }
    if (r.outcome === 'unchanged') {
      unchangedCount++
      items.push({
        towerLat: tower.lat,
        towerLon: tower.lon,
        groundElevationFt: tv.groundElevationFt,
        outcome: 'unchanged',
        matchedWaypointName: r.matchedWaypointName,
        distanceM: r.distanceM,
      })
      continue
    }
    text = r.csvText
    if (r.outcome === 'updated') {
      refinedCount++
      items.push({
        towerLat: tower.lat,
        towerLon: tower.lon,
        groundElevationFt: tv.groundElevationFt,
        outcome: 'updated',
        matchedWaypointName: r.matchedWaypointName,
        distanceM: r.distanceM,
      })
    } else {
      appendedCount++
      items.push({
        towerLat: tower.lat,
        towerLon: tower.lon,
        groundElevationFt: tv.groundElevationFt,
        outcome: 'appended',
        newWaypointName: r.newWaypointName,
      })
    }
  }

  return {
    ok: true,
    pendingCsvText: text,
    items,
    appendedCount,
    refinedCount,
    unchangedCount,
    blockedCount,
  }
}

export function applyTowerToUserWaypointsCsv(input) {
  const thresholdM = input.thresholdM ?? DEFAULT_THRESHOLD_M
  let doc
  try {
    doc = parseForeFlightUserWaypointsCsv(input.csvText)
    assertForeFlightUserWaypointsShape(doc)
  } catch (e) {
    return {
      ok: false,
      reason: 'invalid_csv',
      message: e instanceof Error ? e.message : 'Invalid user waypoints CSV',
    }
  }
  const cols = inferUserWaypointsColumns(doc)
  const nearest = findNearestRowWithin(doc, cols, input.tower, thresholdM)

  if (nearest) {
    const row = doc.rows[nearest.rowIndex]
    const existingLat = Number(getCell(row, cols.latIdx))
    const existingLon = Number(getCell(row, cols.lonIdx))
    if (
      Number.isFinite(existingLat) &&
      Number.isFinite(existingLon) &&
      roundedCsvCoordsMatchExisting(existingLat, existingLon, input.tower.lat, input.tower.lon)
    ) {
      return {
        ok: true,
        csvText: input.csvText,
        outcome: 'unchanged',
        matchedWaypointName: nearest.waypointName,
        distanceM: nearest.distanceM,
      }
    }
    setCell(row, cols.latIdx, formatUserWaypointCsvLatLon(input.tower.lat))
    setCell(row, cols.lonIdx, formatUserWaypointCsvLatLon(input.tower.lon))
    return {
      ok: true,
      csvText: stringifyForeFlightUserWaypointsCsv(doc),
      outcome: 'updated',
      matchedWaypointName: nearest.waypointName,
      distanceM: nearest.distanceM,
    }
  }

  if (!input.routeNumber?.trim()) {
    return {
      ok: false,
      reason: 'no_route_number',
      message:
        'Attach a flight plan to this mission so new waypoints can be named (route number from waypoints).',
    }
  }

  const names = existingWaypointNames(doc, cols)
  const newName = nextWaypointName(input.routeNumber.trim(), names)
  const rounded = {
    lat: roundCoordForUserWaypointCsv(input.tower.lat),
    lon: roundCoordForUserWaypointCsv(input.tower.lon),
  }
  appendTowerAsWaypointRow(doc, cols, newName, rounded)

  return {
    ok: true,
    csvText: stringifyForeFlightUserWaypointsCsv(doc),
    outcome: 'appended',
    newWaypointName: newName,
  }
}
