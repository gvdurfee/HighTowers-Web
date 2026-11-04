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

const POINT_RE = '[A-Z][A-Z0-9]*'

/**
 * Normalize WIDTH_TEXT for parsing (uppercase, collapse whitespace, strip trailing semicolons).
 * Inserts a missing space before NM and treats OF COURSE as OF CENTERLINE.
 * @param {string} text
 */
export function normalizeWidthText(text) {
  return String(text ?? '')
    .replace(/;+/g, ' ')
    .replace(/(\d(?:\.\d+)?)(?=NM\b)/gi, '$1 ')
    .replace(/(\d+(?:\.\d+)?)(?!\s*NM)\s+(LEFT|RIGHT)\b/gi, '$1 NM $2')
    .replace(/\bOF\s+COURSE\b/gi, 'OF CENTERLINE')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const WIDTH_HEAD_RE = new RegExp(
  '^(?:' +
    '(\\d+(?:\\.\\d+)?)\\s+NM\\s+LEFT\\s+AND\\s+(\\d+(?:\\.\\d+)?)\\s+NM\\s+RIGHT' +
    '|' +
    '(\\d+(?:\\.\\d+)?)\\s+NM\\s+RIGHT\\s+AND\\s+(\\d+(?:\\.\\d+)?)\\s+NM\\s+LEFT' +
    '|' +
    '(\\d+(?:\\.\\d+)?)\\s+NM\\s+(?:EITHER|EACH)\\s+SIDE' +
    ')' +
    '(?:\\s+SIDE)?' +
    '(?:\\s+(?:OF\\s+)?(?:CENTERLINE|COURSE))?' +
    '\\s*([\\s\\S]*)$'
)

/** Coordinate corridors stay with the pilot. They are not turned into NM spans. */
export function isCoordinateWidthText(text) {
  const value = String(text ?? '').toUpperCase()
  return /COORDINATE/.test(value) || /\bSTARTING\s+AT\s+N\d/.test(value) || /\bN\d{2}-\d/.test(value)
}

/**
 * Join NASR width rows that were split mid-sentence, then split on ";" and on each new width.
 * A "." starts a new clause when the next sentence begins with a width, or with an alternate
 * or re-entry label that itself contains a width. "ENTRY M. ALTERNATE EXIT AO" stays together.
 * Already-complete clauses are left as separate entries.
 * @param {string[]} widthTexts
 * @returns {string[]}
 */
export function assembleWidthClauses(widthTexts) {
  const parts = (widthTexts ?? []).map((line) => String(line ?? '').trim()).filter(Boolean)
  if (parts.length === 0) return []
  const anySemicolon = parts.some((part) => part.includes(';'))
  const allParseAlone = parts.every((part) => parseWidthTextLine(part) != null)
  const clauses = !anySemicolon && allParseAlone
    ? parts
    : parts
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(';')
        .map((clause) => clause.trim())
        .filter(Boolean)
  return clauses.flatMap((clause) => expandWidthClause(clause))
}

function expandWidthClause(clause) {
  const text = normalizeWidthText(clause)
  if (!text) return []
  const coord = text.match(/\b(?:WIDTH DEFINED BY COORDINATES|STARTING AT\s+N\d)/)
  if (coord && coord.index > 0) {
    const lead = text
      .slice(0, coord.index)
      .trim()
      .replace(/[\s.:;-]+$/, '')
      .replace(/\s+(?:IR|VR|SR)-?\d+[A-Z]*$/i, '')
    const tail = text.slice(coord.index).trim()
    return [...(lead ? expandWidthClause(lead) : []), tail]
  }
  if (isCoordinateWidthText(text)) return [text]
  return text
    .split(
      /\.\s+(?=\d+(?:\.\d+)?\s+NM\b|(?:ALTERNATE|RE-ENTRY)\b(?=[\s\S]*?\d+(?:\.\d+)?\s+NM\b))/
    )
    .flatMap((sentence) => splitWidthPhrases(sentence))
    .map((sentence) => sentence.trim().replace(/,\s*$/, '').replace(/\s+/g, ' '))
    .filter(Boolean)
}

/** Split before each new "<n> NM" width, leaving "N NM LEFT AND M NM RIGHT" intact. */
function splitWidthPhrases(clause) {
  const text = normalizeWidthText(clause)
  if (!text || isCoordinateWidthText(text)) return [text]
  const re = /\d+(?:\.\d+)?\s+NM\b/g
  /** @type {number[]} */
  const starts = []
  let match
  while ((match = re.exec(text))) {
    const before = text.slice(0, match.index)
    if (/\bAND\s+$/.test(before)) continue
    if (
      /\b(?:TAPERING|WIDENING|INCREASING|DECREASING|EXPANDING|NARROWING)(?:\s+(?:TO|OUT|DOWN|UP))?\s+$/.test(
        before
      )
    ) {
      continue
    }
    if (parenDepth(text, match.index) > 0) continue
    starts.push(match.index)
  }
  if (starts.length <= 1) return [text]
  /** @type {string[]} */
  const parts = []
  for (let i = 0; i < starts.length; i++) {
    const start = i === 0 ? 0 : starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : text.length
    parts.push(text.slice(start, end).trim())
  }
  return parts.filter(Boolean)
}

function parenDepth(text, index) {
  let depth = 0
  for (let i = 0; i < index; i++) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') depth = Math.max(0, depth - 1)
  }
  return depth
}

