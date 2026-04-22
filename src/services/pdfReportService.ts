import {
  PDFDocument,
  PDFPage,
  PDFTextField,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFForm,
} from 'pdf-lib'
import { db } from '@/db/schema'
import type {
  TowerReportRecord,
  TowerLocationRecord,
  WaypointRecord,
} from '@/db/schema'
import {
  formatDistanceBearingNotes,
  mergeBearingNotesWithManual,
} from '@/utils/towerWaypointGeometry'
import { towerHeightsUseSeeNotes } from '@/utils/routeSurveyTowerRow'
import { compressImageForEmail } from '@/utils/imageCompression'
import {
  fetchMissionMapStaticPng,
  MAPBOX_STATIC_IMAGE_PADDING_PX,
  staticImageLabelBounds,
  type MissionMapGeographicBounds,
  type MissionMapWaypointMarker,
} from '@/utils/missionMapStaticImage'
import type { TowerEntry } from '@/types/reportForm'
import {
  ADDITIONAL_NOTES_MAX_LENGTH,
  additionalNotesForPdf,
} from '@/constants/reportCopy'

/** US Letter landscape for tower photos and mission map appendix */
const LANDSCAPE_WIDTH = 792
const LANDSCAPE_HEIGHT = 612
const MARGIN = 36

/** Default AcroForm text — 12pt often clips long emails/phones on the AF template. */
const FORM_FIELD_FONT_SIZE = 10
/** Email, phone, fax, POC, CAP Unit, additional notes: narrower boxes in the PDF. */
const PDF_CONTACT_FIELD_FONT_SIZE = 8
/** Long Notes lines (bearing + “No Image GPS.”) need a smaller size to avoid clipping in narrow PDF cells. */
const TOWER_NOTES_FORM_FONT_SIZE = 9

const PHOTO_OVERLAY_FONT_SIZE = 11

/** CAP brand — tower photo label uses tailwind cap.yellow #FFD911 */
const CAP_YELLOW = rgb(255 / 255, 217 / 255, 17 / 255)
/** CAP ultramarine — map line / mission-map waypoint labels (tailwind cap-ultramarine) */
const CAP_BLUE = rgb(14 / 255, 43 / 255, 141 / 255)

/** Web Mercator Y (EPSG:3857) from latitude in degrees — matches Mapbox static map projection. */
function webMercatorYFromLatDeg(latDeg: number): number {
  const clamped = Math.max(Math.min(latDeg, 85.05112878), -85.05112878)
  const φ = (clamped * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + φ / 2))
}

function drawWaypointLabelsOnMissionMap(
  page: PDFPage,
  font: PDFFont,
  labelBounds: MissionMapGeographicBounds,
  markers: MissionMapWaypointMarker[],
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  nativeImgW: number,
  nativeImgH: number
): void {
  const lonSpan = Math.max(labelBounds.east - labelBounds.west, 1e-9)
  const ySouth = webMercatorYFromLatDeg(labelBounds.south)
  const yNorth = webMercatorYFromLatDeg(labelBounds.north)
  const ySpan = Math.max(yNorth - ySouth, 1e-12)
  const fontSize = 8
  const textPadX = 3.5
  const textPadY = 2
  /** Mapbox fits `bounds` inside the image minus this inset (see MAPBOX_STATIC_IMAGE_PADDING_PX). */
  const insetX = (MAPBOX_STATIC_IMAGE_PADDING_PX / nativeImgW) * imgW
  const insetY = (MAPBOX_STATIC_IMAGE_PADDING_PX / nativeImgH) * imgH
  const innerW = Math.max(imgW - 2 * insetX, 1e-6)
  const innerH = Math.max(imgH - 2 * insetY, 1e-6)

  for (const m of markers) {
    if (!m.label) continue
    const u = (m.lon - labelBounds.west) / lonSpan
    const yPt = webMercatorYFromLatDeg(m.lat)
    const v = (yPt - ySouth) / ySpan
    if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) continue
    const cx = imgX + insetX + u * innerW
    const cy = imgY + insetY + v * innerH
    const textW = font.widthOfTextAtSize(m.label, fontSize)
    const boxW = textW + textPadX * 2
    const boxH = fontSize + textPadY * 2
    const boxX = cx - boxW / 2
    const boxBottom = cy - boxH / 2
    page.drawRectangle({
      x: boxX,
      y: boxBottom,
      width: boxW,
      height: boxH,
      color: CAP_YELLOW,
      borderColor: CAP_BLUE,
      borderWidth: 0.4,
    })
    page.drawText(m.label, {
      x: cx - textW / 2,
      y: boxBottom + textPadY + 0.75,
      size: fontSize,
      font,
      color: CAP_BLUE,
    })
  }
}

