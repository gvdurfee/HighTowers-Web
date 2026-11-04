#!/usr/bin/env node
/**
 * Read-only coverage of the current MTR width reader for IR/VR routes
 * that touch Albuquerque Center and its neighbors.
 *
 * Usage: node scripts/mtr-width-coverage.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { assembleWidthClauses, halfWidthNmForLeg, parseWidthTextLine } from '../shared/survey-planning/mtrWidthParser.js'
import { resolvePublishedLegWidths } from '../shared/survey-planning/offsetRoutePlan.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, 'server', '.mtr-cache')
const cycle = '2026-10-01'
const ptPath = path.join(cacheDir, `${cycle}_MTR_PT.csv`)
const widthPath = path.join(cacheDir, `${cycle}_MTR_WDTH.csv`)
const CENTERS = ['ZAB', 'ZDV', 'ZLA', 'ZFW', 'ZHU', 'ZKC']
const CENTER_SET = new Set(CENTERS)

const CAUSE_NOTE = {
  'Not covered by FAA text':
    'The readable clauses never name these legs. The pilot enters the width. Nothing is guessed.',
  'FAA text not readable':
    'A clause is still in a form the reader does not accept (taper, cardinal sides, a missing number, or wording outside an NM span). The other legs keep their published widths.',
  'Coordinate width':
    'The FAA published the corridor as coordinates. Those legs stay blank for the pilot. The reader does not turn coordinates into a width.',
  'Mixed: some legs not covered, some FAA text not readable':
    'Some blank legs are outside every readable span. Others sit under a clause the reader could not read.',
}

const ptRows = parse(readFileSync(ptPath, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
})
const widthRows = parse(readFileSync(widthPath, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
})

/** @type {Map<string, object[]>} */
const pointsByRoute = new Map()
for (const row of ptRows) {
  const type = clean(row.ROUTE_TYPE_CODE)
  if (type !== 'IR' && type !== 'VR') continue
  const id = clean(row.ROUTE_ID)
  const key = `${type}|${id}`
  const list = pointsByRoute.get(key) ?? []
  list.push({
    seq: Number(clean(row.ROUTE_PT_SEQ)) || 0,
    ptIdent: clean(row.ROUTE_PT_ID),
    next: clean(row.NEXT_ROUTE_PT_ID),
    artcc: clean(row.ARTCC),
    segment: clean(row.SEGMENT_TEXT),
    eff: clean(row.EFF_DATE),
  })
  pointsByRoute.set(key, list)
}

/** @type {Map<string, object[]>} */
const widthsByRoute = new Map()
for (const row of widthRows) {
  const type = clean(row.ROUTE_TYPE_CODE)
  if (type !== 'IR' && type !== 'VR') continue
  const id = clean(row.ROUTE_ID)
  const key = `${type}|${id}`
  const list = widthsByRoute.get(key) ?? []
  list.push({
    artcc: clean(row.ARTCC),
    seq: Number(clean(row.WIDTH_SEQ_NO)) || 0,
    text: clean(row.WIDTH_TEXT),
    eff: clean(row.EFF_DATE),
  })
  widthsByRoute.set(key, list)
}

const effDates = new Set()
const reports = []
for (const [key, points] of pointsByRoute) {
  const centers = new Set()
  for (const point of points) {
    if (point.eff) effDates.add(point.eff)
    for (const token of point.artcc.split(/\s+/)) {
      if (token) centers.add(token)
    }
  }
  const touched = CENTERS.filter((center) => centers.has(center))
  if (touched.length === 0) continue
  const [type, id] = key.split('|')
  const ordered = primarySequence(points)
  const widthGroups = widthsByRoute.get(key) ?? []
  for (const row of widthGroups) {
    if (row.eff) effDates.add(row.eff)
    for (const token of row.artcc.split(/\s+/)) {
      if (token) centers.add(token)
    }
  }
  const rawTexts = rawWidthTexts(widthGroups)
  const clauses = assembleWidthClauses(rawTexts)
  const resolved = resolvePublishedLegWidths(
    ordered.map((ptIdent) => ({ ptIdent })),
    rawTexts
  )
  const status = resolved.status === 'published' || ordered.length < 2 ? 'FULL' : 'NEEDS PILOT ENTRY'
  const blankLegs = blankLegLabels(resolved)
  const spans = readableSpans(rawTexts)
  const alternates = alternatesWithoutWidth(points, ordered, spans)
  const lopsided = lopsidedLegs(resolved)
  reports.push({
    type,
    id,
    route: `${type}-${id}`,
    centers: centerList(centers),
    touched,
    status,
    blankLegs,
    pilotDetail: pilotDetail(resolved),
    unparsed: resolved.unparsed ?? [],
    alternates,
    lopsided,
    clauses,
    cause: { group: pilotGroup(resolved) },
    pointCount: ordered.length,
    legCount: Math.max(0, ordered.length - 1),
  })
}

