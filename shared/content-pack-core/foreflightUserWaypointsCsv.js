/**
 * ForeFlight Content Pack: user_waypoints CSV parse/stringify (shared browser + Node).
 * Port of src/utils/foreflightUserWaypointsCsv.ts — keep in sync.
 */

export const USER_WAYPOINT_CSV_COORD_DECIMAL_PLACES = 4

export function roundCoordForUserWaypointCsv(n) {
  if (!Number.isFinite(n)) return n
  const f = 10 ** USER_WAYPOINT_CSV_COORD_DECIMAL_PLACES
  return Math.round(n * f) / f
}

export function formatUserWaypointCsvLatLon(n) {
  return roundCoordForUserWaypointCsv(n).toFixed(USER_WAYPOINT_CSV_COORD_DECIMAL_PLACES)
}

function normalizeCsvHeaderToken(raw) {
  return raw.replace(/^\uFEFF/, '').trim()
}

export function decodeWaypointCsvBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: false }).decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be', { fatal: false }).decode(bytes)
  }
  let s = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (s.length > 0 && s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1)
  }
  return s
}

function detectLineEnding(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let i = 0
  let inQuotes = false
  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1]
        if (next === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cur += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      out.push(cur)
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  out.push(cur)
  return out
}

function csvEscape(value) {
  const v = value ?? ''
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function parseForeFlightUserWaypointsCsv(text) {
  const lineEnding = detectLineEnding(text)
  const lines = text
    .split(/\r\n|\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
  if (lines.length === 0) {
    return { header: [], rows: [], lineEnding }
  }
  const header = parseCsvLine(lines[0]).map((h) => normalizeCsvHeaderToken(h))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row = []
    for (let c = 0; c < header.length; c++) {
      row.push(values[c] ?? '')
    }
    rows.push(row)
  }
  return { header, rows, lineEnding }
}

export function stringifyForeFlightUserWaypointsCsv(doc) {
  const { header, rows, lineEnding } = doc
  const out = []
  out.push(header.map(csvEscape).join(','))
  for (const r of rows) {
    const padded = [...r]
    while (padded.length < header.length) padded.push('')
    out.push(padded.slice(0, header.length).map(csvEscape).join(','))
  }
  return out.join(lineEnding) + lineEnding
}

export function findHeaderIndex(header, candidates) {
  const lower = header.map((h) => normalizeCsvHeaderToken(h).toLowerCase())
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx >= 0) return idx
  }
  return null
}

export function getCell(row, idx) {
  if (idx == null) return ''
  return row[idx] ?? ''
}

export function setCell(row, idx, value) {
  if (idx == null) return
  while (row.length <= idx) row.push('')
  row[idx] = value
}
