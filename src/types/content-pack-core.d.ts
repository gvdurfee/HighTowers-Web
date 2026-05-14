declare module '@content-pack/core/foreflightUserWaypointsCsv.js' {
  export const USER_WAYPOINT_CSV_COORD_DECIMAL_PLACES: number
  export function roundCoordForUserWaypointCsv(n: number): number
  export function formatUserWaypointCsvLatLon(n: number): string
  export function decodeWaypointCsvBytes(bytes: Uint8Array): string
  export function parseForeFlightUserWaypointsCsv(text: string): {
    header: string[]
    rows: string[][]
    lineEnding: '\n' | '\r\n'
  }
  export function stringifyForeFlightUserWaypointsCsv(doc: {
    header: string[]
    rows: string[][]
    lineEnding: '\n' | '\r\n'
  }): string
  export function findHeaderIndex(header: string[], candidates: string[]): number | null
  export function getCell(row: string[], idx: number | null): string
  export function setCell(row: string[], idx: number | null, value: string): void
}

declare module '@content-pack/core/contentPackWaypoints.js' {
  export function metersBetween(
    a: { lat: number; lon: number },
    b: { lat: number; lon: number }
  ): number
  export function nextWaypointName(routeNumber: string, existingNames: string[]): string
  export function suffixToIndex(suffix: string): number | null
  export function indexToSuffix(idx: number): string
  export function inferUserWaypointsColumns(doc: {
    header: string[]
    rows: string[][]
    lineEnding: string
  }): {
    nameIdx: number | null
    descIdx: number | null
    latIdx: number | null
    lonIdx: number | null
    elevIdx: number | null
  }
  export function assertForeFlightUserWaypointsShape(doc: {
    header: string[]
    rows: string[][]
    lineEnding: string
  }): void
  export function existingWaypointNames(
    doc: { header: string[]; rows: string[][]; lineEnding: string },
    cols: { nameIdx: number | null }
  ): string[]
  export function existingWaypointCoords(
    doc: { header: string[]; rows: string[][]; lineEnding: string },
    cols: { latIdx: number | null; lonIdx: number | null }
  ): { lat: number; lon: number }[]
  export function makeEmptyRowLike(doc: { header: string[] }): string[]
  export function appendTowerAsWaypointRow(
    doc: { header: string[]; rows: string[][]; lineEnding: string },
    cols: {
      nameIdx: number | null
      descIdx: number | null
      latIdx: number | null
      lonIdx: number | null
      elevIdx: number | null
    },
    name: string,
    coord: { lat: number; lon: number }
  ): void
  export function findHeaderIndex(header: string[], candidates: string[]): number | null
  export function formatUserWaypointCsvLatLon(n: number): string
  export function getCell(row: string[], idx: number | null): string
  export function setCell(row: string[], idx: number | null, value: string): void
}

declare module '@content-pack/core/applyTowerToUserWaypointsCsv.js' {
  export const TOWER_ANALYSIS_MSL_AGL_NOTE: string
  export const REFINEMENT_NOTE_FOR_CUSTOMER: string
  export const CONTENT_PACK_COORDS_UNCHANGED_NOTE: string
  export const CONTENT_PACK_APPEND_NOTE: string

  type ApplyErr = {
    ok: false
    reason: 'invalid_csv' | 'no_route_number'
    message: string
  }
  type ApplyOk = {
    ok: true
    csvText: string
    outcome: 'updated' | 'appended' | 'unchanged'
    matchedWaypointName?: string
    newWaypointName?: string
    distanceM?: number
  }
  type CumulativeItem = {
    towerLat: number
    towerLon: number
    groundElevationFt?: number
    outcome: 'updated' | 'appended' | 'unchanged' | 'blocked'
    matchedWaypointName?: string
    newWaypointName?: string
    distanceM?: number
    blockedReason?: string
  }
  type CumulativeOk = {
    ok: true
    pendingCsvText: string
    items: CumulativeItem[]
    appendedCount: number
    refinedCount: number
    unchangedCount: number
    blockedCount: number
  }

  export function applyAllMissionTowersToUserWaypointsCsvText(input: {
    csvText: string
    towers: { lat: number; lon: number; groundElevationFt?: number }[]
    routeNumber: string | null
    thresholdM?: number
  }): CumulativeOk | ApplyErr

  export function applyTowerToUserWaypointsCsv(input: {
    csvText: string
    tower: { lat: number; lon: number }
    routeNumber: string | null
    thresholdM?: number
  }): ApplyOk | ApplyErr
}

declare module '@content-pack/core/zipSniff.js' {
  export const CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED: number
  export function contentPackDiscoveryFilter(info: {
    name: string
    originalSize: number
    compression: number
  }): boolean
  export function normalizeZipEntryName(name: string): string
  export function unzipEntriesForContentPackDiscovery(bytes: Uint8Array): Map<string, Uint8Array>
}

declare module '@content-pack/core/contentPackMissionNotes.js' {
  export type ContentPackApplyTowerGroups = {
    refined: number[]
    unchanged: number[]
    appended: number[]
  }
  export function stripContentPackParagraphs(text: string): string
  export function stripContentPackRefinementParagraph(text: string): string
  export function mergeContentPackApplyMissionNotes(
    existingNotes: string | undefined,
    groups: ContentPackApplyTowerGroups
  ): string
  export function mergeContentPackRefinementMissionNotes(
    existingNotes: string | undefined,
    refinedTowerObservationNumbers: number[]
  ): string
}

declare module '@content-pack/core/userWaypointsZipDiscovery.js' {
  export const USER_WAYPOINTS_CSV_CANDIDATES: readonly string[]
  export const ZIP_ENTRY_USER_WP_RE: RegExp
  export const NAVDATA_USER_WP_RE: RegExp
  export const NAVDATA_CHILD_RE: RegExp
  export function isIgnoredZipEntryPath(path: string): boolean
  export function bytesLookLikeZipLocalHeader(bytes: Uint8Array): boolean
  export function orderedWaypointCandidatePaths(listedPaths: string[]): string[]
  export function pickUserWaypointsCsvPath(entries: Map<string, Uint8Array>): string | null
  export function assertUserWaypointCsvBytesLookTextual(bytes: Uint8Array, pathHint?: string): void
  export function loadUserWaypointsCsvFromZipBuffer(zipBytes: Uint8Array | Buffer): {
    csvPath: string
    csvText: string
  }
}
