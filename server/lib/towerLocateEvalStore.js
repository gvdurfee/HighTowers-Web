/**
 * Append-only eval log for Gemini vs human map-pick comparisons.
 */

import { appendFile, mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  EVAL_CSV_HEADER,
  buildEvalRow,
  evalRowToCsvLine,
} from '../../shared/tower-locate/geo.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function evalDir() {
  const override = process.env.TOWER_LOCATE_EVAL_DIR?.trim()
  if (override) return path.resolve(override)
  return path.join(__dirname, '..', '..', 'data', 'tower-locate-eval')
}

export function evalPaths() {
  const dir = evalDir()
  return {
    dir,
    jsonl: path.join(dir, 'comparisons.jsonl'),
    csv: path.join(dir, 'comparisons.csv'),
  }
}

export async function appendEvalRow(partial) {
  const paths = evalPaths()
  await mkdir(paths.dir, { recursive: true })

  const row = buildEvalRow({
    id: partial.id ?? `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  })

  await appendFile(paths.jsonl, `${JSON.stringify(row)}\n`, 'utf8')

  let csvExists = false
  try {
    await readFile(paths.csv, 'utf8')
    csvExists = true
  } catch {
    csvExists = false
  }
  if (!csvExists) {
    await writeFile(paths.csv, `${EVAL_CSV_HEADER}\n`, 'utf8')
  }
  await appendFile(paths.csv, `${evalRowToCsvLine(row)}\n`, 'utf8')

  return row
}

export async function listEvalRows(limit = 200) {
  const paths = evalPaths()
  try {
    const text = await readFile(paths.jsonl, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    const rows = lines.map((line) => JSON.parse(line))
    return rows.slice(-Math.max(1, Math.min(1000, limit))).reverse()
  } catch {
    return []
  }
}
