/**
 * Sortie packing: G1000 multi-offset maneuvers on contiguous waypoint chains.
 * See docs/COORDINATOR_SURVEY_CONSOLE.md §3.
 */

import {
  chainLengthNm,
  nauticalMilesBetween,
  estimateSortieNm,
} from './surveyGeometry.js'

/**
 * @typedef {import('./surveySortiePlanner.js').SurveyWaypoint} SurveyWaypoint
 * @typedef {import('./surveySortiePlanner.js').LegWidthSummary} LegWidthSummary
 * @typedef {import('./surveySortiePlanner.js').SurveySide} SurveySide
 * @typedef {import('./surveySortiePlanner.js').SurveyTeamInput} SurveyTeamInput
 */

/**
 * @typedef {object} FerryLatLonLabel
 * @property {number} lat
 * @property {number} lon
 * @property {string} [label]
 */

/**
 * @typedef {object} StagedRefuelContext
 * @property {FerryLatLonLabel} home
 * @property {FerryLatLonLabel} recovery
 * @property {'left' | 'right' | 'single-side'} sideRole
 * @property {boolean} hasOppositeSideAfter
 */

/**
 * @typedef {object} SortiePlan
 * @property {number} sortieNumber
 * @property {string} waypointFrom
 * @property {string} waypointTo
 * @property {number} startIdx
 * @property {number} endIdx
 * @property {string} startAt
 * @property {number[]} offsets
 * @property {number} offsetLegCount
 * @property {number} ferryInNm
 * @property {number} alongRouteNm
 * @property {number} ferryOutNm
 * @property {number} totalNm
 * @property {string} [ferryInLabel]
 * @property {string} [ferryOutLabel]
 * @property {boolean} [overBudget]
 */

/**
 * @param {LegWidthSummary} leg
 * @param {SurveySide} side
 */
function offsetsForLeg(leg, side) {
  return side === 'left' ? leg.leftOffsets : leg.rightOffsets
}

function offsetsKey(offsets) {
  return offsets.join(',')
}

/**
 * Group consecutive legs with identical offset lists for one survey side.
 * @param {SurveyWaypoint[]} wps
 * @param {LegWidthSummary[]} legs
 * @param {SurveySide} side
 */
export function buildUniformOffsetSegments(wps, legs, side) {
  if (legs.length === 0 || wps.length < 2) return []

  const segments = []
  let legStart = 0
  let currentKey = offsetsKey(offsetsForLeg(legs[0], side))

  for (let i = 1; i < legs.length; i++) {
    const key = offsetsKey(offsetsForLeg(legs[i], side))
    if (key !== currentKey) {
      segments.push(segmentFromLegRange(wps, legs, legStart, i - 1, side))
      legStart = i
      currentKey = key
    }
  }
  segments.push(segmentFromLegRange(wps, legs, legStart, legs.length - 1, side))
  return segments.filter((s) => s.offsets.length > 0)
}

/**
 * @param {SurveyWaypoint[]} wps
 * @param {LegWidthSummary[]} legs
 * @param {number} legStart
 * @param {number} legEnd
 * @param {SurveySide} side
 */
function segmentFromLegRange(wps, legs, legStart, legEnd, side) {
  const startIdx = legStart
  const endIdx = legEnd + 1
  const offsets = [...offsetsForLeg(legs[legStart], side)]
  return {
    startIdx,
    endIdx,
    fromPt: wps[startIdx]?.ptIdent ?? String(startIdx),
    toPt: wps[endIdx]?.ptIdent ?? String(endIdx),
    offsets,
    chainNm: chainLengthNm(wps, startIdx, endIdx),
  }
}

/**
 * @param {StagedRefuelContext} ctx
 * @param {number} sideSortieIndex
 * @param {boolean} isTerminalChunk
 */