reports.sort((a, b) => {
  if (a.type !== b.type) return a.type === 'IR' ? -1 : 1
  return routeNumber(a.id) - routeNumber(b.id) || a.id.localeCompare(b.id)
})

const mdPath = path.join(root, 'docs', 'WIDTH_COVERAGE_REPORT.md')
const csvPath = path.join(root, 'docs', 'WIDTH_COVERAGE_REPORT.csv')
writeFileSync(mdPath, renderMarkdown(reports, [...effDates]))
writeFileSync(csvPath, renderCsv(reports))

const counts = { FULL: 0, 'NEEDS PILOT ENTRY': 0 }
for (const report of reports) counts[report.status] += 1
console.log(
  `cycle ${cycle}  routes ${reports.length}  FULL ${counts.FULL ?? 0}  NEEDS PILOT ENTRY ${counts['NEEDS PILOT ENTRY'] ?? 0}`
)
console.log(mdPath)
console.log(csvPath)

function clean(value) {
  return String(value ?? '')
    .replace(/"/g, '')
    .trim()
}

function routeNumber(id) {
  const match = id.match(/^(\d+)/)
  return match ? Number(match[1]) : 0
}

function centerList(centers) {
  const rest = [...centers].filter((center) => !CENTER_SET.has(center)).sort()
  return [...CENTERS.filter((center) => centers.has(center)), ...rest]
}

/** Every selected route is one NEXT chain. */
function primarySequence(points) {
  const succ = new Map()
  const hasPred = new Set()
  for (const point of points) {
    succ.set(point.ptIdent, point.next || null)
    if (point.next) hasPred.add(point.next)
  }
  const starts = [...succ.keys()].filter((pt) => !hasPred.has(pt))
  const start =
    starts.sort((a, b) => {
      const sa = points.find((point) => point.ptIdent === a)?.seq ?? 0
      const sb = points.find((point) => point.ptIdent === b)?.seq ?? 0
      return sa - sb || a.localeCompare(b)
    })[0] ?? points.slice().sort((a, b) => a.seq - b.seq)[0]?.ptIdent
  const ordered = []
  const seen = new Set()
  let cur = start
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    ordered.push(cur)
    cur = succ.get(cur) || null
  }
  return ordered
}

/** Raw WIDTH_TEXT rows in FAA order. The reader joins these once. */
function rawWidthTexts(rows) {
  return rows
    .filter((row) => row.text)
    .sort((a, b) => a.seq - b.seq || a.artcc.localeCompare(b.artcc))
    .map((row) => row.text)
}

function pilotDetail(resolved) {
  if (!resolved.missing?.length) return '—'
  const total = resolved.legs.length
  const unread = resolved.missing.filter((leg) => leg.reason === 'unreadable')
  const uncovered = resolved.missing.filter((leg) => leg.reason !== 'unreadable')
  const parts = [`${resolved.missing.length} of ${total} legs`]
  if (uncovered.length) {
    parts.push(
      `${uncovered.length} not covered by FAA text (${uncovered
        .map((leg) => `${leg.fromPt}–${leg.toPt}`)
        .join(', ')})`
    )
  }
  if (unread.length) {
    const clauses = [...new Set(unread.map((leg) => leg.clause).filter(Boolean))]
    const shown = clauses.map((clause) => (clause.length > 220 ? `${clause.slice(0, 217)}…` : clause))
    parts.push(
      `${unread.length} FAA text not readable${shown.length ? `: ${shown.join(' | ')}` : ''}`
    )
  }
  return parts.join('; ')
}