/**
 * @param {string} rest
 * @returns {{ alternatePoints: string[] } | { allAlternates: true } | null}
 */
function parseAlternateRemainder(rest) {
  const text = rest.replace(/\.$/, '').trim()
  if (
    /^(?:FOR\s+ALL\s+ALTERNATE\s+ENTRIES\s+AND\s+EXITS|ON\s+ALL\s+ALTERNATE\s+ENTRY\/EXITS)$/.test(
      text
    )
  ) {
    return { allAlternates: true }
  }
  const entryAndExits = text.match(
    new RegExp(`^FOR\\s+ALTERNATE\\s+ENTRY\\s+(${POINT_RE})\\s+AND\\s+EXITS\\s+(.+)$`)
  )
  if (entryAndExits) {
    const listed = entryAndExits[2]
      .split(/,|\bAND\b/)
      .map((item) => item.trim())
      .filter((item) => new RegExp(`^${POINT_RE}$`).test(item))
    const leftovers = listed.length
      ? entryAndExits[2].replace(/,|\bAND\b|[A-Z0-9]+/g, '').trim()
      : entryAndExits[2]
    if (listed.length > 0 && leftovers === '') {
      return { alternatePoints: [entryAndExits[1], ...listed] }
    }
  }
  const entryDotExit = text.match(
    new RegExp(
      `^FOR\\s+ALTERNATE\\s+ENTRY\\s+(${POINT_RE})\\.?\\s+ALTERNATE\\s+EXIT\\s+(${POINT_RE})$`
    )
  )
  if (entryDotExit) return { alternatePoints: [entryDotExit[1], entryDotExit[2]] }
  const onePoint = text.match(
    new RegExp(`^FOR\\s+ALTERNATE\\s+(?:EXIT|ENTRY)\\s+(${POINT_RE})$`)
  )
  if (onePoint) return { alternatePoints: [onePoint[1]] }
  const entryAndExit = text.match(
    new RegExp(
      `^FOR\\s+ALTERNATE\\s+ENTRY\\s+(${POINT_RE})\\s+AND\\s+EXIT\\s+(${POINT_RE})$`
    )
  )
  if (entryAndExit) return { alternatePoints: [entryAndExit[1], entryAndExit[2]] }
  return null
}

function stripLeadLabel(text) {
  return text
    .replace(
      /^(?:RE-ENTRY|ALTERNATE\s+(?:ENTRY|EXIT|ROUTE))(?:\s*:)?(?:\s+[A-Z][A-Z0-9]*\s*:)?\s*/,
      ''
    )
    .replace(/^[-\s]+/, '')
    .trim()
}

/**
 * Parenthetical and trailing exclusions are reported, not applied as a width.
 * @param {string} text
 * @returns {{ text: string, notes: string[] }}
 */