export function resolveStagedFerryEndpoints(ctx, sideSortieIndex, isTerminalChunk) {
  const { home, recovery, sideRole, hasOppositeSideAfter } = ctx
  const ferryInPt =
    sideSortieIndex === 0 && (sideRole === 'left' || sideRole === 'single-side') ? home : recovery

  let ferryOutPt = recovery
  if (sideRole === 'right' && isTerminalChunk) {
    ferryOutPt = home
  } else if (sideRole === 'left' && isTerminalChunk && !hasOppositeSideAfter) {
    ferryOutPt = home
  }

  return {
    ferryInPt,
    ferryOutPt,
    ferryInLabel: ferryInPt.label ?? 'HOME',
    ferryOutLabel: ferryOutPt.label ?? 'RECOVERY',
  }
}

/**
 * @param {SurveyTeamInput} team
 * @param {object} [ferry]
 * @param {FerryLatLonLabel} [ferry.ferryInPt]
 * @param {FerryLatLonLabel} [ferry.ferryOutPt]
 * @param {string} [ferry.ferryInLabel]
 * @param {string} [ferry.ferryOutLabel]
 */
function defaultFerryFromTeam(team, ferry) {
  const dep = { lat: team.depLat, lon: team.depLon, label: team.label }
  return {
    ferryInPt: ferry?.ferryInPt ?? dep,
    ferryOutPt: ferry?.ferryOutPt ?? dep,
    ferryInLabel: ferry?.ferryInLabel ?? team.label,
    ferryOutLabel: ferry?.ferryOutLabel ?? team.label,
  }
}

/**
 * Best orientation for one sortie on [startIdx..endIdx] with given offsets.
 * @param {SurveyWaypoint[]} wps
 * @param {SurveyTeamInput} team
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number[]} offsets
 * @param {object} [ferry]
 */
export function bestSortiePlan(wps, team, startIdx, endIdx, offsets, ferry) {
  const { ferryInPt, ferryOutPt, ferryInLabel, ferryOutLabel } = defaultFerryFromTeam(team, ferry)
  const k = offsets.length
  const chain = chainLengthNm(wps, startIdx, endIdx)

  /** @type {{ beginIdx: number, endAtIdx: number, ferryIn: number, ferryOut: number, total: number }[]} */
  const candidates = []

  for (const beginIdx of [startIdx, endIdx]) {
    const endAtIdx = k % 2 === 0 ? beginIdx : beginIdx === startIdx ? endIdx : startIdx
    const beginWp = wps[beginIdx]
    const endWp = wps[endAtIdx]
    const ferryIn = nauticalMilesBetween(ferryInPt, { lat: beginWp.lat, lon: beginWp.lon })
    const ferryOut = nauticalMilesBetween({ lat: endWp.lat, lon: endWp.lon }, ferryOutPt)
    const total = estimateSortieNm({
      ferryInNm: ferryIn,
      chainNm: chain,
      offsetLegCount: k,
      ferryOutNm: ferryOut,
    })
    candidates.push({ beginIdx, endAtIdx, ferryIn, ferryOut, total })
  }

  const best = candidates.reduce((a, b) => (a.total <= b.total ? a : b))
  const ferryInNm = Math.round(best.ferryIn * 10) / 10
  const alongRouteNm = Math.round(k * chain * 10) / 10
  const ferryOutNm = Math.round(best.ferryOut * 10) / 10
  return {
    startIdx,
    endIdx,
    waypointFrom: wps[startIdx].ptIdent,
    waypointTo: wps[endIdx].ptIdent,
    startAt: wps[best.beginIdx].ptIdent,
    offsets: [...offsets],
    offsetLegCount: k,
    ferryInNm,
    alongRouteNm,
    ferryOutNm,
    ferryInLabel,
    ferryOutLabel,
    totalNm: Math.round((ferryInNm + alongRouteNm + ferryOutNm) * 10) / 10,
  }
}

/**
 * @param {object | null} ferryState
 * @param {boolean} isTerminalChunk
 */
