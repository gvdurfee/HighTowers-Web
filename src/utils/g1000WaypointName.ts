import {
  assignG1000WaypointNames,
  G1000_USER_WAYPOINT_ID_MAX_LEN,
} from '@survey-planning/g1000Names.js'

export { assignG1000WaypointNames, G1000_USER_WAYPOINT_ID_MAX_LEN }

/**
 * G1000 user waypoint identifier: point id plus the waypoint's sequence (001).
 * IR112-A at the start of the route is A001. Letters and digits only, 6 characters.
 */
export function convertWaypointNameToG1000(originalName: string): string {
  return assignG1000WaypointNames([{ originalName }]).names[0]?.g1000Name ?? ''
}