function peelExclusions(text) {
  /** @type {string[]} */
  const notes = []
  let next = text.replace(/\(([^)]*)\)/g, (full, inner) => {
    if (/EXCLUD|EXCEPT|UNTIL ENTERING|RESTRICTED|\bR-\d/.test(inner)) {
      notes.push(full.trim())
      return ' '
    }
    return full
  })
  const trail = next.match(/\s*,?\s*\b(?:EXCLUDING|EXCEPT(?:\s+FOR)?)\b[\s\S]*$/)
  if (trail && !/\d+(?:\.\d+)?\s+NM\b/.test(trail[0])) {
    notes.push(trail[0].trim())
    next = next.slice(0, trail.index)
  }
  return { text: next.replace(/\s+/g, ' ').trim(), notes }
}

/**
 * @param {string} rest
 * @returns {Array<[string, string]> | null}
 */
function parsePointPairs(rest) {
  let remain = rest.trim()
  /** @type {Array<[string, string]>} */
  const pairs = []
  const one = new RegExp(
    `^(?:AND\\s+)?(?:FROM\\s+|BETWEEN\\s+)?(?:PTS\\.?\\s+)?(${POINT_RE})\\s+(?:TO|AND)\\s+(?:PTS\\.?\\s+)?(${POINT_RE})\\s*`
  )
  while (remain) {
    const match = remain.match(one)
    if (!match) return null
    if (pairs.length === 0 && match[0].startsWith('AND')) return null
    pairs.push([match[1], match[2]])
    remain = remain.slice(match[0].length).trim()
    if (pairs.length > 8) return null
  }
  return pairs.length ? pairs : null
}

/**
 * @param {string} text
 * @returns {{ spans: MtrWidthSpan[], exclusions: string[] } | null}
 */
function parseWidthClause(text) {
  const raw = String(text ?? '').trim()
  if (!raw || isCoordinateWidthText(raw)) return null
  const normalized = normalizeWidthText(raw).replace(/\.$/, '')
  const labeledAlternate = /^ALTERNATE\s+(?:ENTRY|EXIT|ROUTE)\b/.test(normalized)
  let namedAlternate = ''
  let body = stripLeadLabel(normalized)
  if (!body) return null
  const peeled = peelExclusions(body)
  body = peeled.text.replace(/\.$/, '').trim()
  if (!body) return null
  let head = body.match(WIDTH_HEAD_RE)
  if (!head && labeledAlternate) {
    const pointFirst = body.match(new RegExp(`^(${POINT_RE})\\s+(.+)$`))
    if (pointFirst && pointFirst[2].match(WIDTH_HEAD_RE)) {
      namedAlternate = pointFirst[1]
      body = pointFirst[2]
      head = body.match(WIDTH_HEAD_RE)
    }
  }
  if (!head) return null
  const leftNm = Number(head[1] ?? head[4] ?? head[5])
  const rightNm = Number(head[2] ?? head[3] ?? head[5])
  if (!Number.isFinite(leftNm) || !Number.isFinite(rightNm)) return null
  const rest = (head[6] ?? '').replace(/\.$/, '').trim()
  /** @type {MtrWidthSpan} */
  const base = { leftNm, rightNm, rawText: raw }

  if (/^(?:FOR\s+)?(?:THE\s+)?ENTIRE\s+ROUTE(?:\s+TO\s+INCLUDE\s+EXITS\s+AND\s+ALTERNATE\s+ENTRIES)?$/.test(rest)) {
    return { spans: [{ ...base, fromPt: '*', toPt: '*' }], exclusions: peeled.notes }
  }

  if (!rest) {
    if (namedAlternate) {
      return {
        spans: [{
          ...base,
          fromPt: namedAlternate,
          toPt: namedAlternate,
          alternatePoints: [namedAlternate],
        }],
        exclusions: peeled.notes,
      }
    }
    return {
      spans: [{ ...base, fromPt: '*', toPt: '*', impliedEntire: peeled.notes.length === 0 }],
      exclusions: peeled.notes,
    }
  }

  const toEnd = rest.match(new RegExp(`^FROM\\s+(${POINT_RE})\\s+TO\\s+END\\s+OF\\s+ROUTE$`))
  if (toEnd) {
    return {
      spans: [{ ...base, fromPt: toEnd[1], toPt: 'END', toEnd: true }],
      exclusions: peeled.notes,
    }
  }

  const alternate = parseAlternateRemainder(rest)
  if (alternate) {
    if ('allAlternates' in alternate) {
      return {
        spans: [{ ...base, fromPt: '', toPt: '', allAlternates: true }],
        exclusions: peeled.notes,
      }
    }
    const points = [...new Set(alternate.alternatePoints)]
    return {
      spans: [{ ...base, fromPt: points[0], toPt: points[0], alternatePoints: points }],
      exclusions: peeled.notes,
    }
  }

  const pairs = parsePointPairs(rest)
  if (!pairs) return null
  return {
    spans: pairs.map(([fromPt, toPt]) => ({ ...base, fromPt, toPt })),
    exclusions: peeled.notes,
  }
}

