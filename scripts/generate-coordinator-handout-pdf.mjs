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

  drawTextSafe('Team Dispatch', {
    x: MARGIN_L,
    y: y - 22,
    size: 20,
    font: fontBold,
    color: ULTRAMARINE,
  })
  y -= 30
  drawParagraph(doc, 'HighTowers-Web - Wing planning aid for Low Level Route tower surveys', {
    size: 11,
    color: MUTED,
  })
  drawParagraph(
    doc,
    'Audience: Wing coordinators, squadron leadership, and the pilots who fly the sortie files. The sidebar name and the page heading are both Team Dispatch.',
    { size: 9.5, color: MUTED, after: 10 }
  )
  page.drawLine({
    start: { x: MARGIN_L, y: y },
    end: { x: PAGE_W - MARGIN_R, y },
    thickness: 2,
    color: ULTRAMARINE,
  })
  y -= 14

  drawHeading(doc, 'What the sortie file is')
  drawParagraph(
    doc,
    'There is no G1000 Parallel Track in these files. Every lane is its own set of user waypoints at the real offset coordinates. The G1000 navigates leg to leg between the loaded user waypoints, flown by hand or with the autopilot in GPS/NAV mode. HighTowers exports the .fpl. Before each lane, confirm the aircraft symbol is on the intended yellow track on both the ForeFlight moving map and the G1000 MFD map.'
  )

  drawHeading(doc, 'Inner and Outer')
  drawParagraph(
    doc,
    "Inner is the side toward the inside of the route's overall curve, as seen on the map. Outer is the other side. A nearly straight or S-shaped route has no clear inside. The app then uses Inner = left of the route as flown from the entry point, and it says so on the Sortie 1 side picker. Pilots go by the side shown on the picker. The labels are Inner (inside the route's curve) and Outer (outside the route's curve)."
  )

  drawHeading(doc, 'Waypoint names')
  drawParagraph(
    doc,
    'Solo Flight Plans: point letters, a 3-digit route position, then I or O (A001I, A001O). Sortie 1 flies the chosen side. Sortie 2 flies the other side, listed in reverse order in the file. A name drops the leading zero only to stay within 6 characters (XYZ01I).'
  )
  drawParagraph(
    doc,
    'Team Dispatch: point letters, the lane number, then I or O (B1O, XM2I). Think of the first one or two letters as the MTR point the waypoint is offset from. The 1, 2, or 3 is the offset lane of the serpentine route the G1000 flies to cover the corridor, counted outward from the centerline. The last letter says Inner or Outer. A rare repeat on the same lane adds a digit (B12I). Names are at most 6 characters, A-Z and 0-9 only, unique in the file. Lane 1 is closest to the centerline. Distances are the ones stated for that plan (often 3, 9, and 15 NM). A team file has no published centerline fixes.'
  )

  drawHeading(doc, 'Before the SD card')
  drawParagraph(
    doc,
    "Not a concern: per the Director of Operations, user waypoints and the flight plans that created them are erased after each mission. Confirm no leftover user waypoints before loading, because short names repeat between routes. After import, spot-check one waypoint against the plan. Follow the G1000 Pilot's Guide for importing user flight plans from the SD card."
  )

  drawHeading(doc, 'How dispatchers staff a route')
  drawParagraph(
    doc,
    'Team Dispatch staffs one, two, or three teams. 1 team is one aircraft that flies both sides in sequence (Sortie 1 side, then the other side on Sortie 2). Use it to finish a partial route fragment left incomplete because of weather or limited resources. Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own .fpl file. The screen is one page. Work it in this order. Words in parentheses are the headings on the screen:'
  )
  drawNumbered(doc, [
    'Crews and aircraft (Teams & parameters).',
    'Route (Load the published route).',
    'Corridor and tracks (Scenario). Published widths are Left NM and Right NM of the centerline as flown. Lane lists are Left offsets and Right offsets. Those fields are not the Inner/Outer choice.',
    'Segments and refuel (Results).',
    'Sortie 1 side (the Inner / Outer radios).',
    'Results (download each sortie .fpl and email it to the Mission Pilot for that aircraft).',
  ])
  drawParagraph(
    doc,
    'Neighboring teams are recommended on opposite sides. Recommended: each segment flies the opposite side from the segments next to it (for example segment 1 Inner, segment 2 Outer, segment 3 Inner). This is a recommendation, not guaranteed separation; pilots still deconflict. Announce when you enter and exit each lane, giving your position by waypoint name (for example, entering B1O). The 1-team choice is one aircraft flying both sides in sequence, used to finish a partial route fragment left incomplete because of weather or limited resources.'
  )

  drawHeading(doc, 'Map View')
  drawParagraph(
    doc,
    'The map legend reads: Map: ultramarine centerline with point letters, white edges, yellow sortie tracks, blue arrows. The centerline color is #3F00FF. The centerline is the published route, labeled with the published point letters only. The highlighted sortie uses the same coordinates as the labels and the .fpl.'
  )

  drawHeading(doc, 'Who uses what')
  drawTable(doc, [
    ['Wing coordinator', 'Team Dispatch - two or three teams, sortie .fpl files'],
    ['Aircrew', 'Flight Plans, Map View, tower analysis, the Air Force report'],
    ['Wing administrator', 'Content pack console - separate from Team Dispatch'],
  ])

  drawHeading(doc, 'URLs (NM Wing pilot hosting)')
  drawTable(doc, [
    ['Crew app', 'https://gvdurfee.github.io/HighTowers-Web/'],
    ['Team Dispatch', 'Sidebar Mission Planning, or /coordinator/survey?plan=<id>'],
    ['Wing admin', '/admin/content-packs - wing staff only'],
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