function pilotGroup(resolved) {
  if (!resolved.missing?.length) return 'FULL'
  const unread = resolved.missing.some((leg) => leg.reason === 'unreadable')
  const uncovered = resolved.missing.some((leg) => leg.reason !== 'unreadable')
  if (unread && uncovered) return 'Mixed: some legs not covered, some FAA text not readable'
  if (uncovered) return 'Not covered by FAA text'
  const coordinate = (resolved.unparsed ?? []).some((clause) =>
    /COORDINATE|\bN\d{2}-\d|\bSTARTING\s+AT\s+N\d/.test(clause.toUpperCase())
  )
  if (coordinate) return 'Coordinate width'
  return 'FAA text not readable'
}

function blankLegLabels(resolved) {
  if (!resolved.legs) return []
  return resolved.missing.map((leg) => `${leg.fromPt}–${leg.toPt}`)
}

function lopsidedLegs(resolved) {
  if (!resolved.legs) return []
  return resolved.legs
    .filter((leg) => leg && leg.leftNm !== leg.rightNm)
    .map((leg) => `${leg.fromPt}–${leg.toPt} ${leg.leftNm}/${leg.rightNm}`)
}

function readableSpans(rawTexts) {
  const spans = []
  for (const clause of assembleWidthClauses(rawTexts)) {
    const span = parseWidthTextLine(clause)
    if (span) spans.push(span)
  }
  return spans
}

function alternatesWithoutWidth(points, ordered, spans) {
  /** @type {Map<string, Set<string>>} */
  const byLabel = new Map()
  for (const point of points) {
    for (const alt of alternatesOnSegment(point.ptIdent, point.segment)) {
      const set = byLabel.get(alt.label) ?? new Set()
      set.add(alt.role)
      byLabel.set(alt.label, set)
    }
  }
  const missing = []
  for (const [label, roles] of byLabel) {
    if (alternateHasWidth(label, ordered, spans)) continue
    const role = roleLabel(roles)
    missing.push(role === 'entry/exit' ? `${label} (entry/exit)` : `${label} (${role})`)
  }
  missing.sort((a, b) => a.localeCompare(b))
  return missing
}

function alternateHasWidth(label, ordered, spans) {
  const id = label.toUpperCase()
  if (spans.some((span) => span.alternatePoints?.some((point) => point.toUpperCase() === id))) {
    return true
  }
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i]
    const to = ordered[i + 1]
    if (from.toUpperCase() !== id && to.toUpperCase() !== id) continue
    if (halfWidthNmForLeg(spans, from, to, 'left', ordered) != null) return true
  }
  return false
}

function roleLabel(roles) {
  const hasEntry = roles.has('ENTRY') || roles.has('ENTRY/EXIT')
  const hasExit = roles.has('EXIT') || roles.has('ENTRY/EXIT')
  if (hasEntry && hasExit) return 'entry/exit'
  if (hasEntry) return 'entry'
  return 'exit'
}

function alternatesOnSegment(ptIdent, segment) {
  const raw = segment
    .toUpperCase()
    .replace(/\(\d+\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw.includes('ALTERNATE')) return []
  const parts = raw.split(/(?=ALTERNATE\s+(?:ENTRY\/EXIT|ENTRY|EXIT)\b)/)
  const found = []
  for (const part of parts) {
    const match = part.match(/^ALTERNATE\s+(ENTRY\/EXIT|ENTRY|EXIT)\b\s*(.*)$/)
    if (!match) continue
    found.push({ role: match[1], label: alternateLabel(match[2], ptIdent) })
  }
  return found
}

function alternateLabel(rest, ptIdent) {
  let text = rest.toUpperCase().replace(/\s+/g, ' ').trim()
  if (!text || /^[)\].]/.test(text)) return ptIdent
  text = text.replace(/^(?:POINT|TRACK|ROUTE)\b\s*/, '')
  text = text.replace(/^[:;\s-]+/, '')
  text = text.replace(/^(?:AT|TO\s+POINT|FROM(?:\s+PT)?)\s+/, '')
  text = text.split(
    /\b(?:CLIMB|CONTACT|DIRECT|THENCE|OR\s+AS|AS\s+ASSIGNED|TURN|REMAIN|CROSS|SEE\s+SOP|TO\s+IR|TO\s+R-|EXIT\s+R-|\d+)\b/
  )[0]
  text = text.replace(/[.:;)+]+$/g, '').replace(/\s+ONLY$/g, '').trim()
  if (!text || text === 'POINT') return ptIdent
  const point = text.match(/^[A-Z][A-Z0-9]*\*?(?=\s|$)/)
  if (point && (point[0].length === text.length || /^\s/.test(text.slice(point[0].length)))) {
    const after = text.slice(point[0].length).trim()
    if (!after || /^(?:EXIT|ENTRY|TO|OR|AND)\b/.test(after)) return point[0]
  }
  const place = text.match(/^[A-Z]+(?:\s+[A-Z]+){0,3}/)
  if (!place) return ptIdent
  const skip = new Set(['MSL', 'AGL', 'TO', 'OR', 'THE', 'ONLY', 'VIA', 'THEN'])
  const words = place[0].split(/\s+/).filter((word) => !skip.has(word))
  return words.length ? words.join(' ') : ptIdent
}

