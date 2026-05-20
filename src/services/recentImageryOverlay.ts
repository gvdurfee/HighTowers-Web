import { apiUrl } from '@/config/apiConfig'
import type { LngLat } from '@/utils/mapOverlayGeometry'
import { computeOneMileSquareImageCoordinates } from '@/utils/mapOverlayGeometry'

/** Shown on the map when a NAIP patch overlay is active. */
export const NAIP_OVERLAY_ATTRIBUTION =
  'Imagery © USDA Farm Service Agency (NAIP); distributed by USGS'

/**
 * Result for Mapbox `image` source + `raster` layer.
 * @see docs/IMAGERY_OVERLAY_IMPLEMENTATION.md
 */
export type RecentImageryOverlay = {
  /** PNG/JPEG URL (must be CORS-accessible or same-origin). */
  url: string
  /** Four corners [top-left, top-right, bottom-right, bottom-left], [lng, lat] each. */
  coordinates: [LngLat, LngLat, LngLat, LngLat]
  attribution: string
  /** Acquisition year when the server could read it from NAIP metadata. */
  vintage?: string
}

const NETWORK_HELP =
  'Cannot reach /api/recent-imagery. Run npm run dev:all (Vite + Node on port 3001) or set VITE_API_BASE_URL for a hosted API — see server/README.md and docs/API_HOSTING.md'

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const j = JSON.parse(text) as { error?: string }
    if (typeof j.error === 'string' && j.error.trim()) return j.error.trim()
  } catch {
    /* not JSON */
  }
  return text.trim() || `Recent imagery request failed (${res.status})`
}

/**
 * Fetches a USDA NAIP ortho patch from the Node server (public ArcGIS ImageServer).
 * Server: `GET /api/recent-imagery` — no API keys required.
 */
export async function fetchRecentImageryOverlay(
  centerLat: number,
  centerLon: number
): Promise<RecentImageryOverlay> {
  const coordinates = computeOneMileSquareImageCoordinates(centerLat, centerLon)

  const params = new URLSearchParams({
    lat: String(centerLat),
    lon: String(centerLon),
    halfMiles: '0.5',
    w: '1024',
    h: '1024',
  })

  let res: Response
  try {
    res = await fetch(`${apiUrl('/api/recent-imagery')}?${params}`)
  } catch {
    throw new Error(NETWORK_HELP)
  }

  if (res.ok) {
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const attribution =
      res.headers.get('X-Imagery-Attribution')?.trim() || NAIP_OVERLAY_ATTRIBUTION
    const vintage = res.headers.get('X-Imagery-Vintage')?.trim() || undefined
    return { url, coordinates, attribution, vintage }
  }

  if (res.status === 404 || res.status === 501) {
    throw new Error(await readErrorMessage(res))
  }

  throw new Error(await readErrorMessage(res))
}