function formatLatitude(value: number): string {
  const dir = value >= 0 ? 'N' : 'S'
  const abs = Math.abs(value)
  const d = Math.floor(abs)
  const m = (abs - d) * 60
  return `${dir}${d}°${m.toFixed(2)}'`
}

function formatLongitude(value: number): string {
  const dir = value >= 0 ? 'E' : 'W'
  const abs = Math.abs(value)
  const d = Math.floor(abs)
  const m = (abs - d) * 60
  return `${dir}${d}°${m.toFixed(2)}'`
}

/** Extract base field name from hierarchical PDF field names */
function baseFieldName(fieldName: string): string {
  const parts = fieldName.split('.')
  const last = parts[parts.length - 1] ?? fieldName
  return last.replace(/\[\d+\]$/, '')
}

/**
 * Use a smaller font for CAP contact / header text fields so long emails fit the template.
 * Skips tower-table rows (lat/lon/MSL/AGL/notes) so those keep FORM_FIELD_FONT_SIZE until * {@link forceTowerNotesIntoPdfFields} adjusts notes.
 */
function pdfFieldUsesCompactContactFont(fieldName: string): boolean {
  if (inferTowerTableNoteRow(fieldName) != null) return false
  const t = `${fieldName} ${baseFieldName(fieldName)}`.toLowerCase()
  if (/(struct|light|lighting|latitude|longitude)/.test(t)) return false
  if (/\b(msl|agl)\b/.test(t)) return false
  if (/\b(lat|lon)\b/.test(t) && !/plat|plon|slon|flon/.test(t)) return false
  if (/^n_?\d|^w_?\d|r\d+_(lat|lon|msl|agl)/.test(t.replace(/\s+/g, ''))) return false
  return (
    /\b(email|e-mail)\b/.test(t) ||
    /\b(phone|fax|telephone)\b/.test(t) ||
    t.includes('poc') ||
    /\bcap\b.*\bunit\b/.test(t) ||
    /\badditional\b/.test(t)
  )
}

function resolveFieldValue(
  fieldName: string,
  mappings: Record<string, string>
): string | undefined {
  if (mappings[fieldName]) return mappings[fieldName]
  const base = baseFieldName(fieldName)
  if (mappings[base]) return mappings[base]
  const lower = fieldName.toLowerCase()
  for (const [key, value] of Object.entries(mappings)) {
    if (key.toLowerCase() === lower) return value
  }
  if (base) {
    const baseLower = base.toLowerCase()
    for (const [key, value] of Object.entries(mappings)) {
      if (key.toLowerCase() === baseLower) return value
    }
  }
  return undefined
}

const TOWER_NOTES_PDF_MAX_LENGTH = 240

function pdfTextFieldMaxLength(fieldName: string): number {
  const n = fieldName.toLowerCase()
  if (n.includes('additional') && (n.includes('note') || n.includes('notes'))) {
    return ADDITIONAL_NOTES_MAX_LENGTH
  }
  return TOWER_NOTES_PDF_MAX_LENGTH
}

