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
import { parseWaypointCode } from '@/utils/mtrWaypointCode'

const STYLE = 'mapbox/satellite-streets-v12'
/** Landscape; stay ≤1280 per Mapbox static API limits (no @2x). */
const IMG_W = 1280
const IMG_H = 720

/**
 * Must match the `padding` query param on Mapbox Static Images URLs.
 * PDF labels use this to map lon/lat into the inset “content” area of the image.
 */
export const MAPBOX_STATIC_IMAGE_PADDING_PX = 80

export type MissionMapGeographicBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type MissionMapWaypointMarker = {
  lon: number
  lat: number
  label: string
}

export type MissionMapStaticResult = {
  imageBytes: Uint8Array | null
  bounds: MissionMapGeographicBounds | null
  width: number
  height: number
  waypointMarkers: MissionMapWaypointMarker[]
}

/**
 * Geographic rectangle that Mapbox actually maps to the inner (image − padding) frame.
 * The Static Images API keeps the requested bbox fully visible but, when its ground aspect
 * ratio differs from the inner pixel aspect ratio, zooms out along one axis — so the edges
 * of the bitmap show a larger lon/lat range than `requested`.
 */
export function staticImageLabelBounds(
  requested: MissionMapGeographicBounds,
  imageWidthPx: number,
  imageHeightPx: number,
  paddingPx: number
): MissionMapGeographicBounds {
  const innerW = Math.max(imageWidthPx - 2 * paddingPx, 1)
  const innerH = Math.max(imageHeightPx - 2 * paddingPx, 1)
  const targetAspect = innerW / innerH

  const { west, south, east, north } = requested
  const lonSpan = Math.max(east - west, 1e-9)
  const latSpan = Math.max(north - south, 1e-9)
  const midLat = (south + north) / 2
  const cos = Math.max(Math.cos((midLat * Math.PI) / 180), 1e-6)
  const groundWOverH = (lonSpan * cos) / latSpan

  if (groundWOverH > targetAspect) {
    const newLatSpan = (lonSpan * cos) / targetAspect
    const mid = (south + north) / 2
    const half = newLatSpan / 2
    return { west, east, south: mid - half, north: mid + half }
  }
  const newLonSpan = (latSpan * targetAspect) / cos
  const mid = (west + east) / 2
  const half = newLonSpan / 2
  return { west: mid - half, east: mid + half, south, north }
}

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

