#!/usr/bin/env node
/**
 * Bulk-upload every ForeFlight content-pack `.zip` in a directory to the
 * server's Content Pack API. Uses PIN login for an admin bearer token, then
 * sends each file as multipart `file` (optional `name` = display name).
 *
 * Usage:
 *   node scripts/bulk-import-content-packs.mjs --dir ./packs \
 *     [--api http://localhost:3001] [--api-key <key>] [--pin <pin>] [--yes] [--dry-run]
 *
 * Credentials default from env when flags are omitted:
 *   CONTENT_PACK_API_KEY, CONTENT_PACK_ADMIN_PIN
 *
 * Exits non-zero if any upload fails. `--dry-run` lists planned uploads only
 * (no PIN login, no HTTP uploads). A missing or invalid `--dir` exits before
 * credential checks.
 */
import fs from 'fs/promises'
import path from 'path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

/**
 * @typedef {{ dir: string, api: string, apiKey: string, pin: string, yes: boolean, dryRun: boolean }} CliArgs
 */

function parseArgs(argv) {
  const args = {
    dir: '',
    api: 'http://localhost:3001',
    apiKey: '',
    pin: '',
    yes: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') args.dir = String(argv[++i] ?? '').trim()
    else if (a === '--api') args.api = String(argv[++i] ?? '').trim()
    else if (a === '--api-key') args.apiKey = String(argv[++i] ?? '').trim()
    else if (a === '--pin') args.pin = String(argv[++i] ?? '').trim()
    else if (a === '--yes' || a === '-y') args.yes = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/bulk-import-content-packs.mjs --dir <path> ' +
          '[--api http://localhost:3001] [--api-key <key>] [--pin <pin>] [--yes] [--dry-run]'
      )
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      process.exit(2)
    }
  }
  if (!args.dir) {
    console.error('--dir is required.')
    process.exit(2)
  }
  return args
}

/**
 * @param {string} base
 */
function normalizeApiBase(base) {
  return base.replace(/\/+$/, '')
}

/**
 * @param {import('fs').Dirent} ent
 */
function isEligibleZipEntry(ent) {
  if (!ent.isFile()) return false
  const name = ent.name
  if (name.startsWith('.')) return false
  if (name.startsWith('._')) return false
  if (name.toLowerCase().endsWith('.zip')) return true
  return false
}

/**
 * @param {string} dirAbs
 * @returns {Promise<string[]>} basenames sorted lexicographically
 */
async function listZipBasenames(dirAbs) {
  const ents = await fs.readdir(dirAbs, { withFileTypes: true })
  const names = ents.filter(isEligibleZipEntry).map((e) => e.name)
  names.sort((a, b) => a.localeCompare(b))
  return names
}

/**
 * @param {Response} res
 */
async function readErrorMessage(res) {
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    try {
      const j = await res.json()
      if (j && typeof j.message === 'string') return j.message
      if (j && typeof j.error === 'string') return j.error
    } catch {
      /* fall through */
    }
  }
  const t = await res.text()
  return t.trim() || `HTTP ${res.status}`
}

/**
 * @param {string} apiBase
 * @param {string} pin
 */
async function adminLogin(apiBase, pin) {
  const url = `${apiBase}/api/admin/login`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(`${res.status} ${msg}`)
  }
  const data = await res.json()
  if (!data || typeof data.token !== 'string') {
    throw new Error('login response missing token')
  }
  return data.token
}

/**
 * @param {object} opts
 * @param {string} opts.apiBase
 * @param {string} opts.apiKey
 * @param {string} opts.adminToken
 * @param {string} opts.zipPath
 * @param {string} opts.displayName
 */
async function uploadOneZip(opts) {
  const buf = await fs.readFile(opts.zipPath)
  const blob = new Blob([buf])
  const form = new FormData()
  const basename = path.basename(opts.zipPath)
  form.append('file', blob, basename)
  form.append('name', opts.displayName)

  const res = await fetch(`${opts.apiBase}/api/content-packs`, {
    method: 'POST',
    headers: {
      'X-API-Key': opts.apiKey,
      Authorization: `Bearer ${opts.adminToken}`,
    },
    body: form,
  })

  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(`${res.status} ${msg}`)
  }
  return res.json()
}

/**
 * @param {unknown} pack
 */
function packRoute(pack) {
  if (!pack || typeof pack !== 'object') return null
  const p = /** @type {Record<string, unknown>} */ (pack)
  const n = p.primary_route_number ?? p.primaryRouteNumber
  return n != null && String(n).trim() ? String(n).trim() : null
}

/**
 * @param {unknown} pack
 */
function packRev(pack) {
  if (!pack || typeof pack !== 'object') return null
  const p = /** @type {Record<string, unknown>} */ (pack)
  const r = p.current_revision ?? p.currentRevision
  return typeof r === 'number' && Number.isFinite(r) ? r : null
}

