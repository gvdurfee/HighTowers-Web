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
import { findSpanTrackEntryForLeg } from './corridorTrackPlan.js'
import { packSortiesForTeam, bestSortiePlan } from './surveySortiePacker.js'

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
 * @typedef {object} RecoveryAirportInput
 * @property {number} lat
 * @property {number} lon
 * @property {string} [label]
 */

/**
 * @typedef {'return-home' | 'staged-refuel'} FerryMode
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
 * @property {import('./corridorTrackPlan.js').SpanTrackPlanEntry[]} [spanTrackPlan]
 * @property {TeamAssignmentModel} [assignmentModel]
 * @property {string[]} [fullRoutePtIdents] - full-route point order when `waypoints` is a slice
 * @property {FerryMode} [ferryMode] - return home after each sortie vs staged refuel between sides
 * @property {RecoveryAirportInput} [recoveryAirport] - shared refuel field when ferryMode is staged-refuel
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
  const spanTrackPlan = input.spanTrackPlan ?? []
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
    const trackEntry = findSpanTrackEntryForLeg(spanTrackPlan, fromPt, toPt, routePtIdents)
    const leftNm =
      trackEntry?.leftNm ??
      halfWidthNmForLeg(spans, fromPt, toPt, 'left', routePtIdents)
    const rightNm =
      trackEntry?.rightNm ??
      halfWidthNmForLeg(spans, fromPt, toPt, 'right', routePtIdents)
    const leftOffsets =
      trackEntry?.leftOffsets?.length > 0
        ? [...trackEntry.leftOffsets]
        : leftNm != null
          ? parallelOffsetsForHalfWidth(leftNm, policy)
          : []
    const rightOffsets =
      trackEntry?.rightOffsets?.length > 0
        ? [...trackEntry.rightOffsets]
        : rightNm != null
          ? parallelOffsetsForHalfWidth(rightNm, policy)
          : []
    legs.push({
      fromPt,
      toPt,
      leftNm,
      rightNm,
      leftOffsets,
      rightOffsets,
      chainNm: chainLengthNm(wps, i, i + 1),
    })
  }

  return legs
}

/**
 * @param {SurveyPlannerInput} input
 * @param {SurveyTeamInput} team
 * @returns {import('./surveySortiePacker.js').StagedRefuelContext | null}
 */
export function stagedRefuelContextForSide(input, team, sideRole, hasOppositeSideAfter) {
  if (input.ferryMode !== 'staged-refuel' || !input.recoveryAirport) return null
  return {
    home: {
      lat: team.depLat,
      lon: team.depLon,
      label: team.label,
    },
    recovery: {
      lat: input.recoveryAirport.lat,
      lon: input.recoveryAirport.lon,
      label: input.recoveryAirport.label ?? 'RECOVERY',
    },
    sideRole,
    hasOppositeSideAfter,
  }
}

/**
 * Pack both corridor sides for one team (inner then outer).
 * @param {SurveyPlannerInput} input
 * @param {SurveyTeamInput} team
 */
function packBothSidesForTeam(input, team) {
  const wps = input.waypoints ?? []
  const legs = buildLegWidthSummaries(input)
  const budget = input.sortieBudgetNm ?? 500

  const leftCtx = stagedRefuelContextForSide(input, team, 'left', true)
  const rightCtx = stagedRefuelContextForSide(input, team, 'right', false)

  const leftSorties = packSortiesForTeam(
    wps,
    legs,
    { ...team, side: 'left' },
    budget,
    leftCtx
  )
  const rightSorties = packSortiesForTeam(
    wps,
    legs,
    { ...team, side: 'right' },
    budget,
    rightCtx
  ).map((s, i) => ({ ...s, sortieNumber: leftSorties.length + i + 1 }))

  return { leftSorties, rightSorties }
}

/**
 * Ferry-only sortie from shared refuel back to team home (opposite-side staffing).
 * @param {RecoveryAirportInput} recoveryAirport
 * @param {SurveyTeamInput} team
 * @param {number} sortieNumber
 * @param {number} budgetNm
 */
function buildReturnToHomeSortie(recoveryAirport, team, sortieNumber, budgetNm) {
  const recovery = {
    lat: recoveryAirport.lat,
    lon: recoveryAirport.lon,
    label: recoveryAirport.label ?? 'RECOVERY',
  }
  const home = { lat: team.depLat, lon: team.depLon, label: team.label }
  const ferryNm = Math.round(nauticalMilesBetween(recovery, home) * 10) / 10
  return {
    sortieNumber,
    waypointFrom: '(return home)',
    waypointTo: '(return home)',
    startIdx: -1,
    endIdx: -1,
    startAt: '—',
    offsets: [],
    offsetLegCount: 0,
    ferryInNm: 0,
    alongRouteNm: 0,
    ferryOutNm: ferryNm,
    ferryInLabel: recovery.label,
    ferryOutLabel: home.label,
    totalNm: ferryNm,
    overBudget: ferryNm > budgetNm + 1e-6,
    returnHomeOnly: true,
  }
}

