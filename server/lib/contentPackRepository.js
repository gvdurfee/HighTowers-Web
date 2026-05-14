import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'
import { getContentPackDb, defaultDataRoot } from './contentPackDb.js'
import {
  loadUserWaypointsCsvFromZipBuffer,
  pickUserWaypointsCsvPath,
  assertUserWaypointCsvBytesLookTextual,
  NAVDATA_USER_WP_RE,
  ZIP_ENTRY_USER_WP_RE,
  isIgnoredZipEntryPath,
} from '../../shared/content-pack-core/userWaypointsZipDiscovery.js'
import {
  CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED,
  normalizeZipEntryName,
} from '../../shared/content-pack-core/zipSniff.js'
import {
  decodeWaypointCsvBytes,
  parseForeFlightUserWaypointsCsv,
  stringifyForeFlightUserWaypointsCsv,
} from '../../shared/content-pack-core/foreflightUserWaypointsCsv.js'
import {
  assertForeFlightUserWaypointsShape,
  primaryRouteNumberFromCsvDoc,
} from '../../shared/content-pack-core/contentPackWaypoints.js'
import { applyAllMissionTowersToUserWaypointsCsvText } from '../../shared/content-pack-core/applyTowerToUserWaypointsCsv.js'

/**
 * Server-only fallback when fflate-based discovery rejects all entries
 * (e.g. ZIP64 size markers, uncommon compression). AdmZip reads the central
 * directory and decompresses individual entries, mirroring the browser fallback.
 *
 * @param {Buffer} buf
 * @returns {{ csvPath: string, csvText: string }}
 */
function loadUserWaypointsCsvFromZipBufferAdmZip(buf) {
  const zip = new AdmZip(buf)
  const map = new Map()
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const name = normalizeZipEntryName(entry.entryName)
    if (!name || name.endsWith('/')) continue
    if (name.startsWith('__MACOSX/')) continue
    if (name.split('/').some((seg) => seg.startsWith('._'))) continue
    const size = entry.header?.size
    if (typeof size === 'number' && size > CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED) continue
    let data
    try {
      data = entry.getData()
    } catch {
      continue
    }
    if (!data || data.length === 0 || data.length > CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED) continue
    map.set(name, new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  }
  const csvPath = pickUserWaypointsCsvPath(map)
  const csvBytes = csvPath ? map.get(csvPath) : undefined
  if (!csvPath || !csvBytes) {
    const hintPaths = [...map.keys()]
    throw new Error(
      'Could not find a ForeFlight user waypoints file in this ZIP (expected CSV text under navdata/, or any path ending in user_waypoints). ' +
        (hintPaths.length ? `Paths sniffed: ${hintPaths.slice(0, 28).join(', ')}` : 'No paths.')
    )
  }
  assertUserWaypointCsvBytesLookTextual(csvBytes, csvPath)
  return { csvPath, csvText: decodeWaypointCsvBytes(csvBytes) }
}

/** Try fflate fast path first; on miss, fall back to AdmZip (zip64-tolerant). */
function loadUserWaypointsCsvFromZipBufferWithFallback(buf) {
  try {
    return loadUserWaypointsCsvFromZipBuffer(buf)
  } catch (e) {
    try {
      return loadUserWaypointsCsvFromZipBufferAdmZip(buf)
    } catch (e2) {
      throw e2 instanceof Error ? e2 : e
    }
  }
}

const NON_ESSENTIAL_SAMPLE_LIMIT = 12

/**
 * Inspect a ForeFlight Content Pack ZIP and report entries that don't belong to
 * our minimal supported surface (manifest.json + navdata/user_waypoints.csv).
 *
 * We treat macOS metadata cruft (`__MACOSX/...`, `.DS_Store`, `._*`) as
 * harmless and ignore it here. The remainder is "non-essential" content like
 * `layers/*.kml`, `byop/*.pdf`, `navdata/*.kml` — perfectly valid ForeFlight
 * surface, but **scope-out** for this app, since ForeFlight already maintains
 * those on its own update cycle. We surface a non-blocking warning so the
 * uploading admin can decide whether to keep, strip, or republish.
 *
 * @param {Buffer} buf
 * @returns {{ count: number, totalBytes: number, samplePaths: string[] }}
 */
