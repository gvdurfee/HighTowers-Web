/**
 * FAA NASR MTR Backend
 * Downloads MTR_PT.csv from the current 28-day NASR cycle and returns waypoints for IR/VR routes.
 * SR routes fall back to ArcGIS (not in FAA MTR CSV).
 */

import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createReadStream } from 'fs'
import { createWriteStream } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { parse } from 'csv-parse'
import fetch from 'node-fetch'
import path from 'path'
import { fileURLToPath } from 'url'
import { computeSquareBbox, fetchSentinel2TrueColorPng } from './sentinelHubImagery.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const app = express()

/** Comma-separated browser origins allowed to call this API (required for GitHub Pages + wing sites). */
function corsAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ]
}

app.use(
  cors({
    origin(origin, callback) {
      const allowed = corsAllowedOrigins()
      if (!origin) return callback(null, true)
      if (allowed.includes(origin)) return callback(null, true)
      callback(null, false)
    },
  })
)

app.use(express.json({ limit: '2mb' }))
const PORT = process.env.PORT ?? 3001

const NASR_INDEX_URL = 'https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/'

// Convert YYYY-MM-DD to DD_Mon_YYYY for MTR extra ZIP filename
function toMtrZipDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const day = String(d).padStart(2, '0')
  const mon = months[m - 1]
  return `${day}_${mon}_${y}`
}

