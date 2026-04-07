/**
 * G1000 user waypoint identifier from ForeFlight-style name.
 * Mirrors Swift `G1000FlightPlanService.convertWaypointName`:
 * split on "-", route segment before first hyphen, waypoint suffix after;
 * numeric part = all digits from route segment; result = suffix + numericPart.
 *
 * Examples: IR111-A → A111, IR111-EK → EK111, IR1234-XM → XM1234
 * If there is no hyphen, returns the trimmed, uppercased name unchanged (Swift parity on structure; web normalizes case).
 */
export function convertWaypointNameToG1000(originalName: string): string {
  const normalized = originalName.trim().toUpperCase()
  const components = normalized.split('-')
  if (components.length < 2) return normalized
  const routePart = components[0]
  const suffix = components[1]
  const numericPart = routePart.replace(/\D/g, '')
  return (suffix + numericPart).slice(0, 8)
}
