/**
 * Coordinator survey sortie planner.
 * See docs/COORDINATOR_SURVEY_CONSOLE.md.
 */

import { parseWidthTexts, halfWidthNmForLeg } from './mtrWidthParser.js'
import {
  parallelOffsetsForHalfWidth,
  chainLengthNm,
  closestWaypointIndex,
  nauticalMilesBetween,
  DEFAULT_PARALLEL_TRACK_POLICY,
} from './surveyGeometry.js'
import { packSortiesForTeam } from './surveySortiePacker.js'

export { DEFAULT_PARALLEL_TRACK_POLICY }

/**
 * @typedef {'left' | 'right'} SurveySide
 * @typedef {'opposite-side' | 'geographic' | 'single' | 'single-sequential'} TeamAssignmentModel
 */

/**
 * @typedef {object} SurveyWaypoint
 * @property {string} ptIdent
 * @property {number} lat
 * @property {number} lon
 * @property {string} [nextPt]
 */

/**
 * @typedef {object} SurveyTeamInput
 * @property {string} label
 * @property {number} depLat
 * @property {number} depLon
 * @property {SurveySide} side
 */

/**
 * @typedef {object} SurveyPlannerInput
 * @property {string} routeType - IR | VR | SR
 * @property {string} routeNumber
 * @property {SurveyWaypoint[]} waypoints - ordered along survey sequence
 * @property {string[]} widthTexts - raw WIDTH_TEXT lines from NASR
 * @property {SurveyTeamInput[]} teams
 * @property {number} sortieBudgetNm - e.g. 400 or 500
 * @property {Partial<import('./surveyGeometry.js').ParallelTrackPolicy>} [trackPolicy]
 * @property {TeamAssignmentModel} [assignmentModel]
 * @property {string[]} [fullRoutePtIdents] - full-route point order when `waypoints` is a slice
 */

/**
 * @typedef {object} LegWidthSummary
 * @property {string} fromPt
 * @property {string} toPt
 * @property {number | null} leftNm
 * @property {number | null} rightNm
 * @property {number[]} leftOffsets
 * @property {number[]} rightOffsets
 * @property {number} chainNm
 */

/**
 * Build per-leg width and offset lists.
 * @param {SurveyPlannerInput} input
 * @param {{ fullRoutePtIdents?: string[] }} [options] - full-route point order for NASR span matching on slices
 */
export function buildLegWidthSummaries(input, options = {}) {
  const spans = parseWidthTexts(input.widthTexts ?? [])
  const policy = input.trackPolicy ?? {}
  const wps = input.waypoints ?? []
  const routePtIdents =
    options.fullRoutePtIdents ??
    input.fullRoutePtIdents ??
    wps.map((w, i) => w.ptIdent ?? String(i))
  const legs = []

  for (let i = 0; i < wps.length - 1; i++) {
    const from = wps[i]
    const to = wps[i + 1]
    const fromPt = from.ptIdent ?? String(i)
    const toPt = to.ptIdent ?? String(i + 1)
    const leftNm = halfWidthNmForLeg(spans, fromPt, toPt, 'left', routePtIdents)
    const rightNm = halfWidthNmForLeg(spans, fromPt, toPt, 'right', routePtIdents)
    legs.push({
      fromPt,
      toPt,
      leftNm,
      rightNm,
      leftOffsets: leftNm != null ? parallelOffsetsForHalfWidth(leftNm, policy) : [],
      rightOffsets: rightNm != null ? parallelOffsetsForHalfWidth(rightNm, policy) : [],
      chainNm: chainLengthNm(wps, i, i + 1),
    })
  }

  return legs
}

/**
 * @param {SurveyPlannerInput} input
 */
