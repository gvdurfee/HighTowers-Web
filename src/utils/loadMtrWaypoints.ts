import { apiService } from '@/services/api'
import { convertWaypointNameToG1000 } from '@/utils/g1000WaypointName'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import {
  normalizeWaypointToken,
  parseRouteInput,
  resolveWaypointToken,
} from '@/utils/mtrRouteInput'
import type { PendingWaypoint } from '@/db/schema'

export type ResolvedMtrWaypoint = {
  originalName: string
  g1000Name: string
  lat: number
  lon: number
  routeType: 'IR' | 'SR' | 'VR'
  sequence: number
}

export type LoadMtrWaypointsResult = {
  waypoints: ResolvedMtrWaypoint[]
  pending: PendingWaypoint[]
  error?: string
}

export async function loadWaypointsFromFullRoute(opts: {
  routeInput: string
  entry: string
  exit: string
}): Promise<LoadMtrWaypointsResult> {
  const parsed = parseRouteInput(opts.routeInput.trim())
  if (!parsed) {
    return { waypoints: [], pending: [], error: 'Invalid route. Use format IR111, SR45, or VR108.' }
  }
  const entry = opts.entry.trim() || 'A'
  const exit = opts.exit.trim() || 'Q'
  const allRouteWps = await apiService.fetchRouteData(
    parsed.routeType,
    parsed.routeNumber,
    entry,
    exit
  )
  const segment = apiService.extractRouteSegment(allRouteWps, entry, exit)
  if (segment.length === 0) {
    return {
      waypoints: [],
      pending: [],
      error: `Entry "${entry}" to Exit "${exit}" produced no waypoints. Check the segment.`,
    }
  }
  return {
    waypoints: segment.map((wp, i) => ({
      originalName: wp.originalName,
      g1000Name: wp.g1000Name,
      lat: wp.latitude,
      lon: wp.longitude,
      routeType: parsed.routeType,
      sequence: i,
    })),
    pending: [],
  }
}

export async function loadWaypointsFromSequence(opts: {
  routeIdentifier: string
  waypointSequence: string
}): Promise<LoadMtrWaypointsResult> {
  const routeId = opts.routeIdentifier.trim()
  if (routeId && !parseRouteInput(routeId)) {
    return {
      waypoints: [],
      pending: [],
      error: 'Invalid route identifier. Use IR109, SR45, or VR108.',
    }
  }
  const parts = opts.waypointSequence
    .split(/[\s,]+/)
    .map(normalizeWaypointToken)
    .filter(Boolean)
  if (parts.length === 0) {
    return {
      waypoints: [],
      pending: [],
      error: 'Enter at least one waypoint suffix or full waypoint ID.',
    }
  }

  const waypoints: ResolvedMtrWaypoint[] = []
  const pending: PendingWaypoint[] = []

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]
    const resolved = resolveWaypointToken(routeId || undefined, raw)
    if (!resolved) {
      const label = raw.trim().toUpperCase()
      pending.push({ code: label, sequence: i })
      continue
    }
    const parsed = parseWaypointCode(resolved)
    if (!parsed) {
      pending.push({ code: resolved, sequence: i })
      continue
    }
    const g1000Name = convertWaypointNameToG1000(resolved)
    const coords = await apiService.fetchWaypointCoordinate(
      parsed.routeType,
      parsed.routeNumber,
      parsed.waypointLetter
    )
    if (coords) {
      waypoints.push({
        originalName: resolved,
        g1000Name,
        lat: coords.latitude,
        lon: coords.longitude,
        routeType: parsed.routeType,
        sequence: i,
      })
    } else {
      pending.push({ code: resolved, sequence: i })
    }
  }

  if (waypoints.length === 0 && pending.length === 0) {
    return {
      waypoints: [],
      pending: [],
      error:
        'No waypoints resolved. Set Route identifier (e.g. IR109) and suffixes, or enter full IDs like IR109-AM.',
    }
  }

  return { waypoints, pending }
}
