import { parseWaypointCode } from '@/utils/mtrWaypointCode'

/** Parse IR111 / SR45 / VR108. */
export function parseRouteInput(
  input: string
): { routeType: 'IR' | 'SR' | 'VR'; routeNumber: string } | null {
  const upper = input.toUpperCase().trim()
  const match = upper.match(/^(IR|SR|VR)(\d+)$/)
  if (!match) return null
  return {
    routeType: match[1] as 'IR' | 'SR' | 'VR',
    routeNumber: match[2],
  }
}

/**
 * Build full MTR id (e.g. IR109-AM) from optional route identifier + waypoint suffix/id.
 * If the value is already a full waypoint id, it is returned unchanged.
 */
export function normalizeWaypointToken(token: string): string {
  return token.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '').replace(/^-+/, '')
}

export function resolveWaypointToken(
  routeIdentifier: string | undefined,
  token: string
): string | null {
  const t = normalizeWaypointToken(token)
  if (!t) return null

  if (parseWaypointCode(t)) {
    return t
  }

  const rid = (routeIdentifier ?? '').trim().toUpperCase()
  if (!rid) return null

  const route = parseRouteInput(rid)
  if (!route) return null

  const suffix = t
  if (!suffix || !/^[A-Z0-9]+$/.test(suffix)) return null

  return `${route.routeType}${route.routeNumber}-${suffix}`
}
