/**
 * Experiment routes: Gemini-assisted tower base suggestion + eval logging.
 */

import { Router } from 'express'
import { fetchSatelliteTileAround } from '../lib/mapboxSatelliteTile.js'
import {
  geminiConfigured,
  geminiModel,
  suggestTowerLocationWithGemini,
} from '../lib/geminiTowerLocate.js'
import { appendEvalRow, listEvalRows } from '../lib/towerLocateEvalStore.js'

const router = Router()

function validLatLon(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  )
}

router.get('/status', (_req, res) => {
  res.json({
    geminiConfigured: geminiConfigured(),
    model: geminiModel(),
    experiment: 'tower-locate-phase-a',
  })
})

/**
 * POST /api/tower-locate/suggest
 * Body: { towerPhotoBase64, priorLat, priorLon, halfSideNm?, humanLat?, humanLon?, missionId?, towerLabel?, notes?, logEval? }
 */
router.post('/suggest', async (req, res) => {
  if (!geminiConfigured()) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured. Add it to .env and restart the server.',
      doc: 'docs/GEMINI_TOWER_LOCATE_EXPERIMENT.md',
    })
    return
  }

  const {
    towerPhotoBase64,
    priorLat,
    priorLon,
    halfSideNm = 0.25,
    humanLat,
    humanLon,
    missionId,
    towerLabel,
    notes,
    logEval = false,
  } = req.body ?? {}

  const pLat = Number(priorLat)
  const pLon = Number(priorLon)
  if (!towerPhotoBase64 || typeof towerPhotoBase64 !== 'string') {
    res.status(400).json({ error: 'towerPhotoBase64 is required' })
    return
  }
  if (!validLatLon(pLat, pLon)) {
    res.status(400).json({ error: 'priorLat/priorLon must be valid WGS-84 coordinates' })
    return
  }
  const half = Number(halfSideNm)
  if (!Number.isFinite(half) || half <= 0 || half > 2) {
    res.status(400).json({ error: 'halfSideNm must be between 0 and 2 NM' })
    return
  }

  try {
    const tile = await fetchSatelliteTileAround(pLat, pLon, {
      halfSideNm: half,
      width: 640,
      height: 640,
    })

    const suggestion = await suggestTowerLocationWithGemini({
      towerPhotoBase64,
      satellitePngBase64: tile.pngBase64,
      priorLat: pLat,
      priorLon: pLon,
      halfSideNm: tile.halfSideNm,
      tileWidth: tile.width,
      tileHeight: tile.height,
    })

    let evalRow = null
    const hLat = Number(humanLat)
    const hLon = Number(humanLon)
    if (logEval && validLatLon(hLat, hLon)) {
      evalRow = await appendEvalRow({
        missionId,
        towerLabel,
        priorLat: pLat,
        priorLon: pLon,
        humanLat: hLat,
        humanLon: hLon,
        geminiLat: suggestion.lat,
        geminiLon: suggestion.lon,
        confidence: suggestion.confidence,
        model: suggestion.model,
        imagerySource: 'mapbox-satellite-streets-v12',
        notes: notes ?? '',
        rawReason: suggestion.reason,
      })
    }

    res.json({
      suggestion: {
        lat: suggestion.lat,
        lon: suggestion.lon,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        padVisibleOnMap: suggestion.padVisibleOnMap,
        pixelX: suggestion.pixelX,
        pixelY: suggestion.pixelY,
        model: suggestion.model,
      },
      prior: { lat: pLat, lon: pLon, halfSideNm: tile.halfSideNm },
      tile: { width: tile.width, height: tile.height },
      evalRow,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('tower-locate suggest:', msg)
    res.status(502).json({ error: msg })
  }
})

router.get('/eval', async (req, res) => {
  const limit = req.query.limit != null ? Number(req.query.limit) : 100
  try {
    const rows = await listEvalRows(limit)
    res.json({ rows, count: rows.length })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export function createTowerLocateRouter() {
  return router
}
