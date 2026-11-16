/**
 * Sortie packing: G1000 multi-offset maneuvers on contiguous waypoint chains.
 * See docs/COORDINATOR_SURVEY_CONSOLE.md §3.
 */

import {
  chainLengthNm,
  nauticalMilesBetween,
  estimateSortieNm,
  formatOffsetsPerSide,
  LANE_TURNAROUND_NM,
} from './surveyGeometry.js'
import { buildOffsetTrack } from './offsetRoutePlan.js'

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
export function resolveStagedFerryEndpoints(ctx, sideSortieIndex, _isTerminalChunk) {
  const { home, recovery, sideRole } = ctx
  // Packing does not yet know which sortie is the team's last one.
  // Every packed sortie lands at the refuel airport. finalizeStagedRefuelTeamSorties
  // then sends only the final sortie home, so the chain stays continuous.
  const ferryInPt =
    sideSortieIndex === 0 && (sideRole === 'left' || sideRole === 'single-side') ? home : recovery
  const ferryOutPt = recovery

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
function roundNm(nm) {
  return Math.round(nm * 10) / 10
}

/** Offset-track path for one lane list, including the jump from one lane to the next. */
function measuredSortiePath(wps, startIdx, endIdx, offsets, side, beginIdx, ferryInPt, ferryOutPt, neighbors = null) {
  const slice = wps.slice(startIdx, endIdx + 1)
  const lateral = side === 'right' ? 'right' : 'left'
  const tracks = offsets.map((offsetNm) => {
    const widths = slice.slice(1).map(() => offsetNm)
    const built = buildOffsetTrack(slice, widths, widths.map((nm) => Math.max(nm, 1)), lateral, {
      before: startIdx > 0 ? wps[startIdx - 1] : neighbors?.before ?? null,
      after: endIdx + 1 < wps.length ? wps[endIdx + 1] : neighbors?.after ?? null,
    })
    return built.waypoints.map((point) => ({ lat: point.lat, lon: point.lon }))
  })
  const forwardFirst = beginIdx === startIdx
  /** @type {Array<{ lat: number, lon: number }>} */
  const ordered = []
  tracks.forEach((track, index) => {
    const forward = forwardFirst ? index % 2 === 0 : index % 2 !== 0
    ordered.push(...(forward ? track : [...track].reverse()))
  })
  if (ordered.length === 0) return null
  const ferryIn = nauticalMilesBetween(ferryInPt, ordered[0])
  const ferryOut = nauticalMilesBetween(ordered[ordered.length - 1], ferryOutPt)
  let along = 0
  for (let i = 1; i < ordered.length; i++) along += nauticalMilesBetween(ordered[i - 1], ordered[i])
  return { ferryIn, ferryOut, along, total: ferryIn + along + ferryOut }
}

export function bestSortiePlan(wps, team, startIdx, endIdx, offsets, ferry, neighbors = null) {
  const { ferryInPt, ferryOutPt, ferryInLabel, ferryOutLabel } = defaultFerryFromTeam(team, ferry)
  const k = offsets.length
  const chain = chainLengthNm(wps, startIdx, endIdx)
  const side = team.side === 'right' ? 'right' : 'left'

  /** @type {{ beginIdx: number, endAtIdx: number, ferryIn: number, ferryOut: number, along: number, total: number }[]} */
  const candidates = []

  for (const beginIdx of [startIdx, endIdx]) {
    const endAtIdx = k % 2 === 0 ? beginIdx : beginIdx === startIdx ? endIdx : startIdx
    let measured = null
    try {
      measured = measuredSortiePath(wps, startIdx, endIdx, offsets, side, beginIdx, ferryInPt, ferryOutPt, neighbors)
    } catch {
      measured = null
    }
    if (!measured) {
      const beginWp = wps[beginIdx]
      const endWp = wps[endAtIdx]
      const ferryIn = nauticalMilesBetween(ferryInPt, { lat: beginWp.lat, lon: beginWp.lon })
      const ferryOut = nauticalMilesBetween({ lat: endWp.lat, lon: endWp.lon }, ferryOutPt)
      const connectors = Math.max(0, k - 1) * LANE_TURNAROUND_NM
      const total = estimateSortieNm({
        ferryInNm: ferryIn,
        chainNm: chain,
        offsetLegCount: k,
        ferryOutNm: ferryOut,
        connectorNm: connectors,
      })
      candidates.push({ beginIdx, endAtIdx, ferryIn, ferryOut, along: k * chain + connectors, total })
      continue
    }
    candidates.push({ beginIdx, endAtIdx, ...measured })
  }

  const best = candidates.reduce((a, b) => (a.total <= b.total ? a : b))
  const ferryInNm = roundNm(best.ferryIn)
  const ferryOutNm = roundNm(best.ferryOut)
  const alongRouteNm = roundNm(best.total - best.ferryIn - best.ferryOut)
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
    totalNm: roundNm(ferryInNm + alongRouteNm + ferryOutNm),
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
function packRangeWithOffsets(wps, team, startIdx, endIdx, offsets, budgetNm, ferryState = null, neighbors = null) {
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
      ferryForChunk(ferryState, isTerminalChunk),
      neighbors
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
      ferryForChunk(ferryState, isTerminalChunk),
      neighbors
    )
    if (ferryState?.stagedRefuel) ferryState.sideCounter.n += 1
    const rest = packRangeWithOffsets(
      wps,
      team,
      startIdx,
      endIdx,
      offsets.slice(fitCount),
      budgetNm,
      ferryState,
      neighbors
    )
    return [{ ...first }, ...rest]
  }

  if (endIdx - startIdx < 2) {
    const one = bestSortiePlan(
      wps,
      team,
      startIdx,
      endIdx,
      offsets.slice(0, 1),
      ferryForChunk(ferryState, isTerminalChunk),
      neighbors
    )
    if (ferryState?.stagedRefuel) ferryState.sideCounter.n += 1
    const rest = packRangeWithOffsets(wps, team, startIdx, endIdx, offsets.slice(1), budgetNm, ferryState, neighbors)
    return [{ ...one, overBudget: one.totalNm > budgetNm }, ...rest]
  }

  const mid = Math.floor((startIdx + endIdx) / 2)
  const splitAt = mid <= startIdx ? startIdx + 1 : mid
  return [
    ...packRangeWithOffsets(wps, team, startIdx, splitAt, offsets, budgetNm, ferryState, neighbors),
    ...packRangeWithOffsets(wps, team, splitAt, endIdx, offsets, budgetNm, ferryState, neighbors),
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
export function packSortiesForTeam(wps, legs, team, budgetNm, stagedRefuel = null, neighbors = null) {
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
        ferryState,
        neighbors
      )
    )
  }

  return raw.map((s, i) => {
    const leg = legs[s.startIdx]
    const left = team.side === 'left' ? s.offsets : (leg?.leftOffsets ?? [])
    const right = team.side === 'right' ? s.offsets : (leg?.rightOffsets ?? [])
    return {
      sortieNumber: i + 1,
      side: team.side,
      offsetsPerSide: formatOffsetsPerSide(left, right),
      ...s,
    }
  })
}
