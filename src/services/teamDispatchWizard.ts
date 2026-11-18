import type { SpanTrackRowState } from '@/utils/coordinatorSpanTrackPlan'
import { SORTIE_BUDGET_DEFAULT_NM } from '@/services/sortieBudget'

export const THREE_AIRCRAFT_SEGMENT_NOTE =
  'Three aircraft need at least 3 route segments (4 points).'

export const WIZARD_FOOTER_NOTES = [
  'MTR schedule/activity and NOTAM checks are done at dispatch time.',
  'A missed segment is re-flown with a solo Flight Plan.',
] as const

export const INNER_SIDE_HELP = 'Inner is the inside of that piece of the route.'

export const TWO_AIRCRAFT_SIDE_HELP =
  'Each aircraft stays on the side of the centerline you pick for all of its sorties. The other aircraft flies the other side.'

export const TWO_TEAM_LANDING_NOTE =
  'With 2 teams, each crew stays on the side of the centerline it picks for every sortie and lands here. The other crew flies the other side. The final sortie returns home — combined with any remaining survey legs when total NM fits the budget, otherwise a separate return-only sortie.'

/** The 2-team side note applies only when the plan has exactly two aircraft. */
export function twoTeamLandingNote(aircraftCount: number): string | null {
  return aircraftCount === 2 ? TWO_TEAM_LANDING_NOTE : null
}

export const BOTH_SIDES_HELP =
  'Each sortie lists its side; fly the side shown.'

/** Warn for every pair of neighboring crews that picked the same side. */
export function neighborSideWarning(
  crews: Array<{ label: string; side: 'inner' | 'outer' | null | undefined; ident?: string; from?: string; to?: string }>
): string | null {
  const named = (crew: { label: string; ident?: string }) => crew.ident || crew.label
  const sameRoute =
    crews.length === 2 &&
    Boolean(crews[0].from && crews[0].to) &&
    crews[0].from === crews[1].from &&
    crews[0].to === crews[1].to
  if (sameRoute && crews[0].side && crews[1].side) {
    return `Both aircraft fly the same route, ${named(crews[0])} on the ${crews[0].side} side and ${named(crews[1])} on the ${crews[1].side} side.`
  }
  const lines: string[] = []
  for (let index = 1; index < crews.length; index += 1) {
    const previous = crews[index - 1]
    const next = crews[index]
    if (previous.side && previous.side === next.side) {
      lines.push(`${named(previous)} and ${named(next)} both fly ${previous.side} on neighboring pieces.`)
    }
  }
  return lines.length > 0 ? lines.join(' ') : null
}

export const WIDTH_SIDE_HELP =
  'Published widths are measured left and right of centerline as flown from entry. Inner and outer show which side of the curve each one is.'

/** Left and right stay the published names. The parenthetical is the curve side. */
export function widthFieldLabels(innerSide: 'left' | 'right'): { left: string; right: string } {
  const leftTag = innerSide === 'left' ? 'inner' : 'outer'
  const rightTag = innerSide === 'right' ? 'inner' : 'outer'
  return {
    left: `Left of centerline (NM) (${leftTag})`,
    right: `Right of centerline (NM) (${rightTag})`,
  }
}

