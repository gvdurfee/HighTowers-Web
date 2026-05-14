/**
 * Re-exports shared ForeFlight CSV helpers (see shared/content-pack-core).
 * Types kept here for TypeScript consumers.
 */
export type ForeFlightUserWaypointsCsv = {
  header: string[]
  rows: string[][]
  lineEnding: '\n' | '\r\n'
}

export {
  USER_WAYPOINT_CSV_COORD_DECIMAL_PLACES,
  roundCoordForUserWaypointCsv,
  formatUserWaypointCsvLatLon,
  decodeWaypointCsvBytes,
  parseForeFlightUserWaypointsCsv,
  stringifyForeFlightUserWaypointsCsv,
  findHeaderIndex,
  getCell,
  setCell,
} from '@content-pack/core/foreflightUserWaypointsCsv.js'