/** Mode of routeType+routeNumber across waypoints (primary published route in a blended plan). */
function primaryRouteKey(waypoints: WaypointRecord[]): string | null {
  if (waypoints.length === 0) return null
  const counts = new Map<string, number>()
  for (const w of waypoints) {
    const p = parseWaypointCode(w.originalName)
    if (!p) continue
    const k = `${p.routeType}${p.routeNumber}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = k
    }
  }
  return best
}

/**
 * PDF map label: primary route → waypoint letters only (e.g. A, B, EK). Minority route → letter + route number (e.g. H214).
 * Uses parsed MTR id from stored names — not g1000Name, which can be ambiguous when stripping digits.
 */
export function waypointMarkerLabelForPdf(wp: WaypointRecord, primaryKey: string | null): string {
  const parsed =
    parseWaypointCode(wp.originalName) ?? parseWaypointCode(wp.g1000Name)
  if (!parsed) {
    return wp.g1000Name.trim().toUpperCase().slice(0, 8)
  }
  const wpKey = `${parsed.routeType}${parsed.routeNumber}`
  if (primaryKey && wpKey === primaryKey) return parsed.waypointLetter
  return `${parsed.waypointLetter}${parsed.routeNumber}`
}

function computeGeographicBounds(
  routeCoords: [number, number][],
  towerPoints: { lon: number; lat: number }[],
  paddingFrac = 0.06
): MissionMapGeographicBounds | null {
  const coords: [number, number][] = [
    ...routeCoords,
    ...towerPoints.map((p): [number, number] => [p.lon, p.lat]),
  ]
  if (coords.length === 0) return null
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  let west = Math.min(...lngs)
  let east = Math.max(...lngs)
  let south = Math.min(...lats)
  let north = Math.max(...lats)
  const lonSpan = Math.max(east - west, 1e-6)
  const latSpan = Math.max(north - south, 1e-6)
  const padLon = lonSpan * paddingFrac
  const padLat = latSpan * paddingFrac
  west -= padLon
  east += padLon
  south -= padLat
  north += padLat
  return { west, south, east, north }
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

function mapboxStaticUrl(
  overlayPath: string,
  bounds: MissionMapGeographicBounds,
  width: number,
  height: number
): string {
  const token = apiConfig.mapboxAccessToken
  const bbox = `[${roundCoord(bounds.west)},${roundCoord(bounds.south)},${roundCoord(bounds.east)},${roundCoord(bounds.north)}]`
  return `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlayPath}/${bbox}/${width}x${height}?padding=${MAPBOX_STATIC_IMAGE_PADDING_PX}&attribution=false&logo=false&access_token=${token}`
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
  bounds: MissionMapGeographicBounds,
  width = IMG_W,
  height = IMG_H
): Promise<Uint8Array | null> {
  const directUrl = mapboxStaticUrl(overlayPath, bounds, width, height)

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
        bbox: {
          west: bounds.west,
          south: bounds.south,
          east: bounds.east,
          north: bounds.north,
        },
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
 * Returns map image + geographic bounds for PDF label placement, or nulls if unavailable.
 */
export async function fetchMissionMapStaticPng(missionId: string): Promise<MissionMapStaticResult> {
  const empty: MissionMapStaticResult = {
    imageBytes: null,
    bounds: null,
    width: IMG_W,
    height: IMG_H,
    waypointMarkers: [],
  }
  if (!isMapboxConfigured()) return empty

  const mission = await db.missions.get(missionId)
  if (!mission) return empty

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

  if (routeCoords.length < 2 && towerPoints.length === 0) return empty

  const bounds =
    computeGeographicBounds(routeCoords, towerPoints) ??
    (towerPoints.length > 0
      ? computeGeographicBounds([], towerPoints)
      : null)
  if (!bounds) return empty

  const primaryKey = primaryRouteKey(waypoints)
  const waypointMarkers: MissionMapWaypointMarker[] = [...waypoints]
    .sort((a, b) => a.sequence - b.sequence)
    .map((wp) => ({
      lon: wp.longitude,
      lat: wp.latitude,
      label: waypointMarkerLabelForPdf(wp, primaryKey),
    }))

  let overlayPath = buildOverlayPath(routeCoords, towerPoints)

  let bytes = await fetchMapboxStaticPng(overlayPath, bounds)
  if (bytes?.length) {
    return { imageBytes: bytes, bounds, width: IMG_W, height: IMG_H, waypointMarkers }
  }

  // Long URLs (414): drop route detail, keep endpoints + towers (same geographic bounds for labels)
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
    bytes = await fetchMapboxStaticPng(overlayPath, bounds)
    if (bytes?.length) {
      return { imageBytes: bytes, bounds, width: IMG_W, height: IMG_H, waypointMarkers }
    }
  }

  // Towers only (no valid route line)
  if (towerPoints.length > 0) {
    overlayPath = buildOverlayPath([], towerPoints)
    bytes = await fetchMapboxStaticPng(overlayPath, bounds)
    if (bytes?.length) {
      return { imageBytes: bytes, bounds, width: IMG_W, height: IMG_H, waypointMarkers }
    }
  }

  // Smaller image if URL or quota issues persist
  overlayPath = buildOverlayPath(routeCoords, towerPoints)
  bytes = await fetchMapboxStaticPng(overlayPath, bounds, 800, 450)
  if (bytes?.length) {
    return { imageBytes: bytes, bounds, width: 800, height: 450, waypointMarkers }
  }

  return { ...empty, waypointMarkers }
}