export function inspectZipForNonEssentialEntries(buf) {
  let count = 0
  let totalBytes = 0
  const samplePaths = []
  const zip = new AdmZip(buf)
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const name = normalizeZipEntryName(entry.entryName)
    if (!name || name.endsWith('/')) continue
    if (isIgnoredZipEntryPath(name)) continue
    if (/(^|\/)\.DS_Store$/i.test(name)) continue
    // Same notion of “the waypoint CSV” as ZIP discovery (NavData casing,
    // user_waypoints vs userwaypoints, optional extension, optional extra
    // path segments). Do not strip only the first path segment — that misses
    // valid packs and falsely flags `…/navdata/user_waypoints.csv` as “extra”.
    const isManifest = /(^|\/)manifest\.json$/i.test(name)
    const isUserWaypoints =
      NAVDATA_USER_WP_RE.test(name) || ZIP_ENTRY_USER_WP_RE.test(name)
    if (isManifest || isUserWaypoints) continue
    count++
    const size = typeof entry.header?.size === 'number' ? entry.header.size : 0
    totalBytes += size
    if (samplePaths.length < NON_ESSENTIAL_SAMPLE_LIMIT) {
      samplePaths.push(name)
    }
  }
  return { count, totalBytes, samplePaths }
}

/**
 * Build a brand-new minimal ForeFlight Content Pack as an in-memory ZIP
 * buffer. The result contains exactly two real entries:
 *
 *   <rootDir>/manifest.json
 *   <rootDir>/navdata/user_waypoints.csv   (header only, no data rows)
 *
 * Used by the "Create empty pack for a new route" admin flow so a route can be
 * registered before any tower has been observed. The first crew that flies the
 * route applies their towers and the CSV grows from there.
 *
 * @param {object} opts
 * @param {string} opts.routeNumber          - Numeric MTR route prefix, e.g. "355".
 * @param {string} [opts.displayName]        - Manifest `name`. Defaults to "IR{route} Reported Towers".
 * @param {string} [opts.organizationName]   - Manifest `organizationName`. Defaults to "ForeFlight".
 * @param {string} [opts.abbreviation]       - Manifest `abbreviation`. Defaults to "IR{route}.V1".
 * @param {number} [opts.manifestVersion]    - Manifest `version`. Defaults to 1.0.
 * @returns {{ buf: Buffer, rootDir: string, csvMemberPath: string }}
 */
