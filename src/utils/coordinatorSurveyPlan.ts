import type { FlightPlanRecord } from '@/db/schema'

/** Flight plan created for coordinator what-if survey planning (waypoints only; airports in Survey Console). */
export function isCoordinatorSurveyAnchor(plan: FlightPlanRecord): boolean {
  return plan.creationLoadMethod === 'coordinatorSurvey'
}
