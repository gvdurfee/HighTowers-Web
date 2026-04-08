import { PDFDocument, PDFTextField, rgb, StandardFonts, type PDFForm } from 'pdf-lib'
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
import { compressImageForEmail } from '@/utils/imageCompression'
import { fetchMissionMapStaticPng } from '@/utils/missionMapStaticImage'
import type { TowerEntry } from '@/types/reportForm'

/** US Letter landscape for tower photos and mission map appendix */
const LANDSCAPE_WIDTH = 792
const LANDSCAPE_HEIGHT = 612
const MARGIN = 36

/** Tuned between fitting IR111 / notes in comb fields and readability. */
const FORM_FIELD_FONT_SIZE = 12

const PHOTO_OVERLAY_FONT_SIZE = 11

/** CAP brand colors (tailwind cap.ultramarine, cap.pimento) */
const CAP_ULTRAMARINE = rgb(14 / 255, 43 / 255, 141 / 255)
const CAP_PIMENTO = rgb(219 / 255, 0, 41 / 255)

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
        field.setFontSize(FORM_FIELD_FONT_SIZE)
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
        unassigned[ui].setFontSize(FORM_FIELD_FONT_SIZE)
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
  add(['ADDITIONAL_NOTES', 'AdditionalNotes', 'Additional Notes', 'additional_notes'], formData.additionalNotes)

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

    const notes = mergeBearingNotesWithManual(
      formatDistanceBearingNotes(loc, waypoints),
      (e.notes ?? '').trim()
    )
    const latStr = loc ? formatLatitude(loc.latitude) : e.latitude
    const lonStr = loc ? formatLongitude(loc.longitude) : e.longitude
    const mslStr = loc ? String(Math.round(loc.elevation)) : e.msl
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
      field.setFontSize(FORM_FIELD_FONT_SIZE)
      if (field.isCombed()) {
        field.disableCombing()
      }
      try {
        field.setMaxLength(240)
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
    rowNotesForForce[i] = mergeBearingNotesWithManual(
      formatDistanceBearingNotes(loc, waypoints),
      (formData.towerEntries[i]?.notes ?? '').trim()
    )
  }
  forceTowerNotesIntoPdfFields(form, rowNotesForForce)

  form.updateFieldAppearances()

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

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
      const lineSpacing = 11
      const fontSize = PHOTO_OVERLAY_FONT_SIZE
      const ovW = Math.min(228, dims.width - 12)
      const ovH = lines.length * lineSpacing + ovPad * 2 + 4
      const imgTop = y + dims.height
      const ovX = x + 8
      const ovY = imgTop - 8 - ovH

      page.drawRectangle({
        x: ovX,
        y: ovY,
        width: ovW,
        height: ovH,
        color: CAP_ULTRAMARINE,
        opacity: 0.55,
        borderWidth: 0,
      })

      let textBaseline = ovY + ovH - ovPad - fontSize
      for (const line of lines) {
        page.drawText(line, {
          x: ovX + 6,
          y: textBaseline,
          size: fontSize,
          font: helvetica,
          color: CAP_PIMENTO,
        })
        textBaseline -= lineSpacing
      }
    }
  }

  const mapPngBytes = await fetchMissionMapStaticPng(missionId)
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
      const mapAreaBottom = MARGIN
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
    } catch {
      /* omit map page on embed failure */
    }
  }

  return pdfDoc.save()
}
