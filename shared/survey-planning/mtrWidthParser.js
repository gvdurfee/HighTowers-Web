/**
 * Parse FAA NASR MTR_WDTH.csv WIDTH_TEXT into structured left/right NM spans.
 * See docs/COORDINATOR_SURVEY_CONSOLE.md.
 */

/**
 * @typedef {object} MtrWidthSpan
 * @property {string} fromPt - Route point id (e.g. "A")
 * @property {string} toPt - Route point id (e.g. "B", "M1")
 * @property {number} leftNm - NM left of centerline
 * @property {number} rightNm - NM right of centerline
 * @property {string} [rawText]
 */

const ENTIRE_ROUTE_RE = /\b(?:FOR\s+)?(?:THE\s+)?ENTIRE\s+ROUTE\b/i

/**
 * Normalize WIDTH_TEXT for parsing (uppercase, collapse whitespace, strip trailing semicolons).
 * @param {string} text
 */
export function normalizeWidthText(text) {
  return String(text ?? '')
    .replace(/;+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/**
 * Parse one WIDTH_TEXT line into zero or one span.
 * @param {string} text
 * @returns {MtrWidthSpan | null}
 */
export function parseWidthTextLine(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const t = normalizeWidthText(raw)

  // "10 NM LEFT AND 20 NM RIGHT OF CENTERLINE FROM B TO M1"
  const asymmetric = t.match(
    /(\d+(?:\.\d+)?)\s*NM\s+LEFT\s+AND\s+(\d+(?:\.\d+)?)\s*NM\s+RIGHT\s+OF\s+CENTERLINE\s+FROM\s+([A-Z0-9]+)\s+TO\s+([A-Z0-9]+)/
  )
  if (asymmetric) {
    return {
      fromPt: asymmetric[3],
      toPt: asymmetric[4],
      leftNm: Number(asymmetric[1]),
      rightNm: Number(asymmetric[2]),
      rawText: raw,
    }
  }

  // "20 NM EITHER SIDE OF CENTERLINE FROM A TO B" (optional trailing clause after ; already stripped)
  const eitherFromTo = t.match(
    /(\d+(?:\.\d+)?)\s*NM\s+EITHER\s+SIDE\s+OF\s+CENTERLINE\s+FROM\s+([A-Z0-9]+)\s+TO\s+([A-Z0-9]+)/
  )
  if (eitherFromTo) {
    const nm = Number(eitherFromTo[1])
    return {
      fromPt: eitherFromTo[2],
      toPt: eitherFromTo[3],
      leftNm: nm,
      rightNm: nm,
      rawText: raw,
    }
  }

  // "5 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE"
  const eitherEntire = t.match(/(\d+(?:\.\d+)?)\s*NM\s+EITHER\s+SIDE\s+OF\s+CENTERLINE/)
  if (eitherEntire && ENTIRE_ROUTE_RE.test(t)) {
    const nm = Number(eitherEntire[1])
    return {
      fromPt: '*',
      toPt: '*',
      leftNm: nm,
      rightNm: nm,
      rawText: raw,
    }
  }

  return null
}

/**
 * Parse all WIDTH_TEXT rows for a route into spans (caller filters by route).
 * Later spans override overlapping letter ranges when merged in the planner.
 * @param {string[]} widthTexts
 * @returns {MtrWidthSpan[]}
 */
export function parseWidthTexts(widthTexts) {
  const spans = []
  for (const line of widthTexts) {
    const span = parseWidthTextLine(line)
    if (span) spans.push(span)
  }
  return spans
}

function indexOfRoutePt(orderedUpper, pt) {
  const u = pt.trim().toUpperCase()
  return orderedUpper.findIndex((p) => p === u)
}

/**
 * True when a one-step leg lies on the route between span endpoints (inclusive).
 * @param {string} spanFrom
 * @param {string} spanTo
 * @param {string} legFrom
 * @param {string} legTo
 * @param {string[]} orderedUpper - route point ids in survey order (uppercase)
 */
export function legContainedInSpan(spanFrom, spanTo, legFrom, legTo, orderedUpper) {
  const sf = indexOfRoutePt(orderedUpper, spanFrom)
  const st = indexOfRoutePt(orderedUpper, spanTo)
  const lf = indexOfRoutePt(orderedUpper, legFrom)
  const lt = indexOfRoutePt(orderedUpper, legTo)
  if (sf < 0 || st < 0 || lf < 0 || lt < 0) return false
  if (Math.abs(lf - lt) !== 1) return false
  const spanLo = Math.min(sf, st)
  const spanHi = Math.max(sf, st)
  const legLo = Math.min(lf, lt)
  const legHi = Math.max(lf, lt)
  return legLo >= spanLo && legHi <= spanHi
}

function spanRouteSize(span, orderedUpper) {
  if (span.fromPt === '*' && span.toPt === '*') return orderedUpper.length
  const sf = indexOfRoutePt(orderedUpper, span.fromPt)
  const st = indexOfRoutePt(orderedUpper, span.toPt)
  if (sf < 0 || st < 0) return Infinity
  return Math.abs(st - sf)
}

/**
 * Resolve half-width NM for one side on a directed leg between two point ids.
 * When `orderedRoutePtIdents` is provided, NASR spans such as B→M1 apply to every
 * consecutive leg along that segment (B→C, C→D, …, F→M1).
 * @param {MtrWidthSpan[]} spans
 * @param {string} fromPt
 * @param {string} toPt
 * @param {'left' | 'right'} side
 * @param {string[]} [orderedRoutePtIdents] - survey waypoint order
 * @returns {number | null}
 */
export function halfWidthNmForLeg(spans, fromPt, toPt, side, orderedRoutePtIdents) {
  const from = fromPt.trim().toUpperCase()
  const to = toPt.trim().toUpperCase()
  const pick = (span) => (side === 'left' ? span.leftNm : span.rightNm)

  for (const span of spans) {
    if (span.fromPt === '*' && span.toPt === '*') {
      return pick(span)
    }
    const sf = span.fromPt.toUpperCase()
    const st = span.toPt.toUpperCase()
    if ((sf === from && st === to) || (sf === to && st === from)) {
      return pick(span)
    }
  }

  const orderedUpper = orderedRoutePtIdents?.map((p) => p.trim().toUpperCase())
  if (!orderedUpper?.length) return null

  let best = null
  let bestSize = Infinity
  for (const span of spans) {
    if (span.fromPt === '*' && span.toPt === '*') {
      const size = spanRouteSize(span, orderedUpper)
      if (size < bestSize) {
        best = span
        bestSize = size
      }
      continue
    }
    if (legContainedInSpan(span.fromPt, span.toPt, from, to, orderedUpper)) {
      const size = spanRouteSize(span, orderedUpper)
      if (size < bestSize) {
        best = span
        bestSize = size
      }
    }
  }
  return best ? pick(best) : null
}
