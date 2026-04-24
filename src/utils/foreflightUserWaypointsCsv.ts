/**
 * ForeFlight Content Pack: `navdata/user_waypoints.csv`
 *
 * We intentionally preserve:
 * - original header/column order
 * - unknown columns (pass-through)
 *
 * This is a small CSV utility (not RFC-perfect) tailored to ForeFlight waypoint exports:
 * - comma-separated
 * - optional quotes
 * - no embedded newlines expected
 */

export type ForeFlightUserWaypointsCsv = {
  header: string[]
  rows: string[][]
  lineEnding: '\n' | '\r\n'
}

function detectLineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
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

function csvEscape(value: string): string {
  const v = value ?? ''
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function parseForeFlightUserWaypointsCsv(text: string): ForeFlightUserWaypointsCsv {
  const lineEnding = detectLineEnding(text)
  const lines = text
    .split(/\r\n|\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
  if (lines.length === 0) {
    return { header: [], rows: [], lineEnding }
  }
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: string[] = []
    for (let c = 0; c < header.length; c++) {
      row.push(values[c] ?? '')
    }
    rows.push(row)
  }
  return { header, rows, lineEnding }
}

export function stringifyForeFlightUserWaypointsCsv(doc: ForeFlightUserWaypointsCsv): string {
  const { header, rows, lineEnding } = doc
  const out: string[] = []
  out.push(header.map(csvEscape).join(','))
  for (const r of rows) {
    const padded = [...r]
    while (padded.length < header.length) padded.push('')
    out.push(padded.slice(0, header.length).map(csvEscape).join(','))
  }
  return out.join(lineEnding) + lineEnding
}

export function findHeaderIndex(header: string[], candidates: string[]): number | null {
  const lower = header.map((h) => h.toLowerCase())
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx >= 0) return idx
  }
  return null
}

export function getCell(row: string[], idx: number | null): string {
  if (idx == null) return ''
  return row[idx] ?? ''
}

export function setCell(row: string[], idx: number | null, value: string): void {
  if (idx == null) return
  while (row.length <= idx) row.push('')
  row[idx] = value
}

