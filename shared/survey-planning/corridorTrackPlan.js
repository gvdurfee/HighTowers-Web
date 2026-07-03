/**
 * Coordinator corridor track plan: NASR width spans with editable parallel-track offsets.
 */

import { parseWidthTexts, legContainedInSpan } from './mtrWidthParser.js'
import {
  parallelOffsetsForHalfWidth,
  DEFAULT_PARALLEL_TRACK_POLICY,
} from './surveyGeometry.js'

/**
 * @typedef {object} SpanTrackPlanEntry
 * @property {string} fromPt
 * @property {string} toPt
 * @property {number} leftNm
 * @property {number} rightNm
 * @property {number[]} leftOffsets
 * @property {number[]} rightOffsets
 * @property {string} [rawText]
 */

function indexOfRoutePt(orderedUpper, pt) {
  const u = pt.trim().toUpperCase()
  return orderedUpper.findIndex((p) => p === u)
}

function spanRouteSize(entry, orderedUpper) {
  if (entry.fromPt === '*' && entry.toPt === '*') return orderedUpper.length
  const sf = indexOfRoutePt(orderedUpper, entry.fromPt)
  const st = indexOfRoutePt(orderedUpper, entry.toPt)
  if (sf < 0 || st < 0) return Infinity
  return Math.abs(st - sf)
}

/**
 * @param {SpanTrackPlanEntry[]} spanTrackPlan
 * @param {string} fromPt
 * @param {string} toPt
 * @param {string[]} [orderedRoutePtIdents]
 * @returns {SpanTrackPlanEntry | null}
 */
export function findSpanTrackEntryForLeg(spanTrackPlan, fromPt, toPt, orderedRoutePtIdents) {
  if (!spanTrackPlan?.length) return null
  const from = fromPt.trim().toUpperCase()
  const to = toPt.trim().toUpperCase()

  for (const entry of spanTrackPlan) {
    if (entry.fromPt === '*' && entry.toPt === '*') return entry
    const sf = entry.fromPt.toUpperCase()
    const st = entry.toPt.toUpperCase()
    if ((sf === from && st === to) || (sf === to && st === from)) return entry
  }

  const orderedUpper = orderedRoutePtIdents?.map((p) => p.trim().toUpperCase())
  if (!orderedUpper?.length) return null

  let best = null
  let bestSize = Infinity
  for (const entry of spanTrackPlan) {
    if (entry.fromPt === '*' && entry.toPt === '*') {
      const size = spanRouteSize(entry, orderedUpper)
      if (size < bestSize) {
        best = entry
        bestSize = size
      }
      continue
    }
    if (legContainedInSpan(entry.fromPt, entry.toPt, from, to, orderedUpper)) {
      const size = spanRouteSize(entry, orderedUpper)
      if (size < bestSize) {
        best = entry
        bestSize = size
      }
    }
  }
  return best
}

/**
 * @param {string} raw
 * @returns {number[]}
 */
export function parseOffsetsListInput(raw) {
  const parts = String(raw ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    throw new Error('Enter at least one offset in NM.')
  }
  const offsets = parts.map((p) => {
    const n = Number(p)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid offset: ${p}`)
    return n
  })
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] <= offsets[i - 1]) {
      throw new Error('Offsets must increase from inner to outer track.')
    }
  }
  return offsets
}

/**
 * @param {number[]} offsets
 * @returns {string}
 */
export function formatOffsetsList(offsets) {
  if (!offsets?.length) return ''
  return offsets.join(', ')
}

/**
 * Build default span track rows from NASR WIDTH_TEXT lines.
 * @param {string[]} widthTexts
 * @param {Partial<import('./surveyGeometry.js').ParallelTrackPolicy>} [policy]
 * @returns {SpanTrackPlanEntry[]}
 */
export function defaultSpanTrackPlanFromWidthTexts(widthTexts, policy = {}) {
  const p = { ...DEFAULT_PARALLEL_TRACK_POLICY, ...policy }
  const spans = parseWidthTexts(widthTexts ?? [])
  return spans.map((span) => ({
    fromPt: span.fromPt,
    toPt: span.toPt,
    leftNm: span.leftNm,
    rightNm: span.rightNm,
    leftOffsets: parallelOffsetsForHalfWidth(span.leftNm, p),
    rightOffsets: parallelOffsetsForHalfWidth(span.rightNm, p),
    rawText: span.rawText,
  }))
}

/**
 * @param {SpanTrackPlanEntry[]} plan
 * @returns {string | null} first validation error, or null if valid
 */
export function validateSpanTrackPlan(plan) {
  if (!plan?.length) return 'No corridor width spans loaded.'
  for (const entry of plan) {
    const label =
      entry.fromPt === '*' && entry.toPt === '*'
        ? 'entire route'
        : `${entry.fromPt}→${entry.toPt}`
    if (!Number.isFinite(entry.leftNm) || entry.leftNm <= 0) {
      return `Inner half-width must be positive for ${label}.`
    }
    if (!Number.isFinite(entry.rightNm) || entry.rightNm <= 0) {
      return `Outer half-width must be positive for ${label}.`
    }
    try {
      if (!entry.leftOffsets?.length) {
        return `Inner offsets required for ${label}.`
      }
      if (!entry.rightOffsets?.length) {
        return `Outer offsets required for ${label}.`
      }
      parseOffsetsListInput(formatOffsetsList(entry.leftOffsets))
      parseOffsetsListInput(formatOffsetsList(entry.rightOffsets))
    } catch (err) {
      return err instanceof Error ? err.message : `Invalid offsets for ${label}.`
    }
  }
  return null
}