/** Map Adobe table cell field names (e.g. NotesRow3, …Row3[0]…Notes[0]) to 0-based row index. */
function inferTowerTableNoteRow(fieldName: string): number | null {
  const notesRow = fieldName.match(/^NotesRow(\d+)$/i)
  if (notesRow) {
    const num = parseInt(notesRow[1], 10)
    if (num >= 1 && num <= 6) return num - 1
  }
  const rowMatches = [...fieldName.matchAll(/[Rr]ow[_\s.]?(\d+)/gi)]
  if (rowMatches.length > 0) {
    const num = parseInt(rowMatches[rowMatches.length - 1][1], 10)
    if (num >= 1 && num <= 6) return num - 1
  }
  const m2 = fieldName.match(/[Rr](\d)[_\s]?(?:NOTE|Notes)/i)
  if (m2) {
    const num = parseInt(m2[1], 10)
    if (num >= 1 && num <= 6) return num - 1
  }
  const m3 = fieldName.match(/(?:NOTE|Notes)[_\s]?(\d)/i)
  if (m3) {
    const num = parseInt(m3[1], 10)
    if (num >= 1 && num <= 6) return num - 1
  }
  return null
}

/**
 * Many AF form templates use hierarchical names that do not match our key list.
 * Second pass: find Note/Comment fields and set bearing/distance text by row.
 */
/**
 * Blank Route Survey Form 2.pdf — structure (left column) and lighting (right), top to bottom:
 * Cell/Microwave, Multiple Towers, Airfield, Other | None, Strobes, Red, Other.
 * Verified via widget positions (x≈58 vs x≈160).
 */
const BLANK_ROUTE_STRUCTURE_CHECKBOXES: readonly string[][] = [
  ['Check Box1.0', 'Check Box1.1', 'Check Box1.2', 'Check Box1.3'],
  ['Check Box1.4', 'Check Box1.5', 'Check Box1.6', 'Check Box1.7'],
  ['Check Box1.8', 'Check Box1.9', 'Check Box1.10', 'Check Box1.11'],
  ['Check Box1.12', 'Check Box1.13', 'Check Box1.14', 'Check Box1.15'],
  ['Check Box1.16', 'Check Box1.17', 'Check Box1.18', 'Check Box1.19'],
  ['Check Box1.20', 'Check Box1.21', 'Check Box1.22', 'Check Box1.23'],
]

const BLANK_ROUTE_LIGHTING_CHECKBOXES: readonly string[][] = [
  ['Check Box1.00.0', 'Check Box1.00.1', 'Check Box1.00.2', 'Check Box1.00.3'],
  ['Check Box1.00.4', 'Check Box1.00.5', 'Check Box1.00.6', 'Check Box1.00.7'],
  ['Check Box1.00.8', 'Check Box1.00.9', 'Check Box1.00.10', 'Check Box1.00.11'],
  ['Check Box1.00.12', 'Check Box1.00.13', 'Check Box1.00.14', 'Check Box1.00.15'],
  ['Check Box1.00.16', 'Check Box1.00.17', 'Check Box1.00.18', 'Check Box1.00.19'],
  ['Check Box1.00.20', 'Check Box1.00.21', 'Check Box1.00.22', 'Check Box1.00.23'],
]

function setPdfCheckBox(form: PDFForm, name: string, checked: boolean): void {
  try {
    const cb = form.getCheckBox(name)
    if (checked) cb.check()
    else cb.uncheck()
  } catch {
    /* missing or not a checkbox */
  }
}

/** Map app structure type to PDF column index (0 = top checkbox). */
function structureTypeToCheckboxIndex(structType: string): number | null {
  const t = structType.trim()
  if (!t) return null
  if (t === 'Cell/Microwave') return 0
  if (t === 'Multiple Towers') return 1
  if (t === 'Airfield') return 2
  if (t === 'Other') return 3
  return 3
}

