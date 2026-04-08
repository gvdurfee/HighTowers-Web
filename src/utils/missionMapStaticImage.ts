/**
 * Mapbox Static Images API — mission route + tower markers for PDF export.
 * Requires VITE_MAPBOX_ACCESS_TOKEN (same as Map View).
 *
 * Uses pin overlays for towers (shorter URLs than many GeoJSON points) and
 * no @2x suffix so dimensions stay within Mapbox limits (max 1280 per side).
 */
import { db } from '@/db/schema'
import type { AirportRecord, FlightPlanRecord, WaypointRecord } from '@/db/schema'
import { apiConfig, apiUrl, isMapboxConfigured } from '@/config/apiConfig'

const STYLE = 'mapbox/satellite-streets-v12'
/** Landscape; stay ≤1280 per Mapbox static API limits (no @2x). */
const IMG_W = 1280
const IMG_H = 720

function buildRouteCoordinates(
  departure: AirportRecord | null,
  waypoints: WaypointRecord[],
  destination: AirportRecord | null
): [number, number][] {
  const coords: [number, number][] = []
  if (departure) coords.push([departure.longitude, departure.latitude])
  for (const wp of [...waypoints].sort((a, b) => a.sequence - b.sequence)) {
    coords.push([wp.longitude, wp.latitude])
  }
  if (destination) coords.push([destination.longitude, destination.latitude])
  return coords
}

function roundCoord(n: number): string {
  return n.toFixed(5)
}

function isLikelyPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

function isLikelyJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function warnMapExport(msg: string): void {
  console.warn(`[HighTowers] Mission map PDF: ${msg}`)
}

/**
 * Build comma-separated static API overlay: optional route geojson + Mapbox pins for towers.
 */
function buildOverlayPath(
  routeCoords: [number, number][],
  towerPoints: { lon: number; lat: number }[]
): string {
  const parts: string[] = []
  if (routeCoords.length >= 2) {
    const lineFeature = {
      type: 'Feature',
      properties: {
        stroke: '#0E2B8D',
        'stroke-width': 4,
        'stroke-opacity': 0.95,
      },
      geometry: {
        type: 'LineString',
        coordinates: routeCoords,
      },
    }
    parts.push(`geojson(${encodeURIComponent(JSON.stringify(lineFeature))})`)
  }
  for (const p of towerPoints) {
    parts.push(`pin-s+db0029(${roundCoord(p.lon)},${roundCoord(p.lat)})`)
  }
  return parts.join(',')
}

function mapboxStaticUrl(overlayPath: string, width: number, height: number): string {
  const token = apiConfig.mapboxAccessToken
  return `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlayPath}/auto/${width}x${height}?padding=80&attribution=false&logo=false&access_token=${token}`
}

/** Load static map as PNG bytes via <img crossOrigin> + canvas (works when Mapbox sends CORS headers). */
function loadMapboxPngViaImage(url: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null)
              return
            }
            blob
              .arrayBuffer()
              .then((ab) => resolve(new Uint8Array(ab)))
              .catch(() => resolve(null))
          },
          'image/png',
          0.92
        )
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Mapbox static map bytes. Order: direct fetch (often blocked by CORS in browsers),
 * same-origin API proxy (run `npm run server` with VITE_MAPBOX_ACCESS_TOKEN in .env),
 * then image+canvas (when CORS allows image reads).
 */
