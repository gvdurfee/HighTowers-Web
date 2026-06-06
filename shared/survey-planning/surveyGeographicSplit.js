/**
 * Geographic route split for multi-team survey planning.
 * Each team covers a contiguous waypoint segment (both corridor sides).
 * See docs/COORDINATOR_SURVEY_CONSOLE.md §5.
 */

import {
  planSurveyScenario,
  buildLegWidthSummaries,
} from './surveySortiePlanner.js'
import { chainLengthNm, DEFAULT_PARALLEL_TRACK_POLICY } from './surveyGeometry.js'

/** @typedef {import('./surveySortiePlanner.js').SurveyPlannerInput} SurveyPlannerInput */
/** @typedef {import('./surveySortiePlanner.js').SurveyTeamInput} SurveyTeamInput */
/** @typedef {import('./surveySortiePlanner.js').SurveyWaypoint} SurveyWaypoint */
/** @typedef {import('./surveySortiePlanner.js').SurveyScenarioResult} SurveyScenarioResult */

/**
 * @typedef {object} GeographicSegmentAssignment
 * @property {string} teamLabel
 * @property {string} waypointFrom
 * @property {string} waypointTo
 * @property {number} startIdx
 * @property {number} endIdx
 * @property {number} sortieCount
 * @property {number} totalNm
 */

/**
 * @typedef {SurveyScenarioResult & {
 *   geographicSplits: { boundaryIdx: number, boundaryPt: string }[],
 *   segmentAssignments: GeographicSegmentAssignment[],
 * }} GeographicScenarioResult
 */

const TEAM_PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

/**
 * @param {SurveyWaypoint[]} wps
 * @param {number} startIdx inclusive
 * @param {number} endIdx inclusive
 */
function sliceWaypoints(wps, startIdx, endIdx) {
  return wps.slice(startIdx, endIdx + 1)
}

/**
 * @param {import('./surveySortiePlanner.js').SurveyScenarioResult['teams'][0]} left
 * @param {import('./surveySortiePlanner.js').SurveyScenarioResult['teams'][0]} right
 * @param {string} label
 * @param {string} waypointFrom
 * @param {string} waypointTo
 */
function mergeBothSidesForSegment(left, right, label, waypointFrom, waypointTo) {
  const sorties = [...left.sorties, ...right.sorties].map((s, i) => ({
    ...s,
    sortieNumber: i + 1,
  }))
  const overBudgetCount = sorties.filter((s) => s.overBudget).length
  const totalNm = Math.round(((left.totalNm ?? 0) + (right.totalNm ?? 0)) * 10) / 10

  let note = null
  if (overBudgetCount > 0) {
    note = `${overBudgetCount} sortie(s) exceed budget on this segment.`
  }
  if (left.note || right.note) {
    const parts = [left.note, right.note].filter(Boolean)
    note = note ? `${note} ${parts.join(' ')}` : parts.join(' ')
  }

  return {
    label,
    side: 'both',
    waypointFrom,
    waypointTo,
    entryWaypoint: left.entryWaypoint,
    entryIndex: left.entryIndex,
    ferryInNm: left.ferryInNm,
    sorties,
    sortieCount: sorties.length,
    totalNm,
    note,
  }
}

/**
 * Plan one geographic chunk (both corridor sides) for a team departure.
 * @param {SurveyPlannerInput} input
 * @param {SurveyTeamInput} team
 * @param {SurveyWaypoint[]} chunkWps
 * @param {string[]} fullRoutePtIdents
 */
function planChunkBothSides(input, team, chunkWps, fullRoutePtIdents) {
  if (chunkWps.length < 2) return null
  const chunkInput = { ...input, waypoints: chunkWps, fullRoutePtIdents }
  const leftResult = planSurveyScenario({
    ...chunkInput,
    teams: [{ ...team, side: 'left' }],
    assignmentModel: 'single',
  })
  const rightResult = planSurveyScenario({
    ...chunkInput,
    teams: [{ ...team, side: 'right' }],
    assignmentModel: 'single',
  })
  return { leftTeam: leftResult.teams[0], rightTeam: rightResult.teams[0] }
}

/**
 * @param {SurveyPlannerInput} input
 * @param {SurveyTeamInput[]} teams - exactly three teams with departure coords
 * @param {number} s1 - boundary waypoint index (shared with next segment)
 * @param {number} s2 - second boundary waypoint index
 * @param {number[]} teamOrder - which team index serves each chunk
 */