/** Map app lighting to PDF column index (0 = top). */
function lightingToCheckboxIndex(lighting: string): number | null {
  const l = lighting.trim()
  if (!l) return null
  const order = ['None', 'Strobes', 'Red', 'Other'] as const
  const i = order.indexOf(l as (typeof order)[number])
  return i >= 0 ? i : null
}

function applyBlankRouteSurveyStructureLightingCheckboxes(
  form: PDFForm,
  reports: TowerReportRecord[],
  towerEntries: TowerEntry[]
): void {
  for (let row = 0; row < 6; row++) {
    const structNames = BLANK_ROUTE_STRUCTURE_CHECKBOXES[row]
    const lightNames = BLANK_ROUTE_LIGHTING_CHECKBOXES[row]
    if (!structNames || !lightNames) continue

    for (const n of structNames) setPdfCheckBox(form, n, false)
    for (const n of lightNames) setPdfCheckBox(form, n, false)

    const r = reports[row]
    const e = towerEntries[row]
    const structType = (e?.structureType || r?.structureType || '').trim()
    const lighting = (e?.lighting || r?.structureLighting || '').trim()

    const si = structureTypeToCheckboxIndex(structType)
    if (si != null && structNames[si]) {
      setPdfCheckBox(form, structNames[si], true)
    }

    const li = lightingToCheckboxIndex(lighting)
    if (li != null && lightNames[li]) {
      setPdfCheckBox(form, lightNames[li], true)
    }
  }
}

function forceTowerNotesIntoPdfFields(form: PDFForm, rowNotes: string[]): void {
  const fields = form.getFields()
  const noteFields: PDFTextField[] = []
  for (const f of fields) {
    if (!(f instanceof PDFTextField)) continue
    const n = f.getName().toLowerCase()
    if (!/notes?|comment|remark/.test(n)) continue
    if (
      /additional|instruction|footer|subject|email|e-mail|poc|cap unit|phone|fax|mission|date|mtr/.test(
        n
      )
    ) {
      continue
    }
    noteFields.push(f)
  }

  const byRow = new Map<number, PDFTextField[]>()
  const unassigned: PDFTextField[] = []
  for (const f of noteFields) {
    const row = inferTowerTableNoteRow(f.getName())
    if (row != null) {
      const list = byRow.get(row) ?? []
      list.push(f)
      byRow.set(row, list)
    } else {
      unassigned.push(f)
    }
  }

  const assignedRows = new Set<number>()
  for (let r = 0; r < 6; r++) {
    const text = rowNotes[r]
    if (!text) continue
    const list = byRow.get(r)
    if (!list?.length) continue
    for (const field of list) {
      try {
        field.setFontSize(TOWER_NOTES_FORM_FONT_SIZE)
        field.setText(text)
      } catch {
        /* ignore */
      }
    }
    assignedRows.add(r)
  }

  unassigned.sort((a, b) => a.getName().localeCompare(b.getName()))
  let ui = 0
  for (let r = 0; r < 6; r++) {
    if (assignedRows.has(r) || !rowNotes[r]) continue
    while (ui < unassigned.length) {
      try {
        unassigned[ui].setFontSize(TOWER_NOTES_FORM_FONT_SIZE)
        unassigned[ui].setText(rowNotes[r])
      } catch {
        /* ignore */
      }
      ui += 1
      assignedRows.add(r)
      break
    }
  }
}