function causeFor(status, resolved, clauses, blankLegs) {
  if (status === 'FULL') return null
  if (status === 'MANUAL') {
    const kinds = [...new Set((resolved.unparsed ?? []).map(clauseKind))]
    return {
      group: kinds.length === 1 ? kinds[0] : 'Several unreadable clauses',
      fixable: kinds.every((kind) => kind !== 'Coordinate width'),
      kinds,
    }
  }
  if (clauses.length === 0) {
    return { group: 'No width text in the FAA file', fixable: false, kinds: ['missing-file'] }
  }
  const blob = clauses.join(' \n ').toUpperCase()
  const kinds = new Set()
  for (const label of blankLegs) {
    const [from, to] = label.split('–')
    kinds.add(blankLegKind(from, to, blob))
  }
  if (kinds.size === 1 && kinds.has('not-named')) {
    return { group: 'Points absent from the width text', fixable: false, kinds: [...kinds] }
  }
  if (kinds.size === 1 && kinds.has('asterisk')) {
    return {
      group: 'Point id suffix not matched',
      fixable: true,
      kinds: [...kinds],
    }
  }
  if ([...kinds].every((kind) => kind === 'not-named' || kind === 'asterisk') && kinds.has('asterisk')) {
    return { group: 'Point id suffix not matched', fixable: true, kinds: [...kinds] }
  }
  if (kinds.has('named-unmapped') || kinds.has('asterisk')) {
    return {
      group: kinds.has('not-named')
        ? 'Some named points were not filled'
        : 'Named points were not filled',
      fixable: true,
      kinds: [...kinds],
    }
  }
  return { group: 'Points absent from the width text', fixable: false, kinds: [...kinds] }
}

function clauseKind(text) {
  const value = text.toUpperCase().replace(/\s+/g, ' ').trim()
  if (
    /COORDINATE/.test(value) ||
    /\bN\d{2}[- ]\d/.test(value) ||
    /\bW\d{2,3}[- ]\d/.test(value) ||
    /\d{2}-\d{2}\.\d/.test(value)
  ) {
    return 'Coordinate width'
  }
  if (/^\d+(?:\.\d+)?\s*NM\s+(?:EITHER|EACH)\s+SIDE\s+OF\s+CENTERLINE\.?$/.test(value)) {
    return 'Width with no endpoints'
  }
  const nmCount = value.match(/\d+(?:\.\d+)?\s*NM/g)?.length ?? 0
  if (nmCount >= 2) return 'Several widths in one clause'
  if (/ALTERNATE/.test(value)) return 'Alternate wording the reader does not accept'
  return 'Unusual width wording'
}

function blankLegKind(from, to, blob) {
  const fromStar = from !== barePoint(from)
  const toStar = to !== barePoint(to)
  const fromNamed = namedInText(blob, from)
  const toNamed = namedInText(blob, to)
  if ((fromStar || toStar) && (fromNamed || toNamed)) return 'asterisk'
  if (fromNamed || toNamed) return 'named-unmapped'
  return 'not-named'
}

function barePoint(id) {
  return id.replace(/\*+$/g, '')
}

