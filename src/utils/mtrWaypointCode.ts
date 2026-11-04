/**
 * Parse MTR waypoint ids from stored original names, e.g. IR109-AM, SR213A.
 */
export function parseWaypointCode(
  code: string
): { routeType: 'IR' | 'SR' | 'VR'; routeNumber: string; waypointLetter: string } | null {
  const upper = code.toUpperCase().trim()
  let routeType: 'IR' | 'SR' | 'VR' | null = null
  if (upper.startsWith('IR')) routeType = 'IR'
  else if (upper.startsWith('SR')) routeType = 'SR'
  else if (upper.startsWith('VR')) routeType = 'VR'
  if (!routeType) return null
  const rest = upper.slice(2)
  const match = rest.match(/^(\d+)(?:-)?([A-Z0-9]+)$/)
  if (!match) return null
  return {
    routeType,
    routeNumber: match[1],
    waypointLetter: match[2],
  }
}

/** Published point letters only, for the blue centerline marker. */
export function publishedPointLabel(originalName: string): string | null {
  const letter = parseWaypointCode(originalName)?.waypointLetter
  return letter || null
}

/** Stable key so SR213H and SR213-H match when correcting a saved sequence. */
export function waypointIdentityKey(code: string): string {
  const parsed = parseWaypointCode(code)
  if (!parsed) return code.trim().toUpperCase()
  return `${parsed.routeType}${parsed.routeNumber}-${parsed.waypointLetter}`
}
