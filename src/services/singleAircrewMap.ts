import type { FlightPlanCreationLoadMethod } from '@/db/schema'
import { handledSpurTipIndexes } from '@/services/singleAircrewSpur'
import type { SpurPoint } from '@/services/spurPreview'
import type { SortieSide } from '@/services/offsetRouteFpl'

/** A plan with no saved team plan, and not a Team Dispatch anchor. */
export function isSingleAircrewPlan(
  plan: { creationLoadMethod?: FlightPlanCreationLoadMethod | null } | null | undefined,
  savedTeamPlan: unknown
): boolean {
  if (!plan || savedTeamPlan) return false
  return plan.creationLoadMethod !== 'coordinatorSurvey'
}

export function singleAircrewSortieButtonLabel(opts: {
  number: 1 | 2
  departure?: string | null
  destination?: string | null
  sortie1Side?: SortieSide | null
}): string {
  const departure = opts.departure?.trim() ?? ''
  const destination = opts.destination?.trim() ?? ''
  if (!departure || !destination) return `Sortie ${opts.number}`
  const side = opts.sortie1Side === 'inner' || opts.sortie1Side === 'outer' ? opts.sortie1Side : null
  if (opts.number === 1) {
    const route = `Sortie 1: ${departure} → ${destination}`
    if (!side) return route
    return `${route} (${side === 'inner' ? 'Inner' : 'Outer'})`
  }
  const route = `Sortie 2: ${destination} → ${departure}`
  if (!side) return route
  return `${route} (${side === 'inner' ? 'Outer' : 'Inner'})`
}

export const SINGLE_AIRCREW_TRACK_LINE =
  'Track offset is the distance from the centerline to the flown path on each side. The app calculates the offset waypoints.'

export const SINGLE_AIRCREW_MAP_LEGEND =
  'Map: ultramarine centerline with point letters, yellow sortie tracks, blue arrows.'

/** Corridor-edge warnings stay off this screen. Join and width-step warnings stay. */
export function visibleOffsetFlags<T extends { reason: string; index?: number }>(
  flags: T[],
  singleAircrew: boolean,
  centerline?: SpurPoint[]
): T[] {
  if (!singleAircrew) return flags
  const spurTips = new Set(centerline ? handledSpurTipIndexes(centerline) : [])
  return flags.filter((flag) => {
    if (flag.reason === 'outsideCorridor') return false
    if (flag.reason === 'foldBack' && flag.index != null && spurTips.has(flag.index)) return false
    return true
  })
}

/** Hide the section once the team-plan lookup has confirmed a single-aircrew plan. */
export function showFullFlightPlanSection(
  plan: { creationLoadMethod?: FlightPlanCreationLoadMethod | null } | null | undefined,
  savedTeamPlan: unknown
): boolean {
  if (savedTeamPlan === undefined) return true
  return !isSingleAircrewPlan(plan, savedTeamPlan)
}

export function singleAircrewSortieHint(): string {
  return 'Fly Sortie 1 out, refuel at destination, then fly Sortie 2 home on the other side. Load both files in the G1000 before departure, and activate each one before its takeoff.'
}
