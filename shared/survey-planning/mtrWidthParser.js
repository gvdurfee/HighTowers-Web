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

/**
 * Resolve half-width NM for one side on a directed leg between two point ids.
 * @param {MtrWidthSpan[]} spans
 * @param {string} fromPt
 * @param {string} toPt
 * @param {'left' | 'right'} side
 * @returns {number | null}
 */
export function halfWidthNmForLeg(spans, fromPt, toPt, side) {
  const from = fromPt.trim().toUpperCase()
  const to = toPt.trim().toUpperCase()
  for (const span of spans) {
    if (span.fromPt === '*' && span.toPt === '*') {
      return side === 'left' ? span.leftNm : span.rightNm
    }
    const sf = span.fromPt.toUpperCase()
    const st = span.toPt.toUpperCase()
    if (sf === from && st === to) {
      return side === 'left' ? span.leftNm : span.rightNm
    }
    if (sf === to && st === from) {
      return side === 'left' ? span.leftNm : span.rightNm
    }
  }
  return null
}