export function synthesizeMinimalContentPackBuffer(opts) {
  const routeNumber = String(opts.routeNumber ?? '').trim()
  if (!/^\d+$/.test(routeNumber)) {
    throw new Error('routeNumber must be a non-empty numeric string (e.g. "112", "355")')
  }
  const safeRoute = routeNumber
  const displayName = (opts.displayName?.trim() || `IR${safeRoute} Reported Towers`).slice(0, 120)
  const abbreviation = (opts.abbreviation?.trim() || `IR${safeRoute}.V1`).slice(0, 32)
  const organizationName = (opts.organizationName?.trim() || 'ForeFlight').slice(0, 120)
  const manifestVersion = Number.isFinite(opts.manifestVersion) ? Number(opts.manifestVersion) : 1.0

  // Use the same rootDir convention as the user's existing packs.
  const rootDir = `IR${safeRoute}_content_pack`
  const manifest = {
    name: displayName,
    abbreviation,
    version: manifestVersion,
    organizationName,
  }
  // Match the 7-column header shape ("WAYPOINT_NAME,Waypoint description,Latitude,Longitude,Elevation,,")
  // that the user's other packs use, so the CSV writer/reader round-trips identically.
  const csvHeader = 'WAYPOINT_NAME,Waypoint description,Latitude,Longitude,Elevation,,\n'

  const zip = new AdmZip()
  zip.addFile(`${rootDir}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 4), 'utf8'))
  zip.addFile(`${rootDir}/navdata/user_waypoints.csv`, Buffer.from(csvHeader, 'utf8'))
  return {
    buf: zip.toBuffer(),
    rootDir,
    csvMemberPath: `${rootDir}/navdata/user_waypoints.csv`,
  }
}

function nowIso() {
  return new Date().toISOString()
}

function packDir(packId) {
  return path.join(defaultDataRoot(), packId)
}

function baselineZipPath(packId) {
  return path.join(packDir(packId), 'baseline.zip')
}

function docFromPackRow(pack, rows) {
  const header = JSON.parse(pack.header_json)
  const lineEnding = pack.line_ending === '\r\n' ? '\r\n' : '\n'
  const bodyRows = rows.map((r) => JSON.parse(r.cells_json))
  return { header, rows: bodyRows, lineEnding }
}

function getCsvTextForPack(pack, waypointRows) {
  const doc = docFromPackRow(pack, waypointRows)
  return stringifyForeFlightUserWaypointsCsv(doc)
}

/**
 * One-shot migration: derive `primary_route_number` for any pack that pre-dates
 * the column. Safe to call repeatedly; only updates rows where the value is
 * NULL. Uses the same shared helper as upload/apply so behavior stays in sync.
 *
 * @returns {{ scanned: number, updated: number }}
 */
export function backfillPrimaryRouteNumbers() {
  const db = getContentPackDb()
  const packs = db
    .prepare(
      `SELECT id, header_json, line_ending FROM content_pack WHERE primary_route_number IS NULL`
    )
    .all()
  let updated = 0
  const upd = db.prepare('UPDATE content_pack SET primary_route_number = ? WHERE id = ?')
  const selWps = db.prepare(
    'SELECT cells_json FROM content_pack_waypoint WHERE pack_id = ? ORDER BY row_order ASC'
  )
  for (const p of packs) {
    let header
    try {
      header = JSON.parse(p.header_json)
    } catch {
      continue
    }
    const wps = selWps.all(p.id)
    const rows = []
    for (const w of wps) {
      try {
        rows.push(JSON.parse(w.cells_json))
      } catch {
        /* skip corrupt row */
      }
    }
    const lineEnding = p.line_ending === '\r\n' ? '\r\n' : '\n'
    const prn = primaryRouteNumberFromCsvDoc({ header, rows, lineEnding })
    if (prn) {
      upd.run(prn, p.id)
      updated++
    }
  }
  return { scanned: packs.length, updated }
}

export function listContentPacks() {
  const db = getContentPackDb()
  return db
    .prepare(
      `SELECT id, name, created_at, updated_at, current_revision, csv_member_path,
              primary_route_number
       FROM content_pack ORDER BY updated_at DESC`
    )
    .all()
}

export function getContentPackById(id) {
  const db = getContentPackDb()
  return db.prepare('SELECT * FROM content_pack WHERE id = ?').get(id) ?? null
}

export function getWaypointRows(packId) {
  const db = getContentPackDb()
  return db
    .prepare(
      `SELECT row_order, cells_json FROM content_pack_waypoint WHERE pack_id = ? ORDER BY row_order ASC`
    )
    .all(packId)
}

export function listRevisions(packId) {
  const db = getContentPackDb()
  return db
    .prepare(
      `SELECT id, pack_id, rev, created_at, created_by, apply_summary_json
       FROM content_pack_revision WHERE pack_id = ? ORDER BY rev DESC`
    )
    .all(packId)
}

function saveDocTransaction(db, packId, doc) {
  db.prepare('DELETE FROM content_pack_waypoint WHERE pack_id = ?').run(packId)
  const ins = db.prepare(
    'INSERT INTO content_pack_waypoint (pack_id, row_order, cells_json) VALUES (?, ?, ?)'
  )
  for (let i = 0; i < doc.rows.length; i++) {
    ins.run(packId, i, JSON.stringify(doc.rows[i]))
  }
  const le = doc.lineEnding === '\r\n' ? '\r\n' : '\n'
  db.prepare('UPDATE content_pack SET header_json = ?, line_ending = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(doc.header),
    le,
    nowIso(),
    packId
  )
}

/**
 * Insert a new pack into the DB given a baseline ZIP buffer that we will
 * persist as `baseline.zip`. Centralizes the transactional path so the upload
 * and create-from-scratch entry points can share it.
 *
 * @param {object} opts
 * @param {Buffer} opts.baselineBuf
 * @param {string} opts.csvPath        - ZIP entry path of the user_waypoints CSV (e.g. "IR355_content_pack/navdata/user_waypoints.csv")
 * @param {{ header: string[], rows: string[][], lineEnding: string }} opts.doc
 * @param {string} opts.name
 * @param {string} [opts.createdBy]
 * @param {string|null} opts.primaryRouteNumber
 * @param {{ kind: string, [k: string]: unknown }} opts.revSummary
 * @returns {Promise<object>} the inserted pack row
 */
async function insertContentPackFromBaselineBuffer(opts) {
  const id = crypto.randomUUID()
  await fs.mkdir(packDir(id), { recursive: true })
  await fs.writeFile(baselineZipPath(id), opts.baselineBuf)

  const db = getContentPackDb()
  const t = db.transaction(() => {
    const le = opts.doc.lineEnding === '\r\n' ? '\r\n' : '\n'
    db.prepare(
      `INSERT INTO content_pack (
        id, name, created_at, updated_at, created_by, current_revision,
        csv_member_path, header_json, line_ending, primary_route_number
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).run(
      id,
      opts.name,
      nowIso(),
      nowIso(),
      opts.createdBy ?? null,
      opts.csvPath,
      JSON.stringify(opts.doc.header),
      le,
      opts.primaryRouteNumber ?? null
    )
    saveDocTransaction(db, id, opts.doc)
    const revId = crypto.randomUUID()
    db.prepare(
      `INSERT INTO content_pack_revision (id, pack_id, rev, created_at, created_by, apply_summary_json)
       VALUES (?, ?, 1, ?, ?, ?)`
    ).run(revId, id, nowIso(), opts.createdBy ?? null, JSON.stringify(opts.revSummary))
  })
  t()
  return getContentPackById(id)
}

