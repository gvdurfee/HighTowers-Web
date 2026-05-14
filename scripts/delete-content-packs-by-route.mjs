#!/usr/bin/env node
/**
 * Delete content packs (DB rows + per-pack baseline ZIP directories) for a
 * given MTR route number. Useful when cleaning up after exploratory uploads.
 *
 * Usage:
 *   node scripts/delete-content-packs-by-route.mjs --route 112              # dry-run
 *   node scripts/delete-content-packs-by-route.mjs --route 112 --yes        # really delete
 *   node scripts/delete-content-packs-by-route.mjs --all --yes              # nuke everything
 *
 * The script uses the same DB path resolution as the running server (so
 * `CONTENT_PACK_DATA_DIR` / `CONTENT_PACK_DB_PATH` env vars are honored),
 * and relies on `ON DELETE CASCADE` to remove waypoint and revision rows.
 *
 * Safe to run while the dev server is up — better-sqlite3 + WAL mode allow
 * concurrent writes from a second process — but the server keeps a cached
 * `_db` handle, so any in-flight request that reads the deleted packs may
 * still see them until completion.
 */
import fs from 'fs/promises'
import path from 'path'
import {
  getContentPackDb,
  defaultDataRoot,
} from '../server/lib/contentPackDb.js'

function parseArgs(argv) {
  const args = { route: null, all: false, yes: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--route') args.route = String(argv[++i] ?? '').trim()
    else if (a === '--all') args.all = true
    else if (a === '--yes' || a === '-y') args.yes = true
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/delete-content-packs-by-route.mjs ' +
          '[--route NN | --all] [--yes]'
      )
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      process.exit(2)
    }
  }
  if (!args.all && !args.route) {
    console.error('Provide --route NN or --all.')
    process.exit(2)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const db = getContentPackDb()

  const rows = args.all
    ? db
        .prepare(
          `SELECT id, name, primary_route_number, current_revision FROM content_pack ORDER BY updated_at DESC`
        )
        .all()
    : db
        .prepare(
          `SELECT id, name, primary_route_number, current_revision FROM content_pack
           WHERE primary_route_number = ? ORDER BY updated_at DESC`
        )
        .all(args.route)

  if (rows.length === 0) {
    console.log(
      args.all
        ? 'No packs in the database.'
        : `No packs match primary_route_number = ${args.route}.`
    )
    return
  }

  const target = args.all ? 'all packs' : `route ${args.route}`
  console.log(`\nFound ${rows.length} pack(s) for ${target}:`)
  for (const r of rows) {
    console.log(
      `  - ${r.id}  rev ${r.current_revision}  route=${r.primary_route_number ?? '—'}  "${r.name}"`
    )
  }

  if (!args.yes) {
    console.log('\nDry-run. Re-run with --yes to actually delete the rows + baseline ZIPs.')
    return
  }

  const dataRoot = defaultDataRoot()
  const del = db.prepare('DELETE FROM content_pack WHERE id = ?')
  const tx = db.transaction((items) => {
    for (const it of items) del.run(it.id)
  })
  tx(rows)

  let removedDirs = 0
  for (const r of rows) {
    const dir = path.join(dataRoot, r.id)
    try {
      await fs.rm(dir, { recursive: true, force: true })
      removedDirs++
    } catch (e) {
      console.warn(`  ! could not remove ${dir}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(
    `\nDeleted ${rows.length} pack row(s) (waypoints + revisions cascaded) and ${removedDirs} baseline director(ies) from ${dataRoot}.`
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