/**
 * Parse one width clause into zero or one span.
 * @param {string} text
 * @returns {MtrWidthSpan | null}
 */
export function parseWidthTextLine(text) {
  const parsed = parseWidthClause(text)
  return parsed?.spans[0] ?? null
}

/**
 * Read FAA width text into spans, clauses that did not parse, and exclusion notes.
 * A bare "N NM EITHER SIDE OF CENTERLINE" applies to the whole route only when it is
 * the only primary clause. A bare clause beside other primary spans is left unread.
 * @param {string[]} widthTexts
 */
export function readMtrWidth(widthTexts) {
  /** @type {MtrWidthSpan[]} */
  const spans = []
  /** @type {string[]} */
  const unparsed = []
  /** @type {string[]} */
  const exclusions = []
  for (const clause of assembleWidthClauses(widthTexts)) {
    const parsed = parseWidthClause(clause)
    if (!parsed) {
      unparsed.push(clause)
      continue
    }
    spans.push(...parsed.spans)
    exclusions.push(...parsed.exclusions)
  }
  const implied = spans.filter((span) => span.impliedEntire)
  const otherPrimary = spans.filter((span) => !span.impliedEntire && !isAlternateSpan(span))
  if (implied.length > 0 && otherPrimary.length > 0) {
    for (const span of implied) {
      if (span.rawText) unparsed.push(span.rawText)
    }
    return {
      spans: spans.filter((span) => !span.impliedEntire),
      unparsed,
      exclusions,
    }
  }
  return { spans, unparsed, exclusions }
}

/**
 * Parse WIDTH_TEXT rows for a route into spans.
 * Row fragments are joined before clauses are read.
 * @param {string[]} widthTexts
 * @returns {MtrWidthSpan[]}
 */
export function parseWidthTexts(widthTexts) {
  return readMtrWidth(widthTexts).spans
}

function barePointId(pt) {
  return String(pt ?? '')
    .trim()
    .toUpperCase()
    .replace(/\*+$/g, '')
}

function samePoint(a, b) {
  return barePointId(a) === barePointId(b)
}

function indicesOfRoutePt(orderedUpper, pt) {
  const u = barePointId(pt)
  if (!u) return []
  const hits = []
  for (let i = 0; i < orderedUpper.length; i++) {
    if (barePointId(orderedUpper[i]) === u) hits.push(i)
  }
  return hits
}

/**
 * Inclusive index range covering every occurrence of both span endpoints.
 * Order in the clause does not matter, and a repeated point keeps every visit.
 * @returns {{ lo: number, hi: number } | null}
 */
function spanBounds(spanFrom, spanTo, orderedUpper) {
  const fromHits = indicesOfRoutePt(orderedUpper, spanFrom)
  const toHits = indicesOfRoutePt(orderedUpper, spanTo)
  if (fromHits.length === 0 || toHits.length === 0) return null
  const hits = [...fromHits, ...toHits]
  return { lo: Math.min(...hits), hi: Math.max(...hits) }
}

/**
 * True when a one-step leg lies on the route between span endpoints (inclusive).
 * The leg matches whichever way the two points are ordered, including a later
 * visit when one point appears more than once.
 * @param {string} spanFrom
 * @param {string} spanTo
 * @param {string} legFrom
 * @param {string} legTo
 * @param {string[]} orderedUpper - route point ids in survey order (uppercase)
 */
export function legContainedInSpan(spanFrom, spanTo, legFrom, legTo, orderedUpper) {
  const bounds = spanBounds(spanFrom, spanTo, orderedUpper)
  if (!bounds) return false
  const legA = barePointId(legFrom)
  const legB = barePointId(legTo)
  for (let i = 0; i < orderedUpper.length - 1; i++) {
    const here = barePointId(orderedUpper[i])
    const next = barePointId(orderedUpper[i + 1])
    const isLeg =
      (here === legA && next === legB) || (here === legB && next === legA)
    if (!isLeg) continue
    if (i >= bounds.lo && i + 1 <= bounds.hi) return true
  }
  return false
}

