/**
 * Shared pdf-lib helpers for docs/handouts PDF generation.
 */
import { StandardFonts, rgb } from 'pdf-lib'

export const ULTRAMARINE = rgb(0.055, 0.169, 0.553)
export const PIMENTO = rgb(0.859, 0, 0.161)
export const BODY = rgb(0.1, 0.1, 0.1)
export const MUTED = rgb(0.35, 0.35, 0.35)

export const PAGE_W = 612
export const PAGE_H = 792
export const MARGIN_L = 54
export const MARGIN_R = 54
export const MARGIN_T = 48
export const MARGIN_B = 48
export const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

export function ascii(text) {
  return String(text)
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2019/g, "'")
    .replace(/\u2192/g, '->')
    .replace(/\u2022/g, '-')
    .replace(/\u2610/g, '[ ]')
    .replace(/\u2611/g, '[x]')
}

/** @param {import('pdf-lib').PDFDocument} doc */
export async function createHandoutContext(doc) {
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  /** @type {import('pdf-lib').PDFPage} */
  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN_T

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN_T
  }

  function ensureSpace(needed) {
    if (y - needed < MARGIN_B) newPage()
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

  function drawLines(lines, { size = 10, color = BODY, bold = false, lineGap = 3 } = {}) {
    const f = bold ? fontBold : fontRegular
    const leading = size + lineGap
    for (const line of lines) {
      ensureSpace(leading)
      drawTextSafe(line, { x: MARGIN_L, y: y - size, size, font: f, color })
      y -= leading
    }
  }

  function drawParagraph(text, opts = {}) {
    const size = opts.size ?? 9.5
    const lines = wrapLines(text, size, CONTENT_W, opts.bold)
    drawLines(lines, { size, color: opts.color ?? BODY, bold: opts.bold, lineGap: opts.lineGap ?? 2 })
    y -= opts.after ?? 5
  }

  function drawHeading(text, size = 11) {
    ensureSpace(22)
    y -= 3
    drawTextSafe(text, { x: MARGIN_L, y: y - size, size, font: fontBold, color: ULTRAMARINE })
    y -= size + 6
  }

  function drawBullets(items, size = 9) {
    for (const item of items) {
      const lines = wrapLines(item, size, CONTENT_W - 12)
      ensureSpace(12 * lines.length)
      drawTextSafe('-', { x: MARGIN_L, y: y - size, size, font: fontRegular, color: BODY })
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) ensureSpace(12)
        drawTextSafe(lines[i], { x: MARGIN_L + 12, y: y - size, size, font: fontRegular, color: BODY })
        y -= 12
      }
    }
    y -= 3
  }

  function drawChecklist(items, size = 9) {
    for (const item of items) {
      const lines = wrapLines(`[ ] ${item}`, size, CONTENT_W - 8)
      ensureSpace(12 * lines.length)
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) ensureSpace(12)
        drawTextSafe(lines[i], { x: MARGIN_L, y: y - size, size, font: fontRegular, color: BODY })
        y -= 12
      }
    }
    y -= 3
  }

  function drawTable(rows, size = 8.5) {
    const colW = [CONTENT_W * 0.3, CONTENT_W * 0.7]
    const pad = 4

    for (const [label, value] of rows) {
      const labelLines = wrapLines(label, size, colW[0] - pad * 2, true)
      const valueLines = wrapLines(value, size, colW[1] - pad * 2)
      const rowH = Math.max(labelLines.length, valueLines.length) * (size + 2) + pad * 2
      ensureSpace(rowH + 2)

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
        ly -= size + 2
      }
      let vy = top - pad - size
      for (const line of valueLines) {
        drawTextSafe(line, { x: MARGIN_L + colW[0] + pad, y: vy, size, font: fontRegular, color: BODY })
        vy -= size + 2
      }
      y = top - rowH - 1
    }
    y -= 3
  }

  function drawRule() {
    ensureSpace(8)
    page.drawLine({
      start: { x: MARGIN_L, y },
      end: { x: PAGE_W - MARGIN_R, y },
      thickness: 2,
      color: ULTRAMARINE,
    })
    y -= 10
  }

  return {
    get page() {
      return page
    },
    get y() {
      return y
    },
    set y(v) {
      y = v
    },
    fontRegular,
    fontBold,
    newPage,
    ensureSpace,
    drawTextSafe,
    drawParagraph,
    drawHeading,
    drawBullets,
    drawChecklist,
    drawTable,
    drawRule,
  }
}
