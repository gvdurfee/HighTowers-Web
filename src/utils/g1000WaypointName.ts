import { parseWaypointCode } from '@/utils/mtrWaypointCode'

/** Garmin G1000 user waypoint identifiers are capped at six characters. */
export const G1000_USER_WAYPOINT_ID_MAX_LEN = 6

/**
 * G1000 user waypoint identifier from ForeFlight-style / MTR name.
 * Mirrors Swift `G1000FlightPlanService.convertWaypointName` for hyphenated ids:
 * split on "-", route segment before first hyphen, waypoint suffix after;
 * numeric part = all digits from route segment; result = suffix + numericPart.
 *
 * **Blended / compact ids** (no hyphen), e.g. `SR214H` on an SR213 sequence, use the same
 * letter+digits layout: `H214` (suffix letters + route number digits), capped at six characters.
 *
 * Examples: IR111-A → A111, IR111-EK → EK111, IR1234-XM → XM1234, SR214H → H214
 */
export function convertWaypointNameToG1000(originalName: string): string {
  const normalized = originalName.trim().toUpperCase()
  const components = normalized.split('-')
  if (components.length >= 2) {
    const routePart = components[0]
    const suffix = components[1]
    const numericPart = routePart.replace(/\D/g, '')
    return (suffix + numericPart).slice(0, G1000_USER_WAYPOINT_ID_MAX_LEN)
  }

  const parsed = parseWaypointCode(normalized)
  if (parsed) {
    return (parsed.waypointLetter + parsed.routeNumber).slice(
      0,
      G1000_USER_WAYPOINT_ID_MAX_LEN
    )
  }

  return normalized.replace(/[^A-Z0-9]/gi, '').slice(0, G1000_USER_WAYPOINT_ID_MAX_LEN)
}