/**
 * @param {unknown} pack
 */
function packName(pack) {
  if (!pack || typeof pack !== 'object') return ''
  const p = /** @type {Record<string, unknown>} */ (pack)
  return typeof p.name === 'string' ? p.name : ''
}

/**
 * @param {unknown} pack
 */
function packId(pack) {
  if (!pack || typeof pack !== 'object') return ''
  const p = /** @type {Record<string, unknown>} */ (pack)
  return typeof p.id === 'string' ? p.id : ''
}

async function main() {
  const args = /** @type {CliArgs} */ (parseArgs(process.argv.slice(2)))
  const apiBase = normalizeApiBase(args.api)

  let st
  try {
    st = await fs.stat(args.dir)
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      console.error(`Directory not found: ${args.dir}`)
      process.exit(2)
    }
    throw e
  }
  if (!st.isDirectory()) {
    console.error(`Not a directory: ${args.dir}`)
    process.exit(2)
  }

  const apiKey = args.apiKey || process.env.CONTENT_PACK_API_KEY?.trim() || ''
  if (!apiKey) {
    console.error('Content Pack API key required: pass --api-key or set CONTENT_PACK_API_KEY.')
    process.exit(2)
  }

  const pin = args.pin || process.env.CONTENT_PACK_ADMIN_PIN?.trim() || ''
  if (!pin) {
    console.error('Admin PIN required: pass --pin or set CONTENT_PACK_ADMIN_PIN.')
    process.exit(2)
  }

  const dirAbs = path.resolve(args.dir)
  const basenames = await listZipBasenames(dirAbs)

  if (basenames.length === 0) {
    console.log(`No .zip files found in ${dirAbs}`)
    return
  }

  console.log(`API base: ${apiBase}`)
  console.log(`Found ${basenames.length} pack(s) in ${dirAbs}:`)
  for (const b of basenames) {
    const disp = path.basename(b, '.zip')
    console.log(`  - ${b}  (display name: ${disp})`)
  }

  if (args.dryRun) {
    console.log('\nDry-run: no login and no uploads performed.')
    return
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input, output })
    try {
      const ans = await rl.question(
        `\nUpload ${basenames.length} pack(s) to ${apiBase}? Type yes to continue: `
      )
      if (String(ans).trim().toLowerCase() !== 'yes') {
        console.log('Aborted.')
        return
      }
    } finally {
      rl.close()
    }
  }

  let adminToken
  try {
    adminToken = await adminLogin(apiBase, pin)
  } catch (e) {
    console.error(`PIN login failed: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }

  /** @type {{ file: string, status: string, id8: string, route: string, extra: string, err?: string }[]} */
  const rows = []

  for (const b of basenames) {
    const zipPath = path.join(dirAbs, b)
    const displayName = path.basename(b, path.extname(b))
    try {
      const body = await uploadOneZip({
        apiBase,
        apiKey,
        adminToken,
        zipPath,
        displayName,
      })
      const pack = body?.pack
      const ne = body?.nonEssential
      const count = ne && typeof ne.count === 'number' ? ne.count : 0
      const rev = packRev(pack) ?? '?'
      const route = packRoute(pack) ?? '—'
      const disp = packName(pack) || displayName
      const extraLabel = `${count} extra file(s)`
      console.log(`OK | ${disp} | rev ${rev} | route ${route} | ${extraLabel}`)
      rows.push({
        file: b,
        status: 'OK',
        id8: packId(pack).slice(0, 8),
        route: String(route),
        extra: String(count),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`FAIL | ${b} | ${msg}`)
      rows.push({
        file: b,
        status: 'FAIL',
        id8: '—',
        route: '—',
        extra: '—',
        err: msg,
      })
    }
  }

  const wFile = Math.max(8, ...rows.map((r) => r.file.length))
  const wStat = 6
  const wId = 10
  const wRoute = 8
  const wExtra = 6
  console.log('\n--- summary ---')
  console.log(
    `${'filename'.padEnd(wFile)}  ${'status'.padEnd(wStat)}  ${'pack id'.padEnd(wId)}  ${'route'.padEnd(wRoute)}  ${'non-ess.'.padEnd(wExtra)}`
  )
  console.log(
    `${'-'.repeat(wFile)}  ${'-'.repeat(wStat)}  ${'-'.repeat(wId)}  ${'-'.repeat(wRoute)}  ${'-'.repeat(wExtra)}`
  )
  for (const r of rows) {
    console.log(
      `${r.file.padEnd(wFile)}  ${r.status.padEnd(wStat)}  ${r.id8.padEnd(wId)}  ${r.route.padEnd(wRoute)}  ${r.extra.padEnd(wExtra)}`
    )
  }

  const anyFail = rows.some((r) => r.status === 'FAIL')
  if (anyFail) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