/**
 * @param {object} opts
 * @param {string} opts.tmpZipPath - multer temp path
 * @param {string} opts.originalFilename
 * @param {string} [opts.name] display name
 * @param {string} [opts.createdBy]
 * @returns {Promise<{ pack: object, nonEssential: { count: number, totalBytes: number, samplePaths: string[] } }>}
 */
export async function createPackFromUploadedZip(opts) {
  const buf = await fs.readFile(opts.tmpZipPath)
  const { csvPath, csvText } = loadUserWaypointsCsvFromZipBufferWithFallback(buf)
  const doc = parseForeFlightUserWaypointsCsv(csvText)
  assertForeFlightUserWaypointsShape(doc)

  const name =
    (opts.name && String(opts.name).trim()) ||
    path.basename(opts.originalFilename || 'content-pack', '.zip') ||
    `Pack ${crypto.randomUUID().slice(0, 8)}`

  const primaryRouteNumber = primaryRouteNumberFromCsvDoc(doc)
  const nonEssential = inspectZipForNonEssentialEntries(buf)

  const pack = await insertContentPackFromBaselineBuffer({
    baselineBuf: buf,
    csvPath,
    doc,
    name,
    createdBy: opts.createdBy,
    primaryRouteNumber,
    revSummary: { kind: 'upload', csvPath },
  })
  return { pack, nonEssential }
}

/**
 * Create a brand-new content pack from scratch for a route that has no prior
 * tower data. Synthesizes a minimal 2-entry baseline (`manifest.json` +
 * header-only `user_waypoints.csv`) and registers it in the DB.
 *
 * The first apply against this pack will append the mission's towers as
 * `{routeNumber}A`, `{routeNumber}B`, … using the route number stored here
 * (since the empty CSV cannot derive it on its own).
 *
 * @param {object} opts
 * @param {string} opts.routeNumber
 * @param {string} [opts.displayName]
 * @param {string} [opts.organizationName]
 * @param {string} [opts.abbreviation]
 * @param {string} [opts.createdBy]
 * @returns {Promise<{ pack: object }>}
 */
export async function createPackFromScratch(opts) {
  const { buf, csvMemberPath } = synthesizeMinimalContentPackBuffer({
    routeNumber: opts.routeNumber,
    displayName: opts.displayName,
    organizationName: opts.organizationName,
    abbreviation: opts.abbreviation,
  })
  const { csvText } = loadUserWaypointsCsvFromZipBufferWithFallback(buf)
  const doc = parseForeFlightUserWaypointsCsv(csvText)
  assertForeFlightUserWaypointsShape(doc)

  const displayName = opts.displayName?.trim() || `IR${String(opts.routeNumber).trim()} Reported Towers`

  const pack = await insertContentPackFromBaselineBuffer({
    baselineBuf: buf,
    csvPath: csvMemberPath,
    doc,
    name: displayName,
    createdBy: opts.createdBy,
    primaryRouteNumber: String(opts.routeNumber).trim(),
    revSummary: { kind: 'create-empty', csvPath: csvMemberPath, routeNumber: String(opts.routeNumber).trim() },
  })
  return { pack }
}

/**
 * Permanently remove a content pack (SQLite row + cascaded waypoints/revisions)
 * and delete its `data/content-packs/<id>/` baseline directory. Admin-only.
 *
 * @param {string} packId
 * @returns {{ ok: true } | { error: 'not_found' }}
 */
