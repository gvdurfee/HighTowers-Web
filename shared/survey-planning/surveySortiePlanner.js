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
 * @typedef {'opposite-side' | 'geographic' | 'single'} TeamAssignmentModel
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
 */
export function buildLegWidthSummaries(input) {
  const spans = parseWidthTexts(input.widthTexts ?? [])
  const policy = input.trackPolicy ?? {}
  const wps = input.waypoints ?? []
  const routePtIdents = wps.map((w, i) => w.ptIdent ?? String(i))
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