function ferryForChunk(ferryState, isTerminalChunk) {
  if (!ferryState?.stagedRefuel) return null
  const idx = ferryState.sideCounter.n
  return resolveStagedFerryEndpoints(ferryState.stagedRefuel, idx, isTerminalChunk)
}

/**
 * Pack one geographic range with a fixed offset list into one or more sorties ≤ budget.
 * @param {SurveyWaypoint[]} wps
 * @param {SurveyTeamInput} team
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number[]} offsets
 * @param {number} budgetNm
 * @param {object | null} [ferryState]
 * @param {StagedRefuelContext} [ferryState.stagedRefuel]
 * @param {{ n: number }} [ferryState.sideCounter]
 * @param {number} [ferryState.segmentEndIdx]
 * @returns {Omit<SortiePlan, 'sortieNumber'>[]}
 */
function packRangeWithOffsets(wps, team, startIdx, endIdx, offsets, budgetNm, ferryState = null) {
  if (offsets.length === 0 || startIdx >= endIdx) return []

  const segmentEndIdx = ferryState?.segmentEndIdx ?? wps.length - 1
  const isTerminalChunk = endIdx >= segmentEndIdx

  let fitCount = 0
  for (let c = offsets.length; c >= 1; c--) {
    const plan = bestSortiePlan(
      wps,
      team,
      startIdx,
      endIdx,
      offsets.slice(0, c),
      ferryForChunk(ferryState, isTerminalChunk)
    )
    if (plan.totalNm <= budgetNm + 1e-6) {
      fitCount = c
      break
    }
  }

  if (fitCount > 0) {
    const first = bestSortiePlan(
      wps,
      team,
      startIdx,
      endIdx,
      offsets.slice(0, fitCount),
      ferryForChunk(ferryState, isTerminalChunk)
    )
    if (ferryState?.stagedRefuel) ferryState.sideCounter.n += 1
    const rest = packRangeWithOffsets(
      wps,
      team,
      startIdx,
      endIdx,
      offsets.slice(fitCount),
      budgetNm,
      ferryState
    )
    return [{ ...first }, ...rest]
  }

  if (endIdx - startIdx < 2) {
    const forced = bestSortiePlan(
      wps,
      team,
      startIdx,
      endIdx,
      offsets,
      ferryForChunk(ferryState, isTerminalChunk)
    )
    if (ferryState?.stagedRefuel) ferryState.sideCounter.n += 1
    return [{ ...forced, overBudget: forced.totalNm > budgetNm }]
  }

  const mid = Math.floor((startIdx + endIdx) / 2)
  const splitAt = mid <= startIdx ? startIdx + 1 : mid
  return [
    ...packRangeWithOffsets(wps, team, startIdx, splitAt, offsets, budgetNm, ferryState),
    ...packRangeWithOffsets(wps, team, splitAt, endIdx, offsets, budgetNm, ferryState),
  ]
}

/**
 * @param {SurveyWaypoint[]} wps
 * @param {LegWidthSummary[]} legs
 * @param {SurveyTeamInput} team
 * @param {number} budgetNm
 * @param {StagedRefuelContext | null} [stagedRefuel]
 * @returns {SortiePlan[]}
 */
export function packSortiesForTeam(wps, legs, team, budgetNm, stagedRefuel = null) {
  const segments = buildUniformOffsetSegments(wps, legs, team.side)
  /** @type {Omit<SortiePlan, 'sortieNumber'>[]} */
  const raw = []

  const ferryState = stagedRefuel
    ? {
        stagedRefuel,
        sideCounter: { n: 0 },
        segmentEndIdx: wps.length - 1,
      }
    : null

  for (const seg of segments) {
    raw.push(
      ...packRangeWithOffsets(
        wps,
        team,
        seg.startIdx,
        seg.endIdx,
        seg.offsets,
        budgetNm,
        ferryState
      )
    )
  }

  return raw.map((s, i) => ({ sortieNumber: i + 1, ...s }))
}