/**
 * Human-readable note for staged-refuel team sortie lists.
 * @param {ReturnType<typeof buildReturnToHomeSortie>[]} sorties
 */
export function buildStagedRefuelTeamNote(sorties) {
  if (!sorties?.length) return null
  const returnOnly = sorties.find((s) => s.returnHomeOnly)
  if (returnOnly) {
    return `Survey sorties refuel at the shared airport; sortie ${returnOnly.sortieNumber} is return to home (pilots plan fuel and route).`
  }
  const last = sorties[sorties.length - 1]
  const surveyCount = sorties.filter((s) => !s.returnHomeOnly).length
  if (surveyCount >= 2 && last && !last.returnHomeOnly) {
    return `Survey sorties refuel at the shared airport; sortie ${last.sortieNumber} completes remaining survey work and returns home (within NM budget).`
  }
  return null
}

/**
 * When staged refuel applies: try merging return-home NM into the last survey sortie if it fits the budget
 * (never into sortie 1 — crews refuel after the first sortie). Otherwise append a ferry-only return sortie.
 * @param {SurveyWaypoint[]} wps
 * @param {SurveyTeamInput} team
 * @param {ReturnType<typeof buildReturnToHomeSortie>[]} sorties
 * @param {import('./surveySortiePacker.js').StagedRefuelContext} stagedRefuel
 * @param {number} budgetNm
 * @param {{ appendReturnHomeIfNeeded?: boolean }} [options]
 */
export function finalizeStagedRefuelTeamSorties(wps, team, sorties, stagedRefuel, budgetNm, options = {}) {
  const { appendReturnHomeIfNeeded = false } = options
  if (!stagedRefuel || sorties.length === 0) {
    return { sorties, merged: false, appendedReturn: false }
  }

  const { home, recovery } = stagedRefuel
  const recoveryLabel = recovery.label ?? 'RECOVERY'
  const homeLabel = home.label ?? team.label
  /** @type {ReturnType<typeof buildReturnToHomeSortie>[]} */
  let result = sorties.map((s) => ({ ...s }))
  let merged = false

  if (result.length >= 2) {
    const lastIdx = result.length - 1
    const last = result[lastIdx]
    if (!last.returnHomeOnly && last.ferryOutLabel === recoveryLabel) {
      const replanned = bestSortiePlan(wps, team, last.startIdx, last.endIdx, last.offsets, {
        ferryInPt: recovery,
        ferryOutPt: home,
        ferryInLabel: recoveryLabel,
        ferryOutLabel: homeLabel,
      })
      if (replanned.totalNm <= budgetNm + 1e-6) {
        result[lastIdx] = { ...replanned, sortieNumber: last.sortieNumber }
        merged = true
      }
    }
  }

  let appendedReturn = false
  const last = result[result.length - 1]
  const needsReturn =
    appendReturnHomeIfNeeded &&
    !merged &&
    last &&
    !last.returnHomeOnly &&
    last.ferryOutLabel === recoveryLabel

  if (needsReturn) {
    result.push(
      buildReturnToHomeSortie(
        { lat: recovery.lat, lon: recovery.lon, label: recovery.label },
        team,
        result.length + 1,
        budgetNm
      )
    )
    appendedReturn = true
  }

  result = result.map((s, i) => ({ ...s, sortieNumber: i + 1 }))
  return { sorties: result, merged, appendedReturn }
}

/**
 * @param {SurveyPlannerInput} input
 */
