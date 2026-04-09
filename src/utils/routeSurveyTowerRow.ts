import type { TowerLocationRecord, WaypointRecord } from '@/db/schema'
import {
  formatDistanceBearingNotes,
  mergeBearingNotesWithManual,
} from '@/utils/towerWaypointGeometry'

/** MSL/AGL should read "See Notes" when the tower was placed without image GPS or when not visible on map. */
export function towerHeightsUseSeeNotes(loc: TowerLocationRecord | undefined): boolean {
  return !!(loc?.noImageGps || loc?.towerNotVisibleOnMap)
}

export function routeSurveyMslField(loc: TowerLocationRecord): string {
  return towerHeightsUseSeeNotes(loc) ? 'See Notes' : String(Math.round(loc.elevation))
}

export function routeSurveyAglField(
  loc: TowerLocationRecord,
  estimatedHeightFt: number | undefined
): string {
  if (towerHeightsUseSeeNotes(loc)) return 'See Notes'
  return estimatedHeightFt != null ? String(Math.round(estimatedHeightFt)) : ''
}

/**
 * Notes for a tower row on the Air Force Route Survey form / PDF.
 */
export function buildRouteSurveyTowerNotes(
  loc: TowerLocationRecord,
  waypoints: WaypointRecord[],
  savedReportNotes?: string | null
): string {
  const bearingPart =
    waypoints.length > 0 ? formatDistanceBearingNotes(loc, waypoints).trim() : ''

  if (loc.towerNotVisibleOnMap) {
    const prefix = 'Tower not found on Map, Heights, Distance and bearing estimated.'
    return bearingPart ? `${prefix} ${bearingPart}` : prefix
  }
  if (loc.noImageGps) {
    const prefix = 'No Image GPS.'
    return bearingPart ? `${prefix} ${bearingPart}` : prefix
  }
  if (bearingPart) {
    return mergeBearingNotesWithManual(bearingPart, (savedReportNotes ?? '').trim())
  }
  return (savedReportNotes ?? '').trim()
}