function buildFieldMappings(
  reports: TowerReportRecord[],
  locations: (TowerLocationRecord | undefined)[],
  formData: {
    pocName: string
    capUnit: string
    phone: string
    email: string
    missionNumber: string
    mtrRoute: string
    date: string
    additionalNotes: string
    towerEntries: TowerEntry[]
  },
  waypoints: WaypointRecord[]
): Record<string, string> {
  const map: Record<string, string> = {}

  const add = (keys: string[], val: string) => {
    for (const k of keys) if (k) map[k] = val
  }

  add(
    ['POC_NAME', 'POCName', 'POC Name', 'poc_name', 'PocName'],
    formData.pocName
  )
  add(['CAP_UNIT', 'CapUnit', 'CAP Unit', 'cap_unit', 'Cap_Unit'], formData.capUnit)
  add(
    ['PHONE', 'Phone', 'phone', 'PHONE_NUMBER', 'Phone Number'],
    formData.phone
  )
  add(['EMAIL', 'Email', 'email', 'E-mail', 'E-mail Address'], formData.email)
  add(
    ['MISSION_NUMBER', 'MissionNumber', 'Mission Number', 'mission_number', 'Mission_Number'],
    formData.missionNumber
  )
  add(
    ['MTR_ROUTE', 'MTRRoute', 'MTR Route', 'mtr_route', 'Mtr_Route'],
    formData.mtrRoute
  )
  add(['DATE', 'Date', 'date'], formData.date)
  add(
    ['ADDITIONAL_NOTES', 'AdditionalNotes', 'Additional Notes', 'additional_notes'],
    additionalNotesForPdf(formData.additionalNotes)
  )

  const totalTowers = reports.length
  const heights = reports.map((r) => r.estimatedHeight ?? 0).filter((h) => h > 0)
  const avgHeight = heights.length ? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length) : 0
  const maxHeight = heights.length ? Math.round(Math.max(...heights)) : 0
  const minHeight = heights.length ? Math.round(Math.min(...heights)) : 0

  add(['TOTAL_TOWERS', 'TotalTowers', 'Total Towers', 'total_towers'], String(totalTowers))
  add(['COMPLETED_TOWERS', 'CompletedTowers', 'Completed Towers'], String(totalTowers))
  add(['AVERAGE_HEIGHT', 'AverageHeight', 'Average Height'], String(avgHeight))
  add(['MAX_HEIGHT', 'MaxHeight', 'Max Height'], String(maxHeight))
  add(['MIN_HEIGHT', 'MinHeight', 'Min Height'], String(minHeight))

  const entries = formData.towerEntries
  for (let i = 0; i < Math.min(6, reports.length, entries.length); i++) {
    const r = reports[i]
    const loc = locations[i]
    const e = entries[i]
    const row = i + 1
    const r0 = i

    const computed = formatDistanceBearingNotes(loc, waypoints)
    const manual = (e.notes ?? '').trim()
    const notes = loc && towerHeightsUseSeeNotes(loc)
      ? manual
      : mergeBearingNotesWithManual(computed, manual)
    const latStr = loc ? formatLatitude(loc.latitude) : e.latitude
    const lonStr = loc ? formatLongitude(loc.longitude) : e.longitude
    const mslStr =
      loc && !towerHeightsUseSeeNotes(loc)
        ? String(Math.round(loc.elevation))
        : e.msl
    const aglStr = e.agl
    const structType = e.structureType || r?.structureType || ''
    const lighting = e.lighting || r?.structureLighting || ''

    const structKeys = [
      `R${row}_STRUCT`, `ROW${row}_STRUCT`, `StructType${row}`,
      `StructType${r0}`, `Structure_${r0}`,
      ...(row === 1 ? ['STRUCT', 'Structure Type', 'StructType'] : []),
    ]
    const lightKeys = [
      `R${row}_LIGHT`, `ROW${row}_LIGHT`, `Lighting${row}`,
      `Lighting${r0}`, `Light_${r0}`,
      ...(row === 1 ? ['LIGHT', 'Lighting', 'Light'] : []),
    ]
    // Blank Route Survey Form 2: row 1 uses N, w, MSL, AGL; rows 2–6 use N_2, w_2, MSL_2, AGL_2, …
    const latKeys = [
      `R${row}_LAT`,
      `ROW${row}_LAT`,
      `Lat${row}`,
      `Lat${r0}`,
      ...(row === 1 ? ['LAT', 'Lat', 'Latitude', 'N'] : [`N_${row}`]),
    ]
    const lonKeys = [
      `R${row}_LON`,
      `ROW${row}_LON`,
      `Lon${row}`,
      `Lon${r0}`,
      ...(row === 1 ? ['LON', 'Lon', 'Longitude', 'W', 'w'] : [`w_${row}`]),
    ]
    const mslKeys = [
      `R${row}_MSL`,
      `MSL${row}`,
      `MSL${r0}`,
      ...(row === 1 ? ['MSL', 'Msl'] : [`MSL_${row}`]),
    ]
    const aglKeys = [
      `R${row}_AGL`,
      `AGL${row}`,
      `AGL${r0}`,
      ...(row === 1 ? ['AGL', 'Agl'] : [`AGL_${row}`]),
    ]
    const notesKeys = [
      `NotesRow${row}`,
      `R${row}_NOTES`,
      `Notes${row}`,
      `Notes${r0}`,
      `Row${row}.Notes`,
      ...(row === 1
        ? [
            'NOTES',
            'NOTE',
            'Note',
            'Remarks',
            'Comments',
            'TextField_Notes',
          ]
        : []),
    ]

    add(structKeys, structType)
    add(lightKeys, lighting)
    add(latKeys, latStr)
    add(lonKeys, lonStr)
    add(mslKeys, mslStr)
    add(aglKeys, aglStr)
    add(notesKeys, notes)
  }

  return map
}