export function planSurveyScenario(input) {
  const wps = input.waypoints ?? []
  const legs = buildLegWidthSummaries(input)
  const budget = input.sortieBudgetNm ?? 500
  const policy = input.trackPolicy ?? DEFAULT_PARALLEL_TRACK_POLICY

  const teams = (input.teams ?? []).map((team) => {
    const entryIdx =
      wps.length > 0
        ? closestWaypointIndex({ lat: team.depLat, lon: team.depLon }, wps)
        : null
    const entryPt = entryIdx != null ? wps[entryIdx]?.ptIdent ?? null : null
    const ferryInNm =
      entryIdx != null
        ? nauticalMilesBetween(
            { lat: team.depLat, lon: team.depLon },
            { lat: wps[entryIdx].lat, lon: wps[entryIdx].lon }
          )
        : 0

    const sorties = wps.length >= 2 && legs.length > 0 ? packSortiesForTeam(wps, legs, team, budget) : []
    const totalTeamNm = sorties.reduce((sum, s) => sum + s.totalNm, 0)
    const overBudgetCount = sorties.filter((s) => s.overBudget).length

    let note = null
    if (overBudgetCount > 0) {
      note = `${overBudgetCount} sortie(s) exceed the ${budget} NM budget — consider a lower budget split or more teams.`
    }

    return {
      label: team.label,
      side: team.side,
      entryWaypoint: entryPt,
      entryIndex: entryIdx,
      ferryInNm: Math.round(ferryInNm * 10) / 10,
      sorties,
      sortieCount: sorties.length,
      totalNm: Math.round(totalTeamNm * 10) / 10,
      note,
    }
  })

  const totalChainNm = wps.length >= 2 ? chainLengthNm(wps, 0, wps.length - 1) : 0
  const totalSorties = teams.reduce((sum, t) => sum + (t.sortieCount ?? 0), 0)
  const totalWingNm = Math.round(teams.reduce((sum, t) => sum + (t.totalNm ?? 0), 0) * 10) / 10

  return {
    status: teams.some((t) => t.sorties.length > 0) ? 'planned' : 'scaffold',
    route: `${input.routeType ?? ''}${input.routeNumber ?? ''}`.trim(),
    assignmentModel: input.assignmentModel ?? 'opposite-side',
    sortieBudgetNm: budget,
    trackPolicy: { ...DEFAULT_PARALLEL_TRACK_POLICY, ...policy },
    totalCenterlineNm: Math.round(totalChainNm * 10) / 10,
    legs,
    teams,
    totalSorties,
    totalWingNm,
    disclaimer:
      'Wing planning aid only. Verify corridors and procedures in ForeFlight Military Flight Bag before flying.',
  }
}

/**
 * @typedef {ReturnType<typeof planSurveyScenario>} SurveyScenarioResult
 */

/**
 * @typedef {object} StaffingCompareResult
 * @property {number} sortieBudgetNm
 * @property {string} team1DepLabel
 * @property {string} team2DepLabel
 * @property {SurveyScenarioResult} oneTeam
 * @property {SurveyScenarioResult} twoTeams
 * @property {number} deltaSorties
 * @property {number} deltaWingNm
 * @property {number} oneTeamOverBudgetSorties
 * @property {number} twoTeamsOverBudgetSorties
 */

function countOverBudgetSorties(result) {
  return result.teams.reduce(
    (sum, t) => sum + t.sorties.filter((s) => s.overBudget).length,
    0
  )
}

/**
 * One aircraft covering the full corridor: left then right passes from the same departure.
 * @param {SurveyPlannerInput} input - must include Team 1 in `teams`
 * @returns {SurveyScenarioResult}
 */
export function planSingleTeamBothSides(input) {
  const team1 = input.teams?.[0]
  if (!team1) {
    throw new Error('planSingleTeamBothSides requires Team 1 in input.teams')
  }

  const leftResult = planSurveyScenario({
    ...input,
    teams: [{ ...team1, side: 'left' }],
    assignmentModel: 'single',
  })
  const rightResult = planSurveyScenario({
    ...input,
    teams: [{ ...team1, side: 'right' }],
    assignmentModel: 'single',
  })

  const leftTeam = leftResult.teams[0]
  const rightTeam = rightResult.teams[0]
  const teams = [
    { ...leftTeam, label: `${leftTeam.label} (left)` },
    { ...rightTeam, label: `${rightTeam.label} (right)` },
  ]

  const totalSorties = (leftTeam.sortieCount ?? 0) + (rightTeam.sortieCount ?? 0)
  const totalWingNm =
    Math.round(((leftTeam.totalNm ?? 0) + (rightTeam.totalNm ?? 0)) * 10) / 10

  return {
    ...leftResult,
    assignmentModel: 'single-sequential',
    teams,
    totalSorties,
    totalWingNm,
    status: teams.some((t) => t.sorties.length > 0) ? 'planned' : 'scaffold',
  }
}

