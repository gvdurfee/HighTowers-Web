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
 * Best orientation for one sortie on [startIdx..endIdx] with given offsets.
 * @param {SurveyWaypoint[]} wps
 * @param {SurveyTeamInput} team
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number[]} offsets
 */
export function bestSortiePlan(wps, team, startIdx, endIdx, offsets) {
  const dep = { lat: team.depLat, lon: team.depLon }
  const k = offsets.length
  const chain = chainLengthNm(wps, startIdx, endIdx)

  /** @type {{ beginIdx: number, endAtIdx: number, ferryIn: number, ferryOut: number, total: number }[]} */
  const candidates = []

  for (const beginIdx of [startIdx, endIdx]) {
    const endAtIdx = k % 2 === 0 ? beginIdx : beginIdx === startIdx ? endIdx : startIdx
    const beginWp = wps[beginIdx]
    const endWp = wps[endAtIdx]
    const ferryIn = nauticalMilesBetween(dep, { lat: beginWp.lat, lon: beginWp.lon })
    const ferryOut = nauticalMilesBetween({ lat: endWp.lat, lon: endWp.lon }, dep)
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
    totalNm: Math.round((ferryInNm + alongRouteNm + ferryOutNm) * 10) / 10,
  }
}

/**
 * Pack one geographic range with a fixed offset list into one or more sorties ≤ budget.
 * @param {SurveyWaypoint[]} wps
 * @param {SurveyTeamInput} team
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number[]} offsets
 * @param {number} budgetNm
 * @returns {Omit<SortiePlan, 'sortieNumber'>[]}
 */
function packRangeWithOffsets(wps, team, startIdx, endIdx, offsets, budgetNm) {
  if (offsets.length === 0 || startIdx >= endIdx) return []

  let fitCount = 0
  for (let c = offsets.length; c >= 1; c--) {
    const plan = bestSortiePlan(wps, team, startIdx, endIdx, offsets.slice(0, c))
    if (plan.totalNm <= budgetNm + 1e-6) {
      fitCount = c
      break
    }
  }

  if (fitCount > 0) {
    const first = bestSortiePlan(wps, team, startIdx, endIdx, offsets.slice(0, fitCount))
    const rest = packRangeWithOffsets(
      wps,
      team,
      startIdx,
      endIdx,
      offsets.slice(fitCount),
      budgetNm
    )
    return [{ ...first }, ...rest]
  }

  if (endIdx - startIdx < 2) {
    const forced = bestSortiePlan(wps, team, startIdx, endIdx, offsets)
    return [{ ...forced, overBudget: forced.totalNm > budgetNm }]
  }

  const mid = Math.floor((startIdx + endIdx) / 2)
  const splitAt = mid <= startIdx ? startIdx + 1 : mid
  return [
    ...packRangeWithOffsets(wps, team, startIdx, splitAt, offsets, budgetNm),
    ...packRangeWithOffsets(wps, team, splitAt, endIdx, offsets, budgetNm),
  ]
}

/**
 * @param {SurveyWaypoint[]} wps
 * @param {LegWidthSummary[]} legs
 * @param {SurveyTeamInput} team
 * @param {number} budgetNm
 * @returns {SortiePlan[]}
 */
export function packSortiesForTeam(wps, legs, team, budgetNm) {
  const segments = buildUniformOffsetSegments(wps, legs, team.side)
  /** @type {Omit<SortiePlan, 'sortieNumber'>[]} */
  const raw = []

  for (const seg of segments) {
    raw.push(...packRangeWithOffsets(wps, team, seg.startIdx, seg.endIdx, seg.offsets, budgetNm))
  }

  return raw.map((s, i) => ({ sortieNumber: i + 1, ...s }))
}