function evaluateThreeWaySplit(input, teams, s1, s2, teamOrder) {
  const wps = input.waypoints ?? []
  const fullRoutePtIdents = wps.map((w, i) => w.ptIdent ?? String(i))
  const chunks = [
    sliceWaypoints(wps, 0, s1),
    sliceWaypoints(wps, s1, s2),
    sliceWaypoints(wps, s2, wps.length - 1),
  ]

  /** @type {ReturnType<typeof mergeBothSidesForSegment>[]} */
  const segmentTeams = []
  let totalSorties = 0
  let totalWingNm = 0
  let overBudget = 0

  for (let i = 0; i < 3; i++) {
    const chunkResult = planChunkBothSides(
      input,
      teams[teamOrder[i]],
      chunks[i],
      fullRoutePtIdents
    )
    if (!chunkResult) return null

    const left = chunkResult.leftTeam
    const right = chunkResult.rightTeam
    const fromPt = chunks[i][0]?.ptIdent ?? '?'
    const toPt = chunks[i][chunks[i].length - 1]?.ptIdent ?? '?'
    const teamLabel = teams[teamOrder[i]].label ?? `Team ${teamOrder[i] + 1}`

    segmentTeams.push(
      mergeBothSidesForSegment(
        left,
        right,
        `${teamLabel} — ${fromPt}→${toPt}`,
        fromPt,
        toPt
      )
    )
    totalSorties += segmentTeams[i].sortieCount ?? 0
    totalWingNm += segmentTeams[i].totalNm ?? 0
    overBudget += segmentTeams[i].sorties.filter((s) => s.overBudget).length
  }

  if (segmentTeams.some((t) => (t.sortieCount ?? 0) === 0)) return null

  return {
    segmentTeams,
    totalSorties,
    totalWingNm: Math.round(totalWingNm * 10) / 10,
    overBudget,
    s1,
    s2,
    teamOrder: [...teamOrder],
  }
}

/**
 * Optimize a three-team geographic split: contiguous segments, both sides each,
 * with team-to-segment assignment chosen to minimize wing sorties (tie-break NM).
 * @param {SurveyPlannerInput} input
 * @param {SurveyTeamInput[]} teams - three teams
 * @returns {GeographicScenarioResult}
 */
export function planThreeTeamGeographicScenario(input, teams) {
  if (!teams || teams.length !== 3) {
    throw new Error('planThreeTeamGeographicScenario requires exactly three teams')
  }

  const wps = input.waypoints ?? []
  const lastIdx = wps.length - 1

  const legs = buildLegWidthSummaries(input)
  const budget = input.sortieBudgetNm ?? 500
  const policy = input.trackPolicy ?? DEFAULT_PARALLEL_TRACK_POLICY
  const totalChainNm = wps.length >= 2 ? chainLengthNm(wps, 0, wps.length - 1) : 0
  const disclaimer =
    'Wing planning aid only. Verify corridors and procedures in ForeFlight Military Flight Bag before flying.'

  if (wps.length < 4) {
    return {
      status: 'scaffold',
      route: `${input.routeType ?? ''}${input.routeNumber ?? ''}`.trim(),
      assignmentModel: 'geographic',
      sortieBudgetNm: budget,
      trackPolicy: { ...DEFAULT_PARALLEL_TRACK_POLICY, ...policy },
      totalCenterlineNm: Math.round(totalChainNm * 10) / 10,
      legs,
      teams: [],
      totalSorties: 0,
      totalWingNm: 0,
      geographicSplits: [],
      segmentAssignments: [],
      disclaimer,
    }
  }
  let best = null

  for (let s1 = 1; s1 <= lastIdx - 2; s1++) {
    for (let s2 = s1 + 1; s2 <= lastIdx - 1; s2++) {
      for (const teamOrder of TEAM_PERMUTATIONS) {
        const evalResult = evaluateThreeWaySplit(input, teams, s1, s2, teamOrder)
        if (!evalResult) continue

        if (
          !best ||
          evalResult.totalSorties < best.totalSorties ||
          (evalResult.totalSorties === best.totalSorties &&
            evalResult.totalWingNm < best.totalWingNm) ||
          (evalResult.totalSorties === best.totalSorties &&
            evalResult.totalWingNm === best.totalWingNm &&
            (evalResult.overBudget < best.overBudget ||
              (evalResult.overBudget === best.overBudget &&
                (s1 < best.s1 || (s1 === best.s1 && s2 < best.s2)))))
        ) {
          best = evalResult
        }
      }
    }
  }

  if (!best) {
    throw new Error('No valid three-team geographic split for this route')
  }

  const segmentAssignments = best.segmentTeams.map((t, i) => {
    const chunkStarts = [0, best.s1, best.s2]
    const chunkEnds = [best.s1, best.s2, lastIdx]
    return {
      teamLabel: teams[best.teamOrder[i]].label ?? `Team ${best.teamOrder[i] + 1}`,
      waypointFrom: t.waypointFrom ?? '?',
      waypointTo: t.waypointTo ?? '?',
      startIdx: chunkStarts[i],
      endIdx: chunkEnds[i],
      sortieCount: t.sortieCount ?? 0,
      totalNm: t.totalNm ?? 0,
    }
  })

  return {
    status: 'planned',
    route: `${input.routeType ?? ''}${input.routeNumber ?? ''}`.trim(),
    assignmentModel: 'geographic',
    sortieBudgetNm: budget,
    trackPolicy: { ...DEFAULT_PARALLEL_TRACK_POLICY, ...policy },
    totalCenterlineNm: Math.round(totalChainNm * 10) / 10,
    legs,
    teams: best.segmentTeams,
    totalSorties: best.totalSorties,
    totalWingNm: best.totalWingNm,
    geographicSplits: [
      { boundaryIdx: best.s1, boundaryPt: wps[best.s1]?.ptIdent ?? String(best.s1) },
      { boundaryIdx: best.s2, boundaryPt: wps[best.s2]?.ptIdent ?? String(best.s2) },
    ],
    segmentAssignments,
    disclaimer,
  }
}