/**
 * Compare one-team full corridor (both sides sequential) vs two-team opposite-side staffing.
 * @param {SurveyPlannerInput} input - must include at least Team 1 in `teams`
 * @param {SurveyTeamInput} team2 - right-side team with departure coords
 * @param {{ team1DepLabel?: string, team2DepLabel?: string }} [labels]
 * @returns {StaffingCompareResult}
 */
export function compareOneVsTwoTeamStaffing(input, team2, labels = {}) {
  const team1 = input.teams?.[0]
  if (!team1) {
    throw new Error('compareOneVsTwoTeamStaffing requires Team 1 in input.teams')
  }

  const oneTeam = planSingleTeamBothSides(input)
  const twoTeams = planSurveyScenario({
    ...input,
    teams: [team1, team2],
    assignmentModel: 'opposite-side',
  })

  const deltaSorties = (twoTeams.totalSorties ?? 0) - (oneTeam.totalSorties ?? 0)
  const deltaWingNm =
    Math.round(((twoTeams.totalWingNm ?? 0) - (oneTeam.totalWingNm ?? 0)) * 10) / 10

  return {
    sortieBudgetNm: input.sortieBudgetNm ?? 500,
    team1DepLabel: labels.team1DepLabel ?? 'Team 1',
    team2DepLabel: labels.team2DepLabel ?? team2.label ?? 'Team 2',
    oneTeam,
    twoTeams,
    deltaSorties,
    deltaWingNm,
    oneTeamOverBudgetSorties: countOverBudgetSorties(oneTeam),
    twoTeamsOverBudgetSorties: countOverBudgetSorties(twoTeams),
  }
}

/**
 * @typedef {object} TwoVsThreeStaffingCompareResult
 * @property {number} sortieBudgetNm
 * @property {string} team1DepLabel
 * @property {string} team2DepLabel
 * @property {string} team3DepLabel
 * @property {SurveyScenarioResult} twoTeams
 * @property {import('./surveyGeographicSplit.js').GeographicScenarioResult} threeTeams
 * @property {number} deltaSorties
 * @property {number} deltaWingNm
 * @property {number} twoTeamsOverBudgetSorties
 * @property {number} threeTeamsOverBudgetSorties
 */

/**
 * Compare two-team opposite-side vs three-team geographic split (full corridor each).
 * @param {SurveyPlannerInput} input - must include Team 1 in `teams`
 * @param {SurveyTeamInput} team2
 * @param {SurveyTeamInput} team3
 * @param {{ team1DepLabel?: string, team2DepLabel?: string, team3DepLabel?: string }} [labels]
 * @returns {TwoVsThreeStaffingCompareResult}
 */
import { planThreeTeamGeographicScenario } from './surveyGeographicSplit.js'

export function compareTwoVsThreeTeamStaffing(input, team2, team3, labels = {}) {
  const team1 = input.teams?.[0]
  if (!team1) {
    throw new Error('compareTwoVsThreeTeamStaffing requires Team 1 in input.teams')
  }

  const twoTeams = planSurveyScenario({
    ...input,
    teams: [{ ...team1, side: 'left' }, { ...team2, side: 'right' }],
    assignmentModel: 'opposite-side',
  })
  const threeTeams = planThreeTeamGeographicScenario(input, [team1, team2, team3])

  const deltaSorties = (threeTeams.totalSorties ?? 0) - (twoTeams.totalSorties ?? 0)
  const deltaWingNm =
    Math.round(((threeTeams.totalWingNm ?? 0) - (twoTeams.totalWingNm ?? 0)) * 10) / 10

  return {
    sortieBudgetNm: input.sortieBudgetNm ?? 500,
    team1DepLabel: labels.team1DepLabel ?? team1.label ?? 'Team 1',
    team2DepLabel: labels.team2DepLabel ?? team2.label ?? 'Team 2',
    team3DepLabel: labels.team3DepLabel ?? team3.label ?? 'Team 3',
    twoTeams,
    threeTeams,
    deltaSorties,
    deltaWingNm,
    twoTeamsOverBudgetSorties: countOverBudgetSorties(twoTeams),
    threeTeamsOverBudgetSorties: countOverBudgetSorties(threeTeams),
  }
}

export { planThreeTeamGeographicScenario }
