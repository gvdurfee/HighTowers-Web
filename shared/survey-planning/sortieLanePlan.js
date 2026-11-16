/**
 * Lanes for one side of a saved team segment.
 * Offset lists, start end, names, and distance come from the Console sortie planner.
 * The track geometry comes from the shared offset builder.
 */

import {
  DEFAULT_PARALLEL_TRACK_POLICY,
  NO_OFFSET_INSIDE_NOTE,
  NO_PUBLISHED_WIDTH_NOTE,
  parallelOffsetsForHalfWidth,
} from './surveyGeometry.js'
import { bestSortiePlan, buildUniformOffsetSegments } from './surveySortiePacker.js'
import { buildSerpentineRouteSequence } from './surveySortieFplRoute.js'
import { buildOffsetTrack, reverseOffsetTrack } from './offsetRoutePlan.js'

/**
 * @param {number | null | undefined} widthNm
 * @returns {boolean}
 */
function publishedWidth(widthNm) {
  return Number.isFinite(widthNm) && widthNm > 0
}

/**
 * @param {object} opts
 * @param {Array<{ ptIdent: string, lat: number, lon: number, g1000Name?: string, originalName?: string }>} opts.points
 * @param {Array<{ leftNm: number, rightNm: number } | null>} opts.legWidths
 * @param {'left' | 'right'} opts.side
 * @param {{ firstOffsetNm?: number, stepNm?: number }} [opts.policy]
 * @param {{ lat: number, lon: number, identifier?: string } | null} [opts.departure]
 * @param {{ lat: number, lon: number, identifier?: string } | null} [opts.landing]
 */
export function planSideLanes(opts) {
  const policy = { ...DEFAULT_PARALLEL_TRACK_POLICY, ...(opts.policy ?? {}) }
  const points = opts.points ?? []
  const legWidths = opts.legWidths ?? []
  const side = opts.side
  const wps = points.map((point, index) => ({
    ptIdent: point.ptIdent,
    lat: point.lat,
    lon: point.lon,
    g1000Name: point.g1000Name || point.ptIdent,
    originalName: point.originalName,
    nextPt: points[index + 1]?.ptIdent,
  }))
  const legs = legWidths.map((width, index) => ({
    fromPt: wps[index]?.ptIdent ?? '',
    toPt: wps[index + 1]?.ptIdent ?? '',
    leftNm: width?.leftNm ?? null,
    rightNm: width?.rightNm ?? null,
    leftOffsets: parallelOffsetsForHalfWidth(width?.leftNm, policy),
    rightOffsets: parallelOffsetsForHalfWidth(width?.rightNm, policy),
    leftNote: null,
    rightNote: null,
    chainNm: 0,
  }))
  const segments = buildUniformOffsetSegments(wps, legs, side)
  if (segments.length === 0) {
    const widths = legWidths.map((width) => (side === 'left' ? width?.leftNm : width?.rightNm))
    const missing = widths.length === 0 || widths.every((width) => !publishedWidth(width))
    return {
      side,
      pieces: [],
      lanes: [],
      offsetsNm: [],
      routeSequence: [],
      distanceNm: 0,
      startAt: null,
      note: missing ? NO_PUBLISHED_WIDTH_NOTE : NO_OFFSET_INSIDE_NOTE,
    }
  }

  const departure = opts.departure
  const landing = opts.landing ?? departure
  const hasFerry =
    departure != null && Number.isFinite(departure.lat) && Number.isFinite(departure.lon)
  const ferryIn = hasFerry ? departure : { lat: wps[0].lat, lon: wps[0].lon, identifier: '' }
  const ferryOut =
    landing != null && Number.isFinite(landing.lat) && Number.isFinite(landing.lon) ? landing : ferryIn
  const team = {
    label: ferryIn.identifier || 'team',
    depLat: ferryIn.lat,
    depLon: ferryIn.lon,
    side,
  }

  /** @type {object[]} */
  const pieces = []
  /** @type {object[]} */
  const lanes = []
  /** @type {string[]} */
  const routeSequence = []

  for (let group = 0; group < segments.length; group++) {
    const seg = segments[group]
    const plan = bestSortiePlan(wps, team, seg.startIdx, seg.endIdx, seg.offsets, {
      ferryInPt: { lat: ferryIn.lat, lon: ferryIn.lon, label: ferryIn.identifier },
      ferryOutPt: { lat: ferryOut.lat, lon: ferryOut.lon, label: ferryOut.identifier },
    })
    const fragment = wps.slice(seg.startIdx, seg.endIdx + 1)
    const startAt = hasFerry ? plan.startAt : fragment[0].ptIdent
    const built = buildSerpentineRouteSequence(fragment, startAt, plan.offsets)
    routeSequence.push(...built.routeSequence)

    const forwardFirst = startAt === fragment[0].ptIdent
    const widthSlice = legWidths.slice(seg.startIdx, seg.endIdx)
    plan.offsets.forEach((offsetNm, k) => {
      const track = buildOffsetTrack(
        fragment,
        widthSlice.map(() => offsetNm),
        widthSlice.map((width) => (side === 'left' ? width.leftNm : width.rightNm)),
        side,
        {
          before: seg.startIdx > 0 ? wps[seg.startIdx - 1] : null,
          after: seg.endIdx + 1 < wps.length ? wps[seg.endIdx + 1] : null,
        }
      )
      const fromStart = k % 2 === 0
      const forward = forwardFirst ? fromStart : !fromStart
      const ordered = forward ? track.waypoints : reverseOffsetTrack(track.waypoints)
      lanes.push({
        offsetNm,
        laneIndex: lanes.length,
        laneGroup: group,
        direction: forward ? 'forward' : 'reverse',
        waypoints: ordered,
      })
    })
    pieces.push({
      startAt,
      offsets: [...plan.offsets],
      routeSequence: built.routeSequence,
      distanceNm: hasFerry ? plan.totalNm : plan.alongRouteNm,
      ferryInNm: hasFerry ? plan.ferryInNm : 0,
      alongRouteNm: plan.alongRouteNm,
      ferryOutNm: hasFerry ? plan.ferryOutNm : 0,
      ferryInLabel: plan.ferryInLabel,
      ferryOutLabel: plan.ferryOutLabel,
      fromPt: plan.waypointFrom,
      toPt: plan.waypointTo,
    })
  }

  const distanceNm =
    pieces.length === 1
      ? pieces[0].distanceNm
      : Math.round(pieces.reduce((sum, piece) => sum + piece.distanceNm, 0) * 10) / 10

  return {
    side,
    pieces,
    lanes,
    offsetsNm: pieces.length === 1 ? [...pieces[0].offsets] : lanes.map((lane) => lane.offsetNm),
    routeSequence,
    distanceNm,
    startAt: pieces[0]?.startAt ?? null,
    note: null,
  }
}
