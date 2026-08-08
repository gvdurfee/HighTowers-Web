/**
 * Match a requested MTR point letter/suffix within a loaded route waypoint list.
 * Prefer PT_IDENT (exact), then originalName suffix, then G1000 name heuristics.
 */

export type RouteWaypointLike = {
  originalName: string
  g1000Name: string
  latitude: number
  longitude: number
  ptIdent?: string
}

export function findRouteWaypoint(
  waypoints: RouteWaypointLike[],
  waypointLetter: string
): RouteWaypointLike | undefined {
  const letter = waypointLetter.toUpperCase().trim()
  if (!letter) return undefined

  const byPt = waypoints.find((w) => (w.ptIdent ?? '').trim().toUpperCase() === letter)
  if (byPt) return byPt

  const byOriginal = waypoints.find((w) => {
    const name = (w.originalName ?? '').trim().toUpperCase()
    return name.endsWith(`-${letter}`)
  })
  if (byOriginal) return byOriginal

  return waypoints.find((w) => {
    const prefix = w.g1000Name.replace(/\d/g, '')
    return prefix === letter || w.g1000Name.toUpperCase().startsWith(letter)
  })
}