function spanRouteSize(span, orderedUpper) {
  if (span.fromPt === '*' && span.toPt === '*') return orderedUpper.length
  const bounds = spanBounds(span.fromPt, span.toPt, orderedUpper)
  if (!bounds) return Infinity
  return bounds.hi - bounds.lo
}

function isAlternateSpan(span) {
  return Boolean(span.allAlternates || span.alternatePoints?.length)
}

function effectiveToPt(span, orderedUpper) {
  if (span.toEnd && orderedUpper?.length) return orderedUpper[orderedUpper.length - 1]
  return String(span.toPt ?? '').toUpperCase()
}

function pointLiesOnNamedSpan(pt, spans, orderedUpper) {
  const hits = indicesOfRoutePt(orderedUpper, pt)
  if (hits.length === 0) return false
  for (const span of spans) {
    if (isAlternateSpan(span)) continue
    if (span.fromPt === '*' && span.toPt === '*') return true
    const bounds = spanBounds(span.fromPt, effectiveToPt(span, orderedUpper), orderedUpper)
    if (!bounds) continue
    if (hits.some((index) => index >= bounds.lo && index <= bounds.hi)) return true
  }
  return false
}

/**
 * Resolve half-width NM for one side on a directed leg between two point ids.
 * When `orderedRoutePtIdents` is provided, NASR spans such as B→M1 apply to every
 * consecutive leg along that segment (B→C, C→D, …, F→M1).
 * Alternate-exit clauses apply only when that point is an endpoint of the leg.
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
  const named = spans.filter((span) => !isAlternateSpan(span))

  for (const span of named) {
    if (span.toEnd) continue
    if (span.fromPt === '*' && span.toPt === '*') {
      if (!orderedRoutePtIdents?.length) return pick(span)
      continue
    }
    const sf = barePointId(span.fromPt)
    const st = barePointId(span.toPt)
    if ((sf === barePointId(from) && st === barePointId(to)) || (sf === barePointId(to) && st === barePointId(from))) {
      return pick(span)
    }
  }

  const orderedUpper = orderedRoutePtIdents?.map((p) => p.trim().toUpperCase())
  if (orderedUpper?.length) {
    let best = null
    let bestSize = Infinity
    for (const span of named) {
      if (span.fromPt === '*' && span.toPt === '*') {
        const size = spanRouteSize(span, orderedUpper)
        if (size < bestSize) {
          best = span
          bestSize = size
        }
        continue
      }
      const toPtName = effectiveToPt(span, orderedUpper)
      const fromPtName = barePointId(span.fromPt)
      if (
        (fromPtName === barePointId(from) && barePointId(toPtName) === barePointId(to)) ||
        (fromPtName === barePointId(to) && barePointId(toPtName) === barePointId(from))
      ) {
        const size = spanRouteSize({ ...span, toPt: toPtName }, orderedUpper)
        if (size < bestSize) {
          best = span
          bestSize = size
        }
        continue
      }
      if (legContainedInSpan(span.fromPt, toPtName, from, to, orderedUpper)) {
        const size = spanRouteSize({ ...span, toPt: toPtName }, orderedUpper)
        if (size < bestSize) {
          best = span
          bestSize = size
        }
      }
    }
    if (best) return pick(best)
  }

  for (const span of spans) {
    if (!span.alternatePoints?.length) continue
    const points = span.alternatePoints.map((point) => point.toUpperCase())
    if (
      orderedUpper?.length &&
      !points.some((point) => orderedUpper.some((routePt) => samePoint(routePt, point)))
    ) {
      continue
    }
    if (points.some((point) => samePoint(point, from) || samePoint(point, to))) return pick(span)
  }

  if (orderedUpper?.length) {
    const fallback = spans.find((span) => span.allAlternates)
    const fromOnRoute = pointLiesOnNamedSpan(from, named, orderedUpper)
    const toOnRoute = pointLiesOnNamedSpan(to, named, orderedUpper)
    if (fallback && (!fromOnRoute || !toOnRoute)) return pick(fallback)
  }

  return null
}