function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) {
        out.push(line)
        line = ''
      }
      if (font.widthOfTextAtSize(w, fontSize) <= maxWidth) {
        line = w
        continue
      }
      let chunk = w
      while (chunk.length > 0) {
        let take = chunk.length
        while (take > 0 && font.widthOfTextAtSize(chunk.slice(0, take), fontSize) > maxWidth) take--
        if (take === 0) take = 1
        out.push(chunk.slice(0, take))
        chunk = chunk.slice(take)
      }
    }
    if (line) out.push(line)
  }
  return out.length > 0 ? out : ['']
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const i = dataUrl.indexOf(',')
  if (i < 0) return new Uint8Array(0)
  const base64 = dataUrl.slice(i + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j)
  return bytes
}

export interface ReportFormData {
  pocName: string
  capUnit: string
  phone: string
  email: string
  missionNumber: string
  mtrRoute: string
  date: string
  additionalNotes: string
  towerEntries: TowerEntry[]
}

export async function generateAirForceReportPdf(
  missionId: string,
  formData: ReportFormData
): Promise<Uint8Array> {
  const mission = await db.missions.get(missionId)
  if (!mission) throw new Error('Mission not found')

  const reports = await db.towerReports
    .where('missionId')
    .equals(missionId)
    .sortBy('reportDate')

  const locations = await Promise.all(
    reports.map((r) => db.towerLocations.get(r.towerLocationId))
  )

  let waypoints: WaypointRecord[] = []
  if (mission.flightPlanId) {
    waypoints = await db.waypoints
      .where('flightPlanId')
      .equals(mission.flightPlanId)
      .sortBy('sequence')
  }

  // BASE_URL is path-only (e.g. /HighTowers-Web/) — `new URL(rel, base)` requires an absolute base and throws.
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  const templatePath = `${base}${encodeURI('Blank Route Survey Form 2.pdf')}`
  const templateRes = await fetch(templatePath)
  if (!templateRes.ok) throw new Error('Template PDF not found')
  const templateBytes = new Uint8Array(await templateRes.arrayBuffer())

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()

  const mappings = buildFieldMappings(
    reports,
    locations,
    formData,
    waypoints
  )

  const fields = form.getFields()
  for (const field of fields) {
    if (!(field instanceof PDFTextField)) continue
    try {
      const fontSize = pdfFieldUsesCompactContactFont(field.getName())
        ? PDF_CONTACT_FIELD_FONT_SIZE
        : FORM_FIELD_FONT_SIZE
      field.setFontSize(fontSize)
      if (field.isCombed()) {
        field.disableCombing()
      }
      try {
        field.setMaxLength(pdfTextFieldMaxLength(field.getName()))
      } catch {
        /* ignore if unsupported */
      }
    } catch {
      /* ignore per-field appearance quirks */
    }
  }

  for (const field of fields) {
    const name = field.getName()
    const value = resolveFieldValue(name, mappings)
    if (value == null || value === '') continue
    try {
      if (field instanceof PDFTextField && typeof field.setText === 'function') {
        field.setText(value)
      }
    } catch {
      // Field might not accept text, skip
    }
  }

  const rowNotesForForce: string[] = ['', '', '', '', '', '']
  for (let i = 0; i < Math.min(6, reports.length, formData.towerEntries.length); i++) {
    const loc = locations[i]
    const e = formData.towerEntries[i]
    const computed = formatDistanceBearingNotes(loc, waypoints)
    const manual = (e?.notes ?? '').trim()
    rowNotesForForce[i] =
      loc && towerHeightsUseSeeNotes(loc)
        ? manual
        : mergeBearingNotesWithManual(computed, manual)
  }
  forceTowerNotesIntoPdfFields(form, rowNotesForForce)

  applyBlankRouteSurveyStructureLightingCheckboxes(form, reports, formData.towerEntries)

  form.updateFieldAppearances()

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  /** Dark text on CAP yellow label for readability */
  const overlayLabelTextColor = rgb(0.12, 0.1, 0.08)

  // Append tower image pages (compressed for email), then mission map — all landscape appendix
  const sortedReportsWithImages = reports.filter(
    (r) => r.annotatedImageDataUrl && r.annotatedImageDataUrl.length > 0
  )

  for (const report of sortedReportsWithImages) {
    const dataUrl = report.annotatedImageDataUrl!
    const compressed = await compressImageForEmail(dataUrl)
    const imageBytes = dataUrlToUint8Array(compressed)

    let image
    try {
      image = await pdfDoc.embedJpg(imageBytes)
    } catch {
      continue
    }

    const contentWidth = LANDSCAPE_WIDTH - MARGIN * 2
    const contentHeight = LANDSCAPE_HEIGHT - MARGIN * 2
    const dims = image.scaleToFit(contentWidth, contentHeight)
    const x = MARGIN + (contentWidth - dims.width) / 2
    const y = LANDSCAPE_HEIGHT - MARGIN - dims.height

    const page = pdfDoc.addPage([LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT])
    page.drawImage(image, { x, y, width: dims.width, height: dims.height })

    const loc = await db.towerLocations.get(report.towerLocationId)
    if (loc) {
      const line1 = `${formatLatitude(loc.latitude)}  ${formatLongitude(loc.longitude)}`
      const aglFt =
        report.estimatedHeight != null ? String(Math.round(report.estimatedHeight)) : '—'
      const line2 = `Height AGL: ${aglFt} ft`
      const line3 = `Height MSL: ${Math.round(loc.elevation)} ft`
      const lines = [line1, line2, line3]
      const ovPad = 6
      const innerPadX = 6
      const lineSpacing = 11
      const fontSize = PHOTO_OVERLAY_FONT_SIZE
      const maxLineW = Math.max(
        0,
        ...lines.map((ln) => helvetica.widthOfTextAtSize(ln, fontSize))
      )
      const ovW = Math.min(maxLineW + innerPadX * 2, dims.width - 16)
      const ovH = lines.length * lineSpacing + ovPad * 2 + 4
      const imgTop = y + dims.height
      const ovX = x + 8
      const ovY = imgTop - 8 - ovH

      page.drawRectangle({
        x: ovX,
        y: ovY,
        width: ovW,
        height: ovH,
        color: CAP_YELLOW,
        opacity: 0.92,
        borderWidth: 0,
      })

      let textBaseline = ovY + ovH - ovPad - fontSize
      for (const line of lines) {
        page.drawText(line, {
          x: ovX + innerPadX,
          y: textBaseline,
          size: fontSize,
          font: helvetica,
          color: overlayLabelTextColor,
        })
        textBaseline -= lineSpacing
      }
    }
  }

  const mapStatic = await fetchMissionMapStaticPng(missionId)
  const mapPngBytes = mapStatic.imageBytes
  if (mapPngBytes && mapPngBytes.length > 0) {
    try {
      let mapImage
      const isJpeg = mapPngBytes[0] === 0xff && mapPngBytes[1] === 0xd8
      if (isJpeg) {
        mapImage = await pdfDoc.embedJpg(mapPngBytes)
      } else {
        try {
          mapImage = await pdfDoc.embedPng(mapPngBytes)
        } catch {
          mapImage = await pdfDoc.embedJpg(mapPngBytes)
        }
      }
      const MAP_NOTES_BAND = 118
      const page = pdfDoc.addPage([LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT])
      const title = 'Mission map — route and reported tower locations'
      page.drawText(title, {
        x: MARGIN,
        y: LANDSCAPE_HEIGHT - MARGIN - 18,
        size: 11,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      })
      const mapAreaTop = LANDSCAPE_HEIGHT - MARGIN - 32
      const mapAreaBottom = MARGIN + MAP_NOTES_BAND
      const mapAreaH = mapAreaTop - mapAreaBottom
      const mapAreaW = LANDSCAPE_WIDTH - MARGIN * 2
      const scaled = mapImage.scaleToFit(mapAreaW, mapAreaH)
      const mx = MARGIN + (mapAreaW - scaled.width) / 2
      const my = mapAreaBottom + (mapAreaH - scaled.height) / 2
      page.drawImage(mapImage, {
        x: mx,
        y: my,
        width: scaled.width,
        height: scaled.height,
      })
      if (mapStatic.bounds && mapStatic.waypointMarkers.length > 0) {
        const labelBounds = staticImageLabelBounds(
          mapStatic.bounds,
          mapStatic.width,
          mapStatic.height,
          MAPBOX_STATIC_IMAGE_PADDING_PX
        )
        drawWaypointLabelsOnMissionMap(
          page,
          helvetica,
          labelBounds,
          mapStatic.waypointMarkers,
          mx,
          my,
          scaled.width,
          scaled.height,
          mapStatic.width,
          mapStatic.height
        )
      }

      const notesBoxH = MAP_NOTES_BAND - 6
      const notesBoxY = MARGIN
      page.drawRectangle({
        x: MARGIN,
        y: notesBoxY,
        width: LANDSCAPE_WIDTH - MARGIN * 2,
        height: notesBoxH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.78, 0.78, 0.78),
        borderWidth: 0.75,
      })
      const innerPad = 8
      const notesTitleSize = 10
      const notesBodySize = 9
      const notesLineGap = 11
      const textMaxW = LANDSCAPE_WIDTH - MARGIN * 2 - innerPad * 2
      let notesY = notesBoxY + notesBoxH - innerPad - notesTitleSize
      page.drawText('Additional Notes', {
        x: MARGIN + innerPad,
        y: notesY,
        size: notesTitleSize,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      })
      notesY -= notesLineGap + 2
      const notesBody = additionalNotesForPdf(formData.additionalNotes)
      const bodyLines = wrapTextLines(notesBody, helvetica, notesBodySize, textMaxW)
      const maxBodyLines = Math.max(
        1,
        Math.floor((notesY - notesBoxY - innerPad) / notesLineGap)
      )
      let lineY = notesY
      for (let i = 0; i < bodyLines.length && i < maxBodyLines; i++) {
        page.drawText(bodyLines[i], {
          x: MARGIN + innerPad,
          y: lineY,
          size: notesBodySize,
          font: helvetica,
          color: rgb(0.15, 0.15, 0.15),
        })
        lineY -= notesLineGap
      }
    } catch {
      /* omit map page on embed failure */
    }
  }

  return pdfDoc.save()
}
