#!/usr/bin/env node
/**
 * Generate docs/handouts/Coordinator-Survey-Console-Handout.pdf (no browser required).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pdfPath = path.join(root, 'docs/handouts/Coordinator-Survey-Console-Handout.pdf')

const ULTRAMARINE = rgb(0.055, 0.169, 0.553)
const PIMENTO = rgb(0.859, 0, 0.161)
const BODY = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.35, 0.35, 0.35)

const PAGE_W = 612
const PAGE_H = 792
const MARGIN_L = 54
const MARGIN_R = 54
const MARGIN_T = 54
const MARGIN_B = 54
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

/** @type {import('pdf-lib').PDFPage} */
let page
/** @type {import('pdf-lib').PDFFont} */
let fontRegular
/** @type {import('pdf-lib').PDFFont} */
let fontBold
let y = PAGE_H - MARGIN_T

function newPage(doc) {
  page = doc.addPage([PAGE_W, PAGE_H])
  y = PAGE_H - MARGIN_T
}

function ensureSpace(doc, needed) {
  if (y - needed < MARGIN_B) newPage(doc)
}

function ascii(text) {
  return String(text)
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2019/g, "'")
    .replace(/\u2192/g, '->')
    .replace(/\u2022/g, '-')
}

function drawTextSafe(text, opts) {
  page.drawText(ascii(text), opts)
}

function wrapLines(text, size, maxWidth, bold = false) {
  const f = bold ? fontBold : fontRegular
  const words = ascii(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (f.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawLines(doc, lines, { size = 10, color = BODY, bold = false, lineGap = 4 } = {}) {
  const f = bold ? fontBold : fontRegular
  const leading = size + lineGap
  for (const line of lines) {
    ensureSpace(doc, leading)
    drawTextSafe(line, { x: MARGIN_L, y: y - size, size, font: f, color })
    y -= leading
  }
}

function drawParagraph(doc, text, opts = {}) {
  const size = opts.size ?? 10
  const lines = wrapLines(text, size, CONTENT_W, opts.bold)
  drawLines(doc, lines, { size, color: opts.color ?? BODY, bold: opts.bold, lineGap: opts.lineGap ?? 3 })
  y -= opts.after ?? 6
}

function drawHeading(doc, text) {
  ensureSpace(doc, 28)
  y -= 4
  drawTextSafe(text, { x: MARGIN_L, y: y - 12, size: 12, font: fontBold, color: ULTRAMARINE })
  y -= 20
}

function drawBullets(doc, items) {
  for (const item of items) {
    const lines = wrapLines(item, 10, CONTENT_W - 14)
    ensureSpace(doc, 14 * lines.length)
    drawTextSafe('-', { x: MARGIN_L, y: y - 10, size: 10, font: fontRegular, color: BODY })
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) ensureSpace(doc, 14)
      drawTextSafe(lines[i], { x: MARGIN_L + 14, y: y - 10, size: 10, font: fontRegular, color: BODY })
      y -= 14
    }
  }
  y -= 4
}

function drawNumbered(doc, items) {
  items.forEach((item, idx) => {
    const prefix = `${idx + 1}. `
    const lines = wrapLines(item, 10, CONTENT_W - 20)
    ensureSpace(doc, 14 * lines.length)
    drawTextSafe(prefix, { x: MARGIN_L, y: y - 10, size: 10, font: fontRegular, color: BODY })
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) ensureSpace(doc, 14)
      drawTextSafe(lines[i], { x: MARGIN_L + 20, y: y - 10, size: 10, font: fontRegular, color: BODY })
      y -= 14
    }
  })
  y -= 4
}

function drawTable(doc, rows) {
  const colW = [CONTENT_W * 0.28, CONTENT_W * 0.72]
  const pad = 5
  const size = 9

  for (const [label, value] of rows) {
    const labelLines = wrapLines(label, size, colW[0] - pad * 2, true)
    const valueLines = wrapLines(value, size, colW[1] - pad * 2)
    const rowH = Math.max(labelLines.length, valueLines.length) * (size + 3) + pad * 2
    ensureSpace(doc, rowH + 2)

    const top = y
    page.drawRectangle({
      x: MARGIN_L,
      y: top - rowH,
      width: CONTENT_W,
      height: rowH,
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.5,
    })
    page.drawLine({
      start: { x: MARGIN_L + colW[0], y: top },
      end: { x: MARGIN_L + colW[0], y: top - rowH },
      thickness: 0.5,
      color: rgb(0.82, 0.82, 0.82),
    })

    let ly = top - pad - size
    for (const line of labelLines) {
      drawTextSafe(line, { x: MARGIN_L + pad, y: ly, size, font: fontBold, color: BODY })
      ly -= size + 3
    }
    let vy = top - pad - size
    for (const line of valueLines) {
      drawTextSafe(line, { x: MARGIN_L + colW[0] + pad, y: vy, size, font: fontRegular, color: BODY })
      vy -= size + 3
    }
    y = top - rowH - 2
  }
  y -= 4
}

