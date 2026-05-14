import express from 'express'
import multer from 'multer'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { mkdirSync } from 'fs'
import { contentPackAuth } from '../lib/contentPackAuth.js'
import { requireAdminToken } from '../lib/adminAuth.js'
import {
  listContentPacks,
  getContentPackById,
  getWaypointRows,
  listRevisions,
  createPackFromUploadedZip,
  createPackFromScratch,
  deleteContentPackById,
  getPackExportDetail,
  previewApplyContentPack,
  commitApplyContentPack,
  backfillPrimaryRouteNumbers,
} from '../lib/contentPackRepository.js'
import { buildExportZipBuffer } from '../lib/contentPackExport.js'
import { getContentPackDb } from '../lib/contentPackDb.js'

const uploadDest = path.join(os.tmpdir(), 'hightowers-content-pack-uploads')
mkdirSync(uploadDest, { recursive: true })
const upload = multer({
  dest: uploadDest,
  limits: { fileSize: 200 * 1024 * 1024 },
})

/**
 * Build the user-facing export ZIP filename from the pack's name
 * (which originates from the upload's Display Name, or the ZIP filename minus `.zip`).
 *
 * Strips characters that are illegal or annoying in filenames, collapses
 * whitespace, and falls back to a safe default when the result is empty.
 */
function exportZipFilename(pack) {
  const raw = (pack?.name ?? '').toString()
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const safe = cleaned || `foreflight-pack-${(pack?.id ?? 'unnamed').slice(0, 8)}`
  return `${safe}.zip`
}

export function createContentPacksRouter() {
  // Open the DB once at startup so the column migration runs before any
  // request hits, then backfill `primary_route_number` for legacy packs.
  try {
    getContentPackDb()
    const r = backfillPrimaryRouteNumbers()
    if (r.updated > 0) {
      console.log(
        `[content-pack] backfilled primary_route_number for ${r.updated}/${r.scanned} pack(s)`
      )
    }
  } catch (e) {
    console.error('[content-pack] startup migration failed:', e)
  }

  const router = express.Router()
  router.use(contentPackAuth)

  /** Ensure DB initialized */
  router.use((_req, _res, next) => {
    try {
      getContentPackDb()
      next()
    } catch (e) {
      next(e)
    }
  })

  router.get('/', (_req, res) => {
    res.json({ packs: listContentPacks() })
  })

  router.post('/', requireAdminToken, upload.single('file'), async (req, res) => {
    const f = req.file
    if (!f?.path) {
      res.status(400).json({ error: 'file_required', message: 'Multipart field “file” with a .zip is required' })
      return
    }
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : undefined
      const createdBy =
        typeof req.body?.createdBy === 'string'
          ? req.body.createdBy
          : req.admin?.name ?? undefined
      const { pack, nonEssential } = await createPackFromUploadedZip({
        tmpZipPath: f.path,
        originalFilename: f.originalname,
        name,
        createdBy,
      })
      await fs.unlink(f.path).catch(() => {})
      res.status(201).json({ pack, nonEssential })
    } catch (e) {
      await fs.unlink(f.path).catch(() => {})
      console.error('content-pack upload:', e)
      res.status(400).json({ error: 'upload_failed', message: e instanceof Error ? e.message : String(e) })
    }
  })

  /**
   * Admin-only: create a brand-new pack for a route that has no prior tower
   * data. Synthesizes a minimal 2-entry ForeFlight pack server-side.
   */
  router.post('/new', requireAdminToken, async (req, res) => {
    try {
      const routeNumber = String(req.body?.routeNumber ?? '').trim()
      if (!/^\d+$/.test(routeNumber)) {
        res.status(400).json({
          error: 'invalid_route_number',
          message: 'routeNumber must be a non-empty numeric string (e.g. "112", "355").',
        })
        return
      }
      const displayName =
        typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : undefined
      const organizationName =
        typeof req.body?.organizationName === 'string'
          ? req.body.organizationName.trim()
          : undefined
      const abbreviation =
        typeof req.body?.abbreviation === 'string' ? req.body.abbreviation.trim() : undefined
      const { pack } = await createPackFromScratch({
        routeNumber,
        displayName: displayName || undefined,
        organizationName: organizationName || undefined,
        abbreviation: abbreviation || undefined,
        createdBy: req.admin?.name ?? undefined,
      })
      res.status(201).json({ pack })
    } catch (e) {
      console.error('content-pack create-empty:', e)
      res.status(400).json({
        error: 'create_empty_failed',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

  router.get('/:id/revisions', (req, res) => {
    const pack = getContentPackById(req.params.id)
    if (!pack) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ revisions: listRevisions(req.params.id) })
  })

  router.get('/:id/export', (req, res) => {
    const detail = getPackExportDetail(req.params.id)
    if (!detail) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    try {
      const buf = buildExportZipBuffer({
        baselinePath: detail.baselinePath,
        csvMemberPath: detail.csvMemberPath,
        csvText: detail.csvText,
      })
      const filename = exportZipFilename(detail.pack)
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(buf)
    } catch (e) {
      console.error('content-pack export:', e)
      res.status(500).json({ error: 'export_failed', message: e instanceof Error ? e.message : String(e) })
    }
  })

  router.get('/:id', (req, res) => {
    const pack = getContentPackById(req.params.id)
    if (!pack) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const include = String(req.query.include ?? '')
    const out = { pack }
    if (include.includes('waypoints')) {
      const rows = getWaypointRows(req.params.id)
      out.waypoints = rows.map((r) => ({
        rowOrder: r.row_order,
        cells: JSON.parse(r.cells_json),
      }))
    }
    res.json(out)
  })

  router.post('/:id/preview-apply', (req, res) => {
    const result = previewApplyContentPack(req.params.id, req.body ?? {})
    if (result.error === 'not_found') {
      res.status(404).json(result)
      return
    }
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  router.post('/:id/apply', (req, res) => {
    const result = commitApplyContentPack(req.params.id, req.body ?? {})
    if (result.error === 'not_found') {
      res.status(404).json(result)
      return
    }
    if (result.error === 'revision_conflict') {
      res.status(409).json(result)
      return
    }
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  router.delete('/:id', requireAdminToken, async (req, res) => {
    const id = req.params.id
    if (id === 'new') {
      res.status(404).json({ error: 'not_found' })
      return
    }
    try {
      const result = await deleteContentPackById(id)
      if (result.error === 'not_found') {
        res.status(404).json({ error: 'not_found', message: 'Pack not found' })
        return
      }
      res.status(204).send()
    } catch (e) {
      console.error('content-pack delete:', e)
      res.status(500).json({
        error: 'delete_failed',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

  return router
}