export const WIZARD_STEPS = [
  { id: 'route', title: 'Which route are you staffing?' },
  {
    id: 'width',
    title:
      'Confirm the corridor width: published NM left and right of centerline, as flown, for each span.',
  },
  {
    id: 'tracks',
    title:
      'Set survey tracks: first track X NM from centerline (default 2.5), then every Y NM (default 5). Tracks beyond the published edge are dropped.',
  },
  {
    id: 'budget',
    title:
      "Max planned distance per sortie, including ferry to and from the route (NM). Set it from your aircraft's endurance minus required fuel reserve.",
  },
  { id: 'landing', title: 'Between sorties, where do crews land?' },
  { id: 'aircraft', title: 'How many aircraft?' },
  { id: 'depart', title: 'Where does each aircraft depart?' },
  { id: 'review', title: 'Review the plan.' },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

export type WizardAirport = {
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

export type WizardTeamId = 'team1' | 'team2' | 'team3'

export type WizardSegment = { from: string; to: string }

export type WizardDraft = {
  spans: SpanTrackRowState[]
  firstOffsetNm: number
  stepNm: number
  sortieBudgetNm: number
  ferryMode: 'return-home' | 'staged-refuel'
  refuel: WizardAirport | null
  refuelFuelConfirmed: boolean
  aircraftCount: 1 | 2 | 3 | null
  teams: Record<WizardTeamId, { code: string; airport: WizardAirport | null }>
  crewSides: Record<WizardTeamId, 'inner' | 'outer' | null>
  /** The piece of the route each flying aircraft surveys. Unused aircraft stay null. */
  segments: Record<WizardTeamId, WizardSegment | null>
}

export type WizardSource = {
  spans: SpanTrackRowState[]
  firstOffsetNm: number
  stepNm: number
  sortieBudgetNm: number
  ferryMode: 'return-home' | 'staged-refuel'
  refuel: WizardAirport | null
  aircraftCount: 1 | 2 | 3
  teams: Record<WizardTeamId, { code: string; airport: WizardAirport | null }>
  crewSides: Partial<Record<string, 'inner' | 'outer' | null>>
  segments?: Partial<Record<WizardTeamId, WizardSegment | null>>
}

export function wizardStepIds(): WizardStepId[] {
  return WIZARD_STEPS.map((step) => step.id)
}

export function threeAircraftAllowed(waypointCount: number): boolean {
  return waypointCount >= 4
}

const EMPTY_TEAM = { code: '', airport: null as WizardAirport | null }

export function blankSpansFromPoints(points: { ptIdent: string }[]): SpanTrackRowState[] {
  const rows: SpanTrackRowState[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const fromPt = points[index]?.ptIdent ?? ''
    const toPt = points[index + 1]?.ptIdent ?? ''
    if (!fromPt || !toPt) continue
    rows.push({
      fromPt,
      toPt,
      leftNm: '',
      rightNm: '',
      leftOffsetsText: '',
      rightOffsetsText: '',
      displayText: `${fromPt}→${toPt}`,
    })
  }
  return rows
}

/** A typed width is at least 1 NM. Blank, zero, and off-number entries stay locked. */
export function spanWidthNmReady(value: string): boolean {
  const width = Number(value)
  return value.trim() !== '' && Number.isFinite(width) && width >= 1
}

/** Keep hand-entered widths for the same spans. A new route, or untouched blanks, take the next list. */
export function keepTypedSpans(current: SpanTrackRowState[], next: SpanTrackRowState[]): SpanTrackRowState[] {
  const typed = current.some((row) => row.leftNm.trim() !== '' || row.rightNm.trim() !== '')
  const sameShape =
    current.length === next.length &&
    current.every((row, index) => row.fromPt === next[index]?.fromPt && row.toPt === next[index]?.toPt)
  return typed && sameShape ? current : next
}

export function prefillTeamDispatchWizard(
  source: WizardSource,
  points: { ptIdent: string }[] = []
): WizardDraft {
  const count = source.aircraftCount
  return {
    spans: source.spans.length > 0 ? source.spans.map((row) => ({ ...row })) : blankSpansFromPoints(points),
    firstOffsetNm: source.firstOffsetNm,
    stepNm: source.stepNm,
    sortieBudgetNm: source.sortieBudgetNm || SORTIE_BUDGET_DEFAULT_NM,
    ferryMode: source.ferryMode,
    refuel: source.refuel ? { ...source.refuel } : null,
    refuelFuelConfirmed: (source.ferryMode === 'staged-refuel') && source.refuel != null,
    aircraftCount: count,
    teams: {
      team1: { ...source.teams.team1, airport: source.teams.team1.airport ? { ...source.teams.team1.airport } : null },
      team2: { ...source.teams.team2, airport: source.teams.team2.airport ? { ...source.teams.team2.airport } : null },
      team3: { ...source.teams.team3, airport: source.teams.team3.airport ? { ...source.teams.team3.airport } : null },
    },
    crewSides: {
      team1: source.crewSides.team1 ?? null,
      team2: source.crewSides.team2 ?? null,
      team3: source.crewSides.team3 ?? null,
    },
    segments: {
      team1: source.segments?.team1 ?? null,
      team2: source.segments?.team2 ?? null,
      team3: source.segments?.team3 ?? null,
    },
  }
}

export function emptyWizardDraft(): WizardDraft {
  return prefillTeamDispatchWizard({
    spans: [],
    firstOffsetNm: 2.5,
    stepNm: 5,
    sortieBudgetNm: SORTIE_BUDGET_DEFAULT_NM,
    ferryMode: 'return-home',
    refuel: null,
    aircraftCount: 1,
    teams: { team1: { ...EMPTY_TEAM }, team2: { ...EMPTY_TEAM }, team3: { ...EMPTY_TEAM } },
    crewSides: {},
  })
}

export function teamIdsForCount(count: 1 | 2 | 3): WizardTeamId[] {
  if (count === 1) return ['team1']
  if (count === 2) return ['team1', 'team2']
  return ['team1', 'team2', 'team3']
}

/** The shared refuel airport, written onto every aircraft that is flying. Return-home keeps none. */
export function refuelEditsForDraft(
  draft: Pick<WizardDraft, 'ferryMode' | 'refuel' | 'aircraftCount'>
): Record<WizardTeamId, WizardAirport | null> | null {
  if ((draft.ferryMode !== 'staged-refuel') || !draft.refuel || draft.aircraftCount == null) return null
  const edits: Record<WizardTeamId, WizardAirport | null> = { team1: null, team2: null, team3: null }
  for (const id of teamIdsForCount(draft.aircraftCount)) edits[id] = draft.refuel
  return edits
}

/** Staged refuel lands Sortie 1 at the chosen airport. A per-team edit wins; return-home does not refuel. */
export function refuelAirportForCrew(
  crewId: string,
  ferryMode: WizardDraft['ferryMode'],
  shared: WizardAirport | null,
  edits: Record<string, WizardAirport | null> | null
): WizardAirport | null {
  if (ferryMode !== 'staged-refuel') return null
  if (edits && crewId in edits) return edits[crewId]
  return shared
}

const TEAM_IDS: WizardTeamId[] = ['team1', 'team2', 'team3']

/** Drop aircraft the new count does not use, and clear sides so the review step assigns the new plan. */
export function retainFlyingTeams(draft: WizardDraft, count: 1 | 2 | 3): WizardDraft {
  const flying = new Set(teamIdsForCount(count))
  const teams = { ...draft.teams }
  const crewSides = { ...draft.crewSides }
  const segments = { ...draft.segments }
  for (const id of TEAM_IDS) {
    if (!flying.has(id)) teams[id] = { code: '', airport: null }
    crewSides[id] = null
    segments[id] = null
  }
  const refuel = draft.ferryMode === 'staged-refuel' ? draft.refuel : null
  return {
    ...draft,
    aircraftCount: count,
    teams,
    crewSides,
    segments,
    refuel,
    refuelFuelConfirmed: refuel != null && draft.refuelFuelConfirmed,
  }
}

export type PlannerSideTeam = { label?: string; side?: string }
export type PlannerSegmentAssignment = {
  teamLabel?: string
  waypointFrom?: string
  waypointTo?: string
  startIdx?: number
}

/**
 * Write the chosen plan's segments onto the draft.
 * Sides are never filled in. A crew that is not flying loses its airport, side, and segment.
 */
export function staffingForPlan(opts: {
  count: 1 | 2 | 3
  draft: WizardDraft
  points: { ptIdent: string }[]
  innerSide: 'left' | 'right'
  replaceSides: boolean
  teams?: PlannerSideTeam[]
  segmentAssignments?: PlannerSegmentAssignment[]
}): WizardDraft {
  void opts.innerSide
  void opts.replaceSides
  void opts.teams
  const flying = new Set(teamIdsForCount(opts.count))
  const teams = { ...opts.draft.teams }
  const crewSides = { ...opts.draft.crewSides }
  const segments: WizardDraft['segments'] = { team1: null, team2: null, team3: null }
  for (const id of TEAM_IDS) {
    if (!flying.has(id)) {
      teams[id] = { code: '', airport: null }
      crewSides[id] = null
    }
  }
  const full =
    opts.points.length >= 2
      ? { from: opts.points[0].ptIdent, to: opts.points[opts.points.length - 1].ptIdent }
      : null
  const assignments = [...(opts.segmentAssignments ?? [])].sort(
    (a, b) => (a.startIdx ?? 0) - (b.startIdx ?? 0)
  )
  if (opts.count === 3 && assignments.length > 0) {
    for (const id of teamIdsForCount(3)) {
      const ident = (teams[id].airport?.identifier ?? '').toUpperCase()
      const index = assignments.findIndex((item) => (item.teamLabel ?? '').toUpperCase() === ident)
      const assignment = index >= 0 ? assignments[index] : null
      segments[id] =
        assignment?.waypointFrom && assignment.waypointTo
          ? { from: assignment.waypointFrom, to: assignment.waypointTo }
          : opts.draft.segments[id]
    }
  } else if (opts.count === 3) {
    for (const id of teamIdsForCount(3)) segments[id] = opts.draft.segments[id]
  } else {
    for (const id of teamIdsForCount(opts.count)) segments[id] = full
  }
  const refuel = opts.draft.ferryMode === 'staged-refuel' ? opts.draft.refuel : null
  return {
    ...opts.draft,
    aircraftCount: opts.count,
    teams,
    crewSides,
    segments,
    refuel,
    refuelFuelConfirmed: refuel != null && opts.draft.refuelFuelConfirmed,
  }
}

export function staffingSignature(draft: WizardDraft): string {
  return JSON.stringify({
    aircraftCount: draft.aircraftCount,
    teams: draft.teams,
    crewSides: draft.crewSides,
    segments: draft.segments,
    refuel: draft.refuel?.identifier ?? null,
  })
}

/** Finish and Save stay disabled until every crew that is flying has chosen a side. There is no default. */
export function crewSidesComplete(draft: Pick<WizardDraft, 'aircraftCount' | 'crewSides'>): boolean {
  if (draft.aircraftCount == null) return false
  return teamIdsForCount(draft.aircraftCount).every((id) => draft.crewSides[id] === 'inner' || draft.crewSides[id] === 'outer')
}

export function missingCrewSides(sides: Record<string, 'inner' | 'outer' | null | undefined>, crewIds: string[]): string[] {
  return crewIds.filter((id) => sides[id] !== 'inner' && sides[id] !== 'outer')
}

export type StaffingCandidate = {
  id: string
  label: string
  sorties: number
  miles: number
  overBudget: number
  maxSorties?: number
  maxNm?: number
}

/** Fewest sorties, then fewest miles, then fewest over-budget sorties, then the most even crew load. */
export function recommendStaffing(candidates: StaffingCandidate[]): StaffingCandidate | null {
  if (candidates.length === 0) return null
  const fitting = candidates.filter((item) => item.overBudget === 0)
  const pool = fitting.length > 0 ? fitting : candidates
  return [...pool].sort(
    (a, b) =>
      a.sorties - b.sorties ||
      a.miles - b.miles ||
      a.overBudget - b.overBudget ||
      (a.maxSorties ?? 0) - (b.maxSorties ?? 0) ||
      (a.maxNm ?? 0) - (b.maxNm ?? 0)
  )[0]
}

export function canAdvanceWizard(
  step: WizardStepId,
  draft: WizardDraft,
  ctx: { hasPlan: boolean; waypointCount: number }
): boolean {
  if (step === 'route') return ctx.hasPlan
  if (step === 'width') {
    if (draft.spans.length === 0) return false
    return draft.spans.every((row) => spanWidthNmReady(row.leftNm) && spanWidthNmReady(row.rightNm))
  }
  if (step === 'tracks') return draft.firstOffsetNm > 0 && draft.stepNm > 0
  if (step === 'budget') return draft.sortieBudgetNm >= 100 && draft.sortieBudgetNm <= 500
  if (step === 'landing') {
    if (draft.ferryMode === 'return-home') return true
    return draft.refuel != null && draft.refuelFuelConfirmed
  }
  if (step === 'aircraft') {
    if (draft.aircraftCount == null) return false
    if (draft.aircraftCount === 3 && !threeAircraftAllowed(ctx.waypointCount)) return false
    return true
  }
  if (step === 'depart') {
    if (draft.aircraftCount == null) return false
    return teamIdsForCount(draft.aircraftCount).every((id) => draft.teams[id].airport != null)
  }
  return crewSidesComplete(draft)
}
