/**
 * Re-exports shared apply logic (see shared/content-pack-core).
 */
export type LatLon = { lat: number; lon: number }

export type ApplyTowerToUserWaypointsCsvOk = {
  ok: true
  csvText: string
  outcome: 'updated' | 'appended' | 'unchanged'
  matchedWaypointName?: string
  newWaypointName?: string
  distanceM?: number
}

export type ApplyTowerToUserWaypointsCsvErr = {
  ok: false
  reason: 'invalid_csv' | 'no_route_number'
  message: string
}

export type ApplyTowerToUserWaypointsCsvResult =
  | ApplyTowerToUserWaypointsCsvOk
  | ApplyTowerToUserWaypointsCsvErr

export type CumulativeTowerApplyItem = {
  towerLat: number
  towerLon: number
  groundElevationFt?: number
  outcome: 'updated' | 'appended' | 'unchanged' | 'blocked'
  matchedWaypointName?: string
  newWaypointName?: string
  distanceM?: number
  blockedReason?: string
}

export type CumulativeApplyToUserWaypointsCsvResult =
  | {
      ok: true
      pendingCsvText: string
      items: CumulativeTowerApplyItem[]
      appendedCount: number
      refinedCount: number
      unchangedCount: number
      blockedCount: number
    }
  | ApplyTowerToUserWaypointsCsvErr

export {
  TOWER_ANALYSIS_MSL_AGL_NOTE,
  REFINEMENT_NOTE_FOR_CUSTOMER,
  CONTENT_PACK_COORDS_UNCHANGED_NOTE,
  CONTENT_PACK_APPEND_NOTE,
  applyAllMissionTowersToUserWaypointsCsvText,
  applyTowerToUserWaypointsCsv,
} from '@content-pack/core/applyTowerToUserWaypointsCsv.js'