async function fetchMapboxStaticPng(
  overlayPath: string,
  width = IMG_W,
  height = IMG_H
): Promise<Uint8Array | null> {
  const directUrl = mapboxStaticUrl(overlayPath, width, height)

  try {
    const res = await fetch(directUrl)
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (isLikelyPng(bytes) || isLikelyJpeg(bytes)) return bytes
      warnMapExport(
        'Direct Mapbox response was not a PNG/JPEG (token or URL issue). Trying API proxy…'
      )
    } else {
      warnMapExport(`Direct Mapbox HTTP ${res.status} (often CORS in the browser). Trying API proxy…`)
    }
  } catch {
    warnMapExport('Direct Mapbox fetch failed (usually CORS). Trying API proxy (/api/mapbox-static)…')
  }

  try {
    const res = await fetch(apiUrl('/api/mapbox-static'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overlayPath,
        width,
        height,
        style: STYLE,
      }),
    })
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (res.ok && (isLikelyPng(bytes) || isLikelyJpeg(bytes))) {
      return bytes
    }
    if (!res.ok) {
      let detail = ''
      try {
        detail = JSON.parse(new TextDecoder().decode(bytes.slice(0, 500))).error ?? ''
      } catch {
        detail = new TextDecoder().decode(bytes.slice(0, 200))
      }
      const hint =
        detail ||
        'Run npm run server (or dev:all), or set VITE_API_BASE_URL for hosted API. Set VITE_MAPBOX_ACCESS_TOKEN in .env and restart.'
      warnMapExport(`/api/mapbox-static HTTP ${res.status}. ${hint}`)
    } else {
      warnMapExport(
        '/api/mapbox-static OK but body was not PNG/JPEG; check Mapbox token and server logs.'
      )
    }
  } catch {
    warnMapExport(
      'Could not reach /api/mapbox-static. Use npm run dev:all locally, or configure VITE_API_BASE_URL + hosted API (see docs/API_HOSTING.md).'
    )
  }

  const fromImg = await loadMapboxPngViaImage(directUrl)
  if (fromImg && (isLikelyPng(fromImg) || isLikelyJpeg(fromImg))) {
    return fromImg
  }
  warnMapExport('All map fetch methods failed; mission map page will be omitted from the PDF.')
  return null
}

/**
 * Returns PNG bytes or null if Mapbox unavailable, no geometry, or request fails.
 */
export async function fetchMissionMapStaticPng(missionId: string): Promise<Uint8Array | null> {
  if (!isMapboxConfigured()) return null

  const mission = await db.missions.get(missionId)
  if (!mission) return null

  const reports = await db.towerReports
    .where('missionId')
    .equals(missionId)
    .sortBy('reportDate')

  const towerPoints: { lon: number; lat: number }[] = []
  for (const r of reports) {
    const loc = await db.towerLocations.get(r.towerLocationId)
    if (loc) towerPoints.push({ lon: loc.longitude, lat: loc.latitude })
  }

  let waypoints: WaypointRecord[] = []
  let plan: FlightPlanRecord | undefined
  if (mission.flightPlanId) {
    plan = await db.flightPlans.get(mission.flightPlanId)
    if (plan) {
      waypoints = await db.waypoints
        .where('flightPlanId')
        .equals(mission.flightPlanId)
        .sortBy('sequence')
    }
  }

  const departure = plan?.departureAirportId
    ? await db.airports.get(plan.departureAirportId)
    : null
  const destination = plan?.destinationAirportId
    ? await db.airports.get(plan.destinationAirportId)
    : null

  const routeCoords = buildRouteCoordinates(departure ?? null, waypoints, destination ?? null)

  if (routeCoords.length < 2 && towerPoints.length === 0) return null

  let overlayPath = buildOverlayPath(routeCoords, towerPoints)

  let bytes = await fetchMapboxStaticPng(overlayPath)
  if (bytes?.length) return bytes

  // Long URLs (414): drop route detail, keep endpoints + towers
  if (routeCoords.length > 2 && towerPoints.length > 0) {
    const ends: [number, number][] = [routeCoords[0], routeCoords[routeCoords.length - 1]]
    const lineFeature = {
      type: 'Feature',
      properties: {
        stroke: '#0E2B8D',
        'stroke-width': 4,
        'stroke-opacity': 0.95,
      },
      geometry: { type: 'LineString', coordinates: ends },
    }
    const shortParts = [`geojson(${encodeURIComponent(JSON.stringify(lineFeature))})`]
    for (const p of towerPoints) {
      shortParts.push(`pin-s+db0029(${roundCoord(p.lon)},${roundCoord(p.lat)})`)
    }
    overlayPath = shortParts.join(',')
    bytes = await fetchMapboxStaticPng(overlayPath)
    if (bytes?.length) return bytes
  }

  // Towers only (no valid route line)
  if (towerPoints.length > 0) {
    overlayPath = buildOverlayPath([], towerPoints)
    bytes = await fetchMapboxStaticPng(overlayPath)
    if (bytes?.length) return bytes
  }

  // Smaller image if URL or quota issues persist
  overlayPath = buildOverlayPath(routeCoords, towerPoints)
  bytes = await fetchMapboxStaticPng(overlayPath, 800, 450)
  if (bytes?.length) return bytes

  return null
}