// Compute fallback cycle date: most recent Thursday (NASR cycles are Thursdays)
function getFallbackCycleDate() {
  const d = new Date()
  const day = d.getDay() // 0=Sun, 4=Thu
  let diff = (day - 4 + 7) % 7
  if (diff > 0) diff -= 7 // go back to last Thu
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Parse NASR subscription index and extract current cycle date (YYYY-MM-DD)
async function getCurrentCycleDate() {
  const override = process.env.MTR_CYCLE_DATE
  if (override) return override.trim()

  try {
    const res = await fetch(NASR_INDEX_URL, {
      headers: { 'User-Agent': 'HighTowers-CAP/1.0 (MTR flight planning)' },
    })
    if (!res.ok) throw new Error(`FAA index error: ${res.status}`)
    const html = await res.text()

    // Current section contains the active cycle. Link format: .../NASR_Subscription/2026-02-19
    const currentIdx = html.indexOf('Current')
    if (currentIdx === -1) throw new Error('Could not find Current section')

    const afterCurrent = html.slice(currentIdx)
    const dateMatch = afterCurrent.match(/NASR_Subscription\/(\d{4})-(\d{2})-(\d{2})/)
    if (!dateMatch) throw new Error('Could not parse cycle date')

    const [, year, mm, dd] = dateMatch
    return `${year}-${mm}-${dd}`
  } catch (err) {
    // FAA may block server requests (403); use computed fallback
    const fallback = getFallbackCycleDate()
    console.warn('NASR index unavailable, using fallback cycle:', fallback, err?.message ?? err)
    return fallback
  }
}

// Download MTR CSV ZIP and return path to extracted MTR_PT.csv
async function downloadMtrCsv(effectiveDate) {
  const zipDate = toMtrZipDate(effectiveDate)
  const zipUrl = `https://nfdc.faa.gov/webContent/28DaySub/extra/${zipDate}_MTR_CSV.zip`

  const cacheDir = path.join(__dirname, '.mtr-cache')
  await mkdir(cacheDir, { recursive: true })

  let actualDate = effectiveDate
  let csvPath = path.join(cacheDir, `${actualDate}_MTR_PT.csv`)

  // If we have a cached file for this cycle, use it
  try {
    const { stat } = await import('fs/promises')
    const st = await stat(csvPath)
    if (st.size > 1000) return { csvPath, effectiveDate: actualDate }
  } catch {
    // No cache
  }

  let res = await fetch(zipUrl)
  if (!res.ok) {
    const [y, m, d] = effectiveDate.split('-').map(Number)
    const prev = new Date(y, m - 1, d - 28)
    actualDate = prev.toISOString().slice(0, 10)
    csvPath = path.join(cacheDir, `${actualDate}_MTR_PT.csv`)
    try {
      const st = await import('fs/promises').then(({ stat }) => stat(csvPath))
      if (st.size > 1000) return { csvPath, effectiveDate: actualDate }
    } catch {}
    const prevZipDate = toMtrZipDate(actualDate)
    const prevZipUrl = `https://nfdc.faa.gov/webContent/28DaySub/extra/${prevZipDate}_MTR_CSV.zip`
    res = await fetch(prevZipUrl)
  }
  if (!res.ok) throw new Error(`FAA MTR ZIP not found: ${zipUrl} (${res.status})`)

  const cacheKey = actualDate

  const zipPath = path.join(cacheDir, `${cacheKey}_MTR.zip`)
  const dest = createWriteStream(zipPath)
  await pipeline(res.body, dest)

  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(zipPath)
  const mtrPt = zip.getEntry('MTR_PT.csv')
  if (!mtrPt) throw new Error('MTR_PT.csv not found in ZIP')

  zip.extractEntryTo(mtrPt, cacheDir, false, true)
  const extractedPath = path.join(cacheDir, 'MTR_PT.csv')
  const { rename } = await import('fs/promises')
  await rename(extractedPath, csvPath)

  await unlink(zipPath).catch(() => {})
  return { csvPath, effectiveDate: actualDate }
}

// Parse MTR_PT.csv and return waypoints for a route
async function getWaypointsFromCsv(csvPath, routeType, routeNumber, entryLetter, exitLetter) {
  const routeId = String(routeNumber).trim()
  const rt = routeType.toUpperCase()

  const rows = []
  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true })
  )

  for await (const row of parser) {
    const rtc = (row.ROUTE_TYPE_CODE ?? '').replace(/"/g, '').trim()
    const rid = (row.ROUTE_ID ?? '').replace(/"/g, '').trim()
    if (rtc !== rt || rid !== routeId) continue

    const lat = parseFloat(row.LAT_DECIMAL)
    const lon = parseFloat(row.LONG_DECIMAL)
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue

    const ptId = (row.ROUTE_PT_ID ?? '').replace(/"/g, '').trim()
    const nextPt = (row.NEXT_ROUTE_PT_ID ?? '').replace(/"/g, '').trim()

    rows.push({
      ptIdent: ptId,
      nxPoint: nextPt,
      lat,
      lon,
      seq: parseInt(row.ROUTE_PT_SEQ, 10) || 0,
    })
  }

  if (rows.length === 0) return []

  rows.sort((a, b) => a.seq - b.seq)

  if (!entryLetter && !exitLetter) {
    return rows.map((r) => formatWaypoint(r, routeType, routeNumber))
  }

  const entry = (entryLetter ?? '').toUpperCase().trim()
  const exit = (exitLetter ?? '').toUpperCase().trim()
  if (!entry && !exit) return rows.map((r) => formatWaypoint(r, routeType, routeNumber))

  const byPt = new Map()
  for (const r of rows) {
    const key = r.ptIdent.trim()
    if (!byPt.has(key) || /^[A-Z]$/.test(key)) byPt.set(key, r)
  }

  const segment = []
  let cur = entry || rows[0]?.ptIdent
  const seen = new Set()

  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const rec = byPt.get(cur)
    if (!rec) break
    segment.push(rec)
    if (exit && cur === exit) break
    cur = rec.nxPoint?.trim() || null
  }

  return segment.map((r) => formatWaypoint(r, routeType, routeNumber))
}

function formatWaypoint(r, routeType, routeNumber) {
  const originalName = `${routeType}${routeNumber}-${r.ptIdent}`
  const g1000Name = toG1000Name(originalName)
  return {
    originalName,
    g1000Name,
    latitude: r.lat,
    longitude: r.lon,
    ptIdent: r.ptIdent,
    nxPoint: r.nxPoint,
  }
}

function toG1000Name(original) {
  const m = original.match(/^(IR|SR|VR)(\d+)-([A-Z0-9]+)$/i)
  if (!m) return original.slice(0, 8).replace(/[^A-Z0-9]/gi, '')
  const [, , num, suffix] = m
  return (suffix + num).slice(0, 8)
}

// In-memory cache: { effectiveDate, csvPath } to avoid re-downloading within same cycle
let cycleCache = null

app.get('/api/mtr/waypoints', async (req, res) => {
  const routeType = (req.query.routeType ?? 'IR').toUpperCase()
  const routeNumber = req.query.routeNumber ?? ''
  const entry = req.query.entry ?? ''
  const exit = req.query.exit ?? ''

  if (!['IR', 'VR'].includes(routeType)) {
    res.status(400).json({ error: 'FAA MTR CSV only has IR and VR routes. Use ArcGIS for SR.' })
    return
  }

  if (!routeNumber.trim()) {
    res.status(400).json({ error: 'routeNumber is required' })
    return
  }

  try {
    let effectiveDate = cycleCache?.effectiveDate
    let csvPath = cycleCache?.csvPath

    if (!csvPath) {
      effectiveDate = await getCurrentCycleDate()
      const result = await downloadMtrCsv(effectiveDate)
      csvPath = result.csvPath
      effectiveDate = result.effectiveDate
      cycleCache = { effectiveDate, csvPath }
    }

    const waypoints = await getWaypointsFromCsv(
      csvPath,
      routeType,
      routeNumber,
      entry,
      exit
    )

    res.json({
      effectiveDate,
      waypoints,
    })
  } catch (err) {
    console.error('MTR waypoints error:', err)
    res.status(500).json({
      error: err.message ?? 'Failed to fetch MTR waypoints',
    })
  }
})

// Health/cycle check - returns current NASR cycle date
app.get('/api/mtr/cycle', async (_req, res) => {
  try {
    const effectiveDate = await getCurrentCycleDate()
    res.json({ effectiveDate })
  } catch (err) {
    console.error('MTR cycle error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * Proxy Mapbox Static Images API — browser fetch() to api.mapbox.com is often blocked by CORS;
 * PDF export uses this route when the dev server (or any host that mounts this API) is running.
 * Uses the same token as the Vite app: VITE_MAPBOX_ACCESS_TOKEN or MAPBOX_ACCESS_TOKEN in .env.
 */
app.post('/api/mapbox-static', async (req, res) => {
  const token =
    process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || ''
  const placeholder = 'your_mapbox_token_here'
  if (!token || token === placeholder) {
    res.status(503).json({ error: 'Mapbox token not configured on server (.env)' })
    return
  }
  try {
    const {
      overlayPath,
      width = 1280,
      height = 720,
      style = 'mapbox/satellite-streets-v12',
    } = req.body ?? {}
    if (!overlayPath || typeof overlayPath !== 'string') {
      res.status(400).json({ error: 'overlayPath (string) required' })
      return
    }
    if (overlayPath.length > 12000) {
      res.status(400).json({ error: 'overlayPath too long' })
      return
    }
    const w = Math.min(1280, Math.max(200, Number(width) || 1280))
    const h = Math.min(1280, Math.max(200, Number(height) || 720))
    const url = `https://api.mapbox.com/styles/v1/${style}/static/${overlayPath}/auto/${w}x${h}?padding=80&attribution=false&logo=false&access_token=${token}`
    const mapRes = await fetch(url)
    if (!mapRes.ok) {
      const snippet = (await mapRes.text()).slice(0, 300)
      console.error('Mapbox static failed:', mapRes.status, snippet)
      res.status(502).json({ error: 'Mapbox static request failed', status: mapRes.status })
      return
    }
    const buf = Buffer.from(await mapRes.arrayBuffer())
    res.setHeader('Content-Type', mapRes.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(buf)
  } catch (err) {
    console.error('mapbox-static proxy:', err)
    res.status(500).json({ error: err?.message ?? 'proxy error' })
  }
})

// Recent Sentinel-2 imagery (Copernicus Data Space / Sentinel Hub Process API)
// @see ../docs/IMAGERY_OVERLAY_IMPLEMENTATION.md
app.get('/api/recent-imagery', async (req, res) => {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const halfMiles = req.query.halfMiles != null ? Number(req.query.halfMiles) : 0.5
  const width = req.query.w != null ? Number(req.query.w) : 1024
  const height = req.query.h != null ? Number(req.query.h) : 1024

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: 'Invalid or missing lat/lon' })
    return
  }
  if (!Number.isFinite(halfMiles) || halfMiles <= 0 || halfMiles > 5) {
    res.status(400).json({ error: 'halfMiles must be between 0 and 5' })
    return
  }

  try {
    const bbox = computeSquareBbox(lat, lon, halfMiles)
    const png = await fetchSentinel2TrueColorPng(bbox, {
      width: Number.isFinite(width) ? Math.min(1024, Math.max(256, width)) : 1024,
      height: Number.isFinite(height) ? Math.min(1024, Math.max(256, height)) : 1024,
    })
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(png)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('CDSE_OAUTH_CLIENT_ID')) {
      res.status(503).json({
        error: msg,
        doc: 'server/README.md (Copernicus OAuth)',
      })
      return
    }
    console.error('recent-imagery error:', msg)
    res.status(502).json({
      error: msg,
      doc: 'docs/IMAGERY_OVERLAY_IMPLEMENTATION.md',
    })
  }
})

app.listen(PORT, () => {
  console.log(`FAA MTR backend listening on port ${PORT}`)
})
