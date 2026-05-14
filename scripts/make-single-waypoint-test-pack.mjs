#!/usr/bin/env node
/**
 * Build a single-waypoint test fixture from an existing ForeFlight Content
 * Pack ZIP. Keeps every navdata sibling file intact, but trims
 * `user_waypoints.csv` (or `user_waypoints`) down to its header plus the first
 * data row.
 *
 * Useful for verifying the apply flow's sequential naming logic on appends:
 * upload the fixture, run apply against a mission with N towers, expect N
 * appends starting from the next letter after the kept row's suffix.
 *
 * Usage:
 *   node scripts/make-single-waypoint-test-pack.mjs --in path/to/pack.zip --out path/to/output.zip
 */
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'

function parseArgs(argv) {
  const args = { in: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--in') args.in = String(argv[++i] ?? '')
    else if (a === '--out') args.out = String(argv[++i] ?? '')
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/make-single-waypoint-test-pack.mjs --in <input.zip> --out <output.zip>'
      )
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      process.exit(2)
    }
  }
  if (!args.in || !args.out) {
    console.error('Both --in and --out are required.')
    process.exit(2)
  }
  return args
}

/**
 * Returns the header line plus the first non-empty data line from `text`,
 * preserving the file's existing line ending and finishing with a trailing
 * newline.
 */
function trimCsvToFirstRow(text) {
  const usesCRLF = text.includes('\r\n')
  const eol = usesCRLF ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  let headerIdx = 0
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx++
  const header = lines[headerIdx] ?? ''
  let firstData = ''
  for (let j = headerIdx + 1; j < lines.length; j++) {
    if (lines[j].trim()) {
      firstData = lines[j]
      break
    }
  }
  return firstData ? `${header}${eol}${firstData}${eol}` : `${header}${eol}`
}

const args = parseArgs(process.argv.slice(2))

if (!fs.existsSync(args.in)) {
  console.error(`Input ZIP not found: ${args.in}`)
  process.exit(2)
}

const zip = new AdmZip(args.in)
const csvEntry = zip
  .getEntries()
  .find(
    (e) =>
      !e.isDirectory &&
      /user_waypoints(\.csv)?$/i.test(e.entryName) &&
      !e.entryName.startsWith('__MACOSX/')
  )

if (!csvEntry) {
  console.error('Could not find a user_waypoints CSV entry in the input ZIP.')
  process.exit(2)
}

const originalText = csvEntry.getData().toString('utf8')
const trimmedText = trimCsvToFirstRow(originalText)
const originalRowCount = originalText.split(/\r?\n/).filter((s) => s.trim()).length - 1
const keptRow = trimmedText.split(/\r?\n/)[1] ?? '(none)'

console.log(`CSV entry: ${csvEntry.entryName}`)
console.log(`Original data rows: ${originalRowCount}`)
console.log(`Kept row:           ${keptRow}`)

zip.updateFile(csvEntry.entryName, Buffer.from(trimmedText, 'utf8'))

fs.mkdirSync(path.dirname(args.out), { recursive: true })
zip.writeZip(args.out)
console.log(`\nWrote ${args.out}`)
