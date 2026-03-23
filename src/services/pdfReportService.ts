import { PDFDocument } from 'pdf-lib'
import { db } from '@/db/schema'
import type {
  TowerReportRecord,
  TowerLocationRecord,
  WaypointRecord,
} from '@/db/schema'
import { nearestWaypointInfo, shortWaypointId } from '@/utils/towerWaypointGeometry'
import { compressImageForEmail } from '@/utils/imageCompression'
import type { TowerEntry } from '@/types/reportForm'

const LETTER_WIDTH = 612
const LETTER_HEIGHT = 792
const MARGIN = 36

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

function buildNotesWithBearingDistance(
  towerLat: number,
  towerLon: number,
  waypoints: WaypointRecord[]
): string {
  if (!waypoints.length) return ''
  const info = nearestWaypointInfo(towerLat, towerLon, waypoints)
  if (!info) return ''
  const wpShortId = shortWaypointId((info.waypoint as WaypointRecord).originalName ?? '')
  return `${info.distanceNm.toFixed(1)} nm, ${Math.round(info.bearingDeg)}° True from point ${wpShortId}`
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
  add(['PHONE', 'Phone', 'phone', 'PHONE_NUMBER'], formData.phone)
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

    let notes = e.notes
    if (loc && waypoints.length > 0) {
      notes = buildNotesWithBearingDistance(loc.latitude, loc.longitude, waypoints)
    }
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
    const latKeys = [
      `R${row}_LAT`, `ROW${row}_LAT`, `Lat${row}`, `Lat${r0}`,
      ...(row === 1 ? ['LAT', 'Lat', 'Latitude', 'N'] : []),
    ]
    const lonKeys = [
      `R${row}_LON`, `ROW${row}_LON`, `Lon${row}`, `Lon${r0}`,
      ...(row === 1 ? ['LON', 'Lon', 'Longitude', 'W'] : []),
    ]
    const mslKeys = [`R${row}_MSL`, `MSL${row}`, `MSL${r0}`, ...(row === 1 ? ['MSL', 'Msl'] : [])]
    const aglKeys = [`R${row}_AGL`, `AGL${row}`, `AGL${r0}`, ...(row === 1 ? ['AGL', 'Agl'] : [])]
    const notesKeys = [
      `R${row}_NOTES`, `Notes${row}`, `Notes${r0}`, `Row${row}.Notes`,
      ...(row === 1 ? ['NOTES', 'NOTE', 'Note', 'Remarks', 'Comments'] : []),
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

  const templateRes = await fetch('/Blank Route Survey Form 2.pdf')
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
    const name = field.getName()
    const value = resolveFieldValue(name, mappings)
    if (value == null || value === '') continue
    try {
      const tf = field as { setText?: (v: string) => void }
      if (typeof tf.setText === 'function') tf.setText(value)
    } catch {
      // Field might not be a text field, skip
    }
  }

  form.updateFieldAppearances()

  // Append tower image pages (compressed for email)
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

    const contentWidth = LETTER_WIDTH - MARGIN * 2
    const contentHeight = LETTER_HEIGHT - MARGIN * 2
    const dims = image.scaleToFit(contentWidth, contentHeight)
    const x = MARGIN + (contentWidth - dims.width) / 2
    const y = LETTER_HEIGHT - MARGIN - dims.height

    const page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT])
    page.drawImage(image, { x, y, width: dims.width, height: dims.height })
  }

  return pdfDoc.save()
}
