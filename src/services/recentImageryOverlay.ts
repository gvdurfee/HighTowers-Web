import { apiUrl } from '@/config/apiConfig'
import type { LngLat } from '@/utils/mapOverlayGeometry'
import { computeOneMileSquareImageCoordinates } from '@/utils/mapOverlayGeometry'

/**
 * Result for Mapbox `image` source + `raster` layer.
 * @see docs/IMAGERY_OVERLAY_IMPLEMENTATION.md
 */
export type RecentImageryOverlay = {
  /** PNG/JPEG URL (must be CORS-accessible or same-origin). */
  url: string
  /** Four corners [top-left, top-right, bottom-right, bottom-left], [lng, lat] each. */
  coordinates: [LngLat, LngLat, LngLat, LngLat]
}

const NETWORK_HELP =
  'Cannot reach /api/recent-imagery. Run npm run dev:all (Vite + Node on port 3001), set VITE_API_BASE_URL for a hosted API, and ensure CDSE_OAUTH_* on the server — see server/README.md and docs/API_HOSTING.md'

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
 * Fetches a Sentinel-2 L2A true-color patch from the Node server (Copernicus Data Space).
 * Server: `GET /api/recent-imagery` — requires `CDSE_OAUTH_CLIENT_ID` and `CDSE_OAUTH_CLIENT_SECRET`.
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
    return { url, coordinates }
  }

  if (res.status === 404 || res.status === 501) {
    throw new Error(await readErrorMessage(res))
  }

  throw new Error(await readErrorMessage(res))
}
