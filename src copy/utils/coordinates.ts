/**
 * Parse coordinate strings in formats used by ForeFlight (tap waypoint):
 * - DDºMM.mm (latitude) or DDDºMM.mm (longitude)
 * - DD MM.mm or DDD MM.mm (space-separated)
 * - Also accepts decimal degrees
 * - Hemisphere: N/S for lat, E/W for lon (suffix or prefix)
 */

/**
 * Parse a coordinate string to decimal degrees.
 * Returns null if invalid.
 *
 * Supported formats:
 * - 34.8083 (decimal degrees)
 * - 34°48.50 or 34º48.50 or 34 48.50 (degrees + decimal minutes)
 * - 34°48'30" (degrees minutes seconds - optional)
 * - N34°48.50 or 34°48.50'N (with hemisphere)
 * - 106°33.00W or W106°33.00 (longitude with W = negative)
 */
export function parseCoordinate(input: string): number | null {
  const s = (input ?? '').trim().toUpperCase()
  if (!s) return null

  // Extract hemisphere if present
  let hemisphere = ''
  let cleaned = s
  if (s.startsWith('N') || s.startsWith('S')) {
    hemisphere = s[0]
    cleaned = s.slice(1).trim()
  } else if (s.startsWith('E') || s.startsWith('W')) {
    hemisphere = s[0]
    cleaned = s.slice(1).trim()
  } else if (s.endsWith('N') || s.endsWith('S')) {
    hemisphere = s.slice(-1)
    cleaned = s.slice(0, -1).trim()
  } else if (s.endsWith('E') || s.endsWith('W')) {
    hemisphere = s.slice(-1)
    cleaned = s.slice(0, -1).trim()
  }

  // Replace common degree symbols with space for splitting
  cleaned = cleaned.replace(/[°º'´`]/g, ' ').replace(/\s+/g, ' ').trim()

  // If there's a space, treat as D(D)D MM.mm (or D MS) rather than decimal
  if (cleaned.includes(' ')) {
    const parts = cleaned.split(/\s+/).map((p) => parseFloat(p.replace(/[^0-9.-]/g, '')))
    if (parts.length >= 2 && parts.every((n) => !Number.isNaN(n))) {
      let decimal = parts[0] + parts[1] / 60
      if (parts.length >= 3) decimal += parts[2] / 3600
      if (hemisphere === 'S' || hemisphere === 'W') decimal = -Math.abs(decimal)
      return decimal
    }
  }

  // Try decimal degrees
  const asNum = parseFloat(cleaned)
  if (!Number.isNaN(asNum)) {
    let result = asNum
    if (hemisphere === 'S' || hemisphere === 'W') result = -Math.abs(result)
    if (hemisphere === 'N' || hemisphere === 'E') result = Math.abs(result)
    return result
  }

  // Try DDºMM.mm (no space - degree symbol only, e.g. 34º48.50)
  const dmsMatch = cleaned.match(/^(\d+)[°º']?\s*(\d+(?:\.\d+)?)(?:[°º'"]?\s*(\d+(?:\.\d+)?)?)?[°º'"]?$/)
  if (dmsMatch) {
    const d = parseInt(dmsMatch[1], 10)
    const m = parseFloat(dmsMatch[2]) || 0
    const sec = dmsMatch[3] != null ? parseFloat(dmsMatch[3]) : 0
    let decimal = d + m / 60 + sec / 3600
    if (hemisphere === 'S' || hemisphere === 'W') decimal = -Math.abs(decimal)
    return decimal
  }

  return null
}

/**
 * Parse lat/lon pair. Returns { latitude, longitude } or null if either invalid.
 */
export function parseLatLon(latStr: string, lonStr: string): { latitude: number; longitude: number } | null {
  const lat = parseCoordinate(latStr)
  const lon = parseCoordinate(lonStr)
  if (lat == null || lon == null) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: lat, longitude: lon }
}