async function main() {
  const doc = await PDFDocument.create()
  fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  newPage(doc)

  drawTextSafe('Coordinator Survey Console', {
    x: MARGIN_L,
    y: y - 22,
    size: 20,
    font: fontBold,
    color: ULTRAMARINE,
  })
  y -= 30
  drawParagraph(doc, 'HighTowers-Web — Wing planning aid for Low Level Route tower surveys', {
    size: 11,
    color: MUTED,
  })
  drawParagraph(doc, 'Audience: Wing coordinators, squadron leadership, and aircrew who need to understand how staffing decisions are made.', {
    size: 9.5,
    color: MUTED,
    after: 10,
  })
  page.drawLine({
    start: { x: MARGIN_L, y: y },
    end: { x: PAGE_W - MARGIN_R, y },
    thickness: 2,
    color: ULTRAMARINE,
  })
  y -= 14

  drawHeading(doc, 'What this tool is')
  drawBullets(doc, [
    'How many sorties does each team need?',
    'Which contiguous MTR waypoint ranges should each aircraft fly?',
    'How do 1 vs 2 vs 3 teams compare on total wing sorties?',
  ])
  drawParagraph(
    doc,
    'It uses NASR corridor width, your flight-plan waypoint sequence, departure airports you choose, and a per-sortie distance budget (typically 400–500 NM). It models G1000 parallel-track offsets on each side of the centerline.'
  )
  drawParagraph(
    doc,
    'It is not a weather tool, MOA planner, ATC product, or ForeFlight replacement. Crews still fly corridors in ForeFlight Military Flight Bag.',
    { after: 8 }
  )

  drawHeading(doc, 'Who uses what')
  drawTable(doc, [
    ['Wing coordinator', 'Coordinator Survey Console — staffing what-if, sortie briefs'],
    ['Aircrew', 'Main app — flight plans, tower analysis, maps, PDF export, content packs'],
    ['Wing administrator', 'Content Pack console — pack lifecycle (separate from coordinator planning)'],
  ])

  drawHeading(doc, 'How coordinators work in practice')
  drawNumbered(doc, [
    'Start with available squadrons — CAP teams operate from airports near their home base. The tool does not pick airports for you.',
    'Build or open a flight plan for the MTR; open the console from Flight Plans.',
    'Run a what-if — enter Team 2 and/or Team 3 airports; choose a mode or Compare 1 vs 2 / Compare 2 vs 3.',
    'Brief teams — sortie rows: waypoint from-to, offsets, ferry and along-route NM.',
    'Re-run when the roster changes — weather or availability may drop a team the day before: recalculate with fewer teams, or swap in another squadron’s airport and re-brief everyone.',
  ])
  ensureSpace(doc, 50)
  page.drawRectangle({
    x: MARGIN_L,
    y: y - 44,
    width: CONTENT_W,
    height: 44,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: ULTRAMARINE,
    borderWidth: 1,
  })
  const callout =
    'Management one-liner: The coordinator names which teams and airports can play; HighTowers calculates how to divide the route and sorties to cover the MTR with the fewest flights practical under the distance cap—and you can re-run when the roster changes.'
  drawParagraph(doc, callout, { size: 9.5, after: 10 })

  drawHeading(doc, 'Planner modes')
  drawTable(doc, [
    ['1 team', 'One aircraft: inner then outer passes on the full route from one base.'],
    ['2 teams', 'Parallel: opposite sides of the corridor; same geography, different bases.'],
    ['3 teams', 'Geographic split: three segments; each team flies both sides of its segment. Optimizer picks splits and base assignments.'],
    ['Compare 1 vs 2', 'One aircraft (full corridor) vs two aircraft (opposite sides).'],
    ['Compare 2 vs 3', 'Two aircraft (opposite sides) vs three aircraft (geographic split).'],
  ])

  drawHeading(doc, 'What the optimizer does (and does not)')
  drawTable(doc, [
    [
      'Does',
      'Minimize total wing sorties (tie-break NM); pack waypoint chains into sorties under the budget; include ferry and offset legs; optimize each sortie’s start end; for 3-team mode, search segment boundaries and team assignments.',
    ],
    [
      'Does not',
      'Choose squadrons or airports; change the MTR waypoint list; replace ForeFlight or weather judgment.',
    ],
  ])

  drawHeading(doc, 'Reading the results')
  drawTable(doc, [
    ['Inner / Outer', 'Left and right of centerline (asymmetric spans use different offset lists).'],
    ['Offsets', 'G1000 parallel-track spacing in NM (default: 3, 9, 15, outer margin).'],
    ['Ferry in / out', 'Base to/from route entry or exit for that sortie.'],
    ['Along route', 'Directed offset legs on the assigned waypoint chain.'],
    ['Warning in Total', 'Over NM budget — shorter segment or more teams.'],
  ])

  drawHeading(doc, 'URLs (NM Wing pilot hosting)')
  drawTable(doc, [
    ['Crew app', 'https://gvdurfee.github.io/HighTowers-Web/'],
    ['Coordinator console', 'Flight Plans → Coordinator Survey Console, or /coordinator/survey?plan=<id>'],
    ['Wing admin', '/admin/content-packs — wing staff only'],
  ])
  drawParagraph(
    doc,
    'After updates on main, hard refresh (Cmd+Shift+R). Pages rebuilds automatically; Railway API updates when server/ changes.',
    { size: 9, color: MUTED, after: 10 }
  )

  ensureSpace(doc, 36)
  drawParagraph(doc, 'Wing planning aid only. Verify corridors and procedures in ForeFlight Military Flight Bag before flying.', {
    size: 10,
    color: PIMENTO,
    bold: true,
    after: 6,
  })
  drawParagraph(doc, 'Source: docs/COORDINATOR_SURVEY_CONSOLE_HANDOUT.md', { size: 8, color: MUTED })

  fs.mkdirSync(path.dirname(pdfPath), { recursive: true })
  const bytes = await doc.save()
  fs.writeFileSync(pdfPath, bytes)
  console.log(`Wrote ${pdfPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
