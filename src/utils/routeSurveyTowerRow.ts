import type { TowerLocationRecord, WaypointRecord } from '@/db/schema'
import {
  formatDistanceBearingNotes,
  mergeBearingNotesWithManual,
} from '@/utils/towerWaypointGeometry'

/** MSL/AGL use "See Notes" qualifier when placed without image GPS or when not visible on map. */
export function towerHeightsUseSeeNotes(loc: TowerLocationRecord | undefined): boolean {
  return !!(loc?.noImageGps || loc?.towerNotVisibleOnMap)
}

function heightFieldWithSeeNotes(ft: number | undefined): string {
  if (ft != null && Number.isFinite(ft) && ft > 0) {
    return `${Math.round(ft)} ft. - See Notes`
  }
  return 'See Notes'
}

export function routeSurveyMslField(loc: TowerLocationRecord): string {
  if (towerHeightsUseSeeNotes(loc)) {
    return heightFieldWithSeeNotes(loc.elevation)
  }
  return String(Math.round(loc.elevation))
}

export function routeSurveyAglField(
  loc: TowerLocationRecord,
  estimatedHeightFt: number | undefined
): string {
  if (towerHeightsUseSeeNotes(loc)) {
    return heightFieldWithSeeNotes(estimatedHeightFt)
  }
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
  const manual = (savedReportNotes ?? '').trim()

  if (loc.towerNotVisibleOnMap) {
    const prefix = 'Tower not found on Map, Heights, Distance and bearing estimated.'
    const computed = bearingPart ? `${prefix} ${bearingPart}` : prefix
    return mergeBearingNotesWithManual(computed, manual)
  }
  if (loc.noImageGps) {
    const prefix = 'No Image GPS.'
    const computed = bearingPart ? `${prefix} ${bearingPart}` : prefix
    return mergeBearingNotesWithManual(computed, manual)
  }
  if (bearingPart) {
    return mergeBearingNotesWithManual(bearingPart, manual)
  }
  return manual
}