export function planSurveyScenario(input) {
  const wps = input.waypoints ?? []
  const legs = buildLegWidthSummaries(input)
  const budget = input.sortieBudgetNm ?? 500
  const policy = input.trackPolicy ?? DEFAULT_PARALLEL_TRACK_POLICY
  const assignmentModel = input.assignmentModel ?? 'opposite-side'
  const useStagedFinalize =
    input.ferryMode === 'staged-refuel' &&
    input.recoveryAirport &&
    assignmentModel === 'opposite-side'

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

    const stagedCtx = stagedRefuelContextForSide(input, team, 'single-side', false)
    const packedSurvey =
      wps.length >= 2 && legs.length > 0
        ? packSortiesForTeam(wps, legs, team, budget, stagedCtx)
        : []

    let sorties = packedSurvey
    if (useStagedFinalize && stagedCtx && packedSurvey.length > 0) {
      sorties = finalizeStagedRefuelTeamSorties(wps, team, packedSurvey, stagedCtx, budget, {
        appendReturnHomeIfNeeded: true,
      }).sorties
    }

    const totalTeamNm = sorties.reduce((sum, s) => sum + s.totalNm, 0)
    const overBudgetCount = sorties.filter((s) => s.overBudget).length

    let note = null
    if (overBudgetCount > 0) {
      note = `${overBudgetCount} sortie(s) exceed the ${budget} NM budget — consider a lower budget split or more teams.`
    }
    if (useStagedFinalize && sorties.length > 0) {
      const stagedNote = buildStagedRefuelTeamNote(sorties)
      note = note && stagedNote ? `${note} ${stagedNote}` : stagedNote ?? note
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
    assignmentModel,
    sortieBudgetNm: budget,
    ferryMode: input.ferryMode ?? 'return-home',
    recoveryAirport: input.recoveryAirport ?? null,
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

  const wps = input.waypoints ?? []
  const legs = buildLegWidthSummaries(input)
  const budget = input.sortieBudgetNm ?? 500
  const policy = input.trackPolicy ?? DEFAULT_PARALLEL_TRACK_POLICY
  const { leftSorties, rightSorties } = packBothSidesForTeam(input, team1)

  const entryIdx =
    wps.length > 0 ? closestWaypointIndex({ lat: team1.depLat, lon: team1.depLon }, wps) : null
  const entryPt = entryIdx != null ? wps[entryIdx]?.ptIdent ?? null : null
  const ferryInNm =
    entryIdx != null
      ? nauticalMilesBetween(
          { lat: team1.depLat, lon: team1.depLon },
          { lat: wps[entryIdx].lat, lon: wps[entryIdx].lon }
        )
      : 0

  function teamFromSorties(label, side, sorties) {
    let finalSorties = sorties
    if (input.ferryMode === 'staged-refuel' && input.recoveryAirport) {
      const sideRole = side === 'left' ? 'left' : 'right'
      const ctx = stagedRefuelContextForSide(
        input,
        team1,
        sideRole,
        side === 'left'
      )
      finalSorties = finalizeStagedRefuelTeamSorties(
        wps,
        { ...team1, side },
        sorties,
        ctx,
        budget,
        { appendReturnHomeIfNeeded: side === 'right' }
      ).sorties
    }

    const totalTeamNm = finalSorties.reduce((sum, s) => sum + s.totalNm, 0)
    const overBudgetCount = finalSorties.filter((s) => s.overBudget).length
    let note = null
    if (overBudgetCount > 0) {
      note = `${overBudgetCount} sortie(s) exceed the ${budget} NM budget — consider a lower budget split or more teams.`
    }
    if (input.ferryMode === 'staged-refuel' && finalSorties.length > 0) {
      const stagedNote = buildStagedRefuelTeamNote(finalSorties)
      note = note && stagedNote ? `${note} ${stagedNote}` : stagedNote ?? note
    }
    return {
      label,
      side,
      entryWaypoint: entryPt,
      entryIndex: entryIdx,
      ferryInNm: Math.round(ferryInNm * 10) / 10,
      sorties: finalSorties,
      sortieCount: finalSorties.length,
      totalNm: Math.round(totalTeamNm * 10) / 10,
      note,
    }
  }

  const leftTeam = teamFromSorties(`${team1.label} (left)`, 'left', leftSorties)
  const rightTeam = teamFromSorties(`${team1.label} (right)`, 'right', rightSorties)
  const teams = [leftTeam, rightTeam]

  const totalSorties = leftSorties.length + rightSorties.length
  const totalWingNm =
    Math.round(((leftTeam.totalNm ?? 0) + (rightTeam.totalNm ?? 0)) * 10) / 10
  const totalChainNm = wps.length >= 2 ? chainLengthNm(wps, 0, wps.length - 1) : 0

  return {
    status: teams.some((t) => t.sorties.length > 0) ? 'planned' : 'scaffold',
    route: `${input.routeType ?? ''}${input.routeNumber ?? ''}`.trim(),
    assignmentModel: 'single-sequential',
    sortieBudgetNm: budget,
    ferryMode: input.ferryMode ?? 'return-home',
    recoveryAirport: input.recoveryAirport ?? null,
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
export { packBothSidesForTeam }