function namedInText(blob, id) {
  const bare = barePoint(id)
  if (!bare) return false
  return new RegExp(`\\b${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(blob)
}

function renderMarkdown(rows, effs) {
  const counts = countBy(rows, (row) => row.status)
  const lines = []
  lines.push('# MTR width-reader coverage')
  lines.push('')
  lines.push(`FAA cycle file: **${cycle}** (\`server/.mtr-cache/${cycle}_MTR_PT.csv\` and \`${cycle}_MTR_WDTH.csv\`).`)
  lines.push(`EFF_DATE on every row in both files: **${effs.sort().join(', ') || 'unknown'}**.`)
  lines.push('')
  lines.push(
    `Scope: ${rows.length} IR and VR routes whose ARTCC includes ${CENTERS.join(', ')}. The primary sequence is the published \`NEXT_ROUTE_PT_ID\` chain. A starred point id matches the unstarred point. Readable clauses fill their legs. A clause that cannot be read leaves only the uncovered legs for the pilot.`
  )
  lines.push('')
  lines.push(
    'FULL means every primary leg has a left and right width. NEEDS PILOT ENTRY means at least one leg is blank. The blank count is the legs the pilot must enter.'
  )
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| Status | Routes |')
  lines.push('| --- | ---: |')
  lines.push(`| FULL | ${counts.FULL ?? 0} |`)
  lines.push(`| NEEDS PILOT ENTRY | ${counts['NEEDS PILOT ENTRY'] ?? 0} |`)
  lines.push(`| Total | ${rows.length} |`)
  lines.push('')
  lines.push('A route that touches more than one center is counted in each of those centers.')
  lines.push('')
  lines.push('| Center | FULL | NEEDS PILOT ENTRY | Routes |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const center of CENTERS) {
    const subset = rows.filter((row) => row.touched.includes(center))
    const by = countBy(subset, (row) => row.status)
    lines.push(
      `| ${center} | ${by.FULL ?? 0} | ${by['NEEDS PILOT ENTRY'] ?? 0} | ${subset.length} |`
    )
  }
  lines.push('')
  lines.push('## Routes that need pilot entry')
  lines.push('')
  lines.push(...causeSection(rows, 'NEEDS PILOT ENTRY'))
  lines.push('## Lopsided widths')
  lines.push('')
  const lopsided = rows.filter((row) => row.lopsided.length > 0)
  lines.push(
    `${lopsided.length} route${lopsided.length === 1 ? '' : 's'} with a published side wider than the other. These still count as FULL or PARTIAL when the numbers were read.`
  )
  lines.push('')
  if (lopsided.length === 0) {
    lines.push('None.')
  } else {
    for (const row of lopsided) {
      lines.push(`- **${row.route}** (${row.centers.join(', ')}): ${row.lopsided.join('; ')}`)
    }
  }
  lines.push('')
  lines.push('## Routes')
  lines.push('')
  lines.push('| Route | Centers | Status | Legs needing pilot entry | Alternates without width |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const row of rows) {
    lines.push(
      `| ${row.route} | ${row.centers.join(', ')} | ${row.status} | ${cell(detailCell(row))} | ${cell(row.alternates.join('; ') || '—')} |`
    )
  }
  lines.push('')
  return lines.join('\n')
}

function causeSection(rows, status) {
  const subset = rows.filter((row) => row.status === status)
  const lines = []
  lines.push(`### ${status} (${subset.length})`)
  lines.push('')
  if (subset.length === 0) {
    lines.push('None.')
    lines.push('')
    return lines
  }
  /** @type {Map<string, typeof subset>} */
  const groups = new Map()
  for (const row of subset) {
    const name = row.cause?.group ?? 'Other'
    const list = groups.get(name) ?? []
    list.push(row)
    groups.set(name, list)
  }
  for (const [name, list] of groups) {
    lines.push(`#### ${name} (${list.length})`)
    lines.push('')
    lines.push(CAUSE_NOTE[name] ?? 'See the routes below.')
    lines.push('')
    for (const row of list) {
      const detail = row.pilotDetail || '—'
      const alts = row.alternates.length ? ` Alternates without width: ${row.alternates.join('; ')}.` : ''
      const sentence = /[.!”"]$/.test(detail) ? detail : `${detail}.`
      lines.push(`- **${row.route}** (${row.centers.join(', ')}): ${sentence}${alts}`)
    }
    lines.push('')
  }
  return lines
}

function detailCell(row) {
  if (row.status === 'FULL') return '—'
  return row.pilotDetail || '—'
}

function cell(value) {
  return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ')
}

function countBy(rows, keyFn) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const row of rows) {
    const key = keyFn(row)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function renderCsv(rows) {
  const header = [
    'Route',
    'Centers',
    'Status',
    'Legs needing pilot entry',
    'Alternates without width',
  ]
  const lines = [header.map(csvEscape).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.route,
        row.centers.join(' '),
        row.status,
        detailCell(row) === '—' ? '' : detailCell(row),
        row.alternates.join('; '),
      ]
        .map(csvEscape)
        .join(',')
    )
  }
  return lines.join('\n') + '\n'
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}
