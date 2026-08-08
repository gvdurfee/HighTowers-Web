/**
 * Survey-map coordinate helpers (decimal degrees ↔ DD°MM.mm display).
 * Map center stays full-precision; DMS fields are for display / manual entry only.
 */

export type Hemisphere = 'N' | 'S' | 'E' | 'W'

/** Convert decimal degrees to DMS components (DD, MM.mm, N/S or E/W) */
export function toDms(
  decimal: number,
  isLat: boolean
): { deg: number; min: number; hem: Hemisphere } {
  const abs = Math.abs(decimal)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  const hem: Hemisphere = isLat ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W'
  return { deg, min, hem }
}

/** Convert DMS to decimal degrees */
export function fromDms(deg: number, min: number, hem: Hemisphere): number {
  const abs = deg + min / 60
  return hem === 'S' || hem === 'W' ? -abs : abs
}

/** Minutes for display: always two digits after the decimal (MM.mm) */
export function formatMinutesDisplay(minStr: string): string {
  if (!minStr.trim()) return '—'
  const n = Number(minStr)
  if (!Number.isFinite(n)) return minStr
  return n.toFixed(2)
}

/** Minutes when syncing from map center (avoid long float strings in inputs) */
export function formatMinutesFromMap(minutes: number): string {
  return minutes.toFixed(2)
}

/** Stable signature of the DMS form fields (used to detect map→form sync vs user edit). */
export function dmsFieldSignature(
  latDeg: string,
  latMin: string,
  latHem: string,
  lonDeg: string,
  lonMin: string,
  lonHem: string
): string {
  return `${latDeg}|${latMin}|${latHem}|${lonDeg}|${lonMin}|${lonHem}`
}

/**
 * True when the DMS fields still match the last map→form sync.
 * In that case the map center must not be rewritten from DMS (MM.mm would snap ~10–20 m).
 */
export function shouldSkipDmsToMapSync(
  mapSyncedSignature: string | null,
  currentSignature: string
): boolean {
  return mapSyncedSignature != null && mapSyncedSignature === currentSignature
}