export async function deleteContentPackById(packId) {
  const id = String(packId ?? '').trim()
  if (!id) return { error: 'not_found' }
  const pack = getContentPackById(id)
  if (!pack) return { error: 'not_found' }

  const db = getContentPackDb()
  db.prepare('DELETE FROM content_pack WHERE id = ?').run(id)
  await fs.rm(packDir(id), { recursive: true, force: true }).catch(() => {})
  return { ok: true }
}

export function getPackExportDetail(packId) {
  const pack = getContentPackById(packId)
  if (!pack) return null
  const wps = getWaypointRows(packId)
  const csvText = getCsvTextForPack(pack, wps)
  return { pack, csvText, csvMemberPath: pack.csv_member_path, baselinePath: baselineZipPath(packId) }
}

export function previewApplyContentPack(packId, body) {
  const pack = getContentPackById(packId)
  if (!pack) return { error: 'not_found', message: 'Pack not found' }
  const wps = getWaypointRows(packId)
  const csvText = getCsvTextForPack(pack, wps)
  const routeNumber = body.routeNumber != null ? String(body.routeNumber).trim() || null : null
  const towers = Array.isArray(body.towers) ? body.towers : []
  const cum = applyAllMissionTowersToUserWaypointsCsvText({
    csvText,
    towers: towers.map((t) => ({
      lat: Number(t.lat),
      lon: Number(t.lon),
      groundElevationFt: t.groundElevationFt != null ? Number(t.groundElevationFt) : undefined,
    })),
    routeNumber,
    thresholdM: body.thresholdM != null ? Number(body.thresholdM) : undefined,
  })
  if (!cum.ok) {
    return { error: cum.reason, message: cum.message }
  }
  return {
    ok: true,
    currentRevision: pack.current_revision,
    pendingCsvText: cum.pendingCsvText,
    items: cum.items,
    appendedCount: cum.appendedCount,
    refinedCount: cum.refinedCount,
    unchangedCount: cum.unchangedCount,
    blockedCount: cum.blockedCount,
  }
}

export function commitApplyContentPack(packId, body) {
  const pack = getContentPackById(packId)
  if (!pack) return { error: 'not_found', message: 'Pack not found' }
  const expected = Number(body.expectedRevision)
  if (!Number.isFinite(expected) || expected !== pack.current_revision) {
    return {
      error: 'revision_conflict',
      message: `Expected revision ${pack.current_revision}, got ${body.expectedRevision}`,
      currentRevision: pack.current_revision,
    }
  }
  const wps = getWaypointRows(packId)
  const csvText = getCsvTextForPack(pack, wps)
  const routeNumber = body.routeNumber != null ? String(body.routeNumber).trim() || null : null
  const towers = Array.isArray(body.towers) ? body.towers : []
  const cum = applyAllMissionTowersToUserWaypointsCsvText({
    csvText,
    towers: towers.map((t) => ({
      lat: Number(t.lat),
      lon: Number(t.lon),
      groundElevationFt: t.groundElevationFt != null ? Number(t.groundElevationFt) : undefined,
    })),
    routeNumber,
    thresholdM: body.thresholdM != null ? Number(body.thresholdM) : undefined,
  })
  if (!cum.ok) {
    return { error: cum.reason, message: cum.message }
  }

  const newDoc = parseForeFlightUserWaypointsCsv(cum.pendingCsvText)
  assertForeFlightUserWaypointsShape(newDoc)

  const db = getContentPackDb()
  const nextRev = pack.current_revision + 1
  const summary = {
    kind: 'apply',
    appendedCount: cum.appendedCount,
    refinedCount: cum.refinedCount,
    unchangedCount: cum.unchangedCount,
    blockedCount: cum.blockedCount,
    items: cum.items,
  }

  const newPrimaryRouteNumber = primaryRouteNumberFromCsvDoc(newDoc)

  const t = db.transaction(() => {
    saveDocTransaction(db, packId, newDoc)
    db.prepare(
      'UPDATE content_pack SET current_revision = ?, updated_at = ?, primary_route_number = ? WHERE id = ?'
    ).run(nextRev, nowIso(), newPrimaryRouteNumber, packId)
    db.prepare(
      `INSERT INTO content_pack_revision (id, pack_id, rev, created_at, created_by, apply_summary_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      packId,
      nextRev,
      nowIso(),
      body.createdBy ?? null,
      JSON.stringify(summary)
    )
  })
  t()

  const updated = getContentPackById(packId)
  return {
    ok: true,
    pack: updated,
    summary,
    pendingCsvText: cum.pendingCsvText,
  }
}
