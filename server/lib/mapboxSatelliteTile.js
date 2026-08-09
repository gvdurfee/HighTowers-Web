/**
 * Fetch a north-up Mapbox satellite static tile centered on lat/lon.
 */

import fetch from 'node-fetch'
import { squareBboxNm } from '../../shared/tower-locate/geo.js'

function mapboxToken() {
  return process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || ''
}

/**
 * @returns {Promise<{ pngBase64: string, width: number, height: number, halfSideNm: number, bbox: object }>}
 */
export async function fetchSatelliteTileAround(lat, lon, opts = {}) {
  const token = mapboxToken()
  if (!token || token === 'your_mapbox_token_here') {
    throw new Error('Mapbox token not configured on server (.env)')
  }

  const halfSideNm = Number(opts.halfSideNm) > 0 ? Number(opts.halfSideNm) : 0.25
  const width = Math.min(1280, Math.max(256, Number(opts.width) || 640))
  const height = Math.min(1280, Math.max(256, Number(opts.height) || 640))
  const style = 'mapbox/satellite-streets-v12'
  const bbox = squareBboxNm(lat, lon, halfSideNm)
  const r5 = (n) => Number(n).toFixed(5)
  const position = `[${r5(bbox.west)},${r5(bbox.south)},${r5(bbox.east)},${r5(bbox.north)}]`
  const staticPath = `/styles/v1/${style}/static/${position}/${width}x${height}`
  const url = new URL(staticPath, 'https://api.mapbox.com')
  url.searchParams.set('padding', '0')
  url.searchParams.set('attribution', 'false')
  url.searchParams.set('logo', 'false')
  url.searchParams.set('access_token', token)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 200)
    throw new Error(`Mapbox static failed: ${res.status} ${snippet}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    pngBase64: buf.toString('base64'),
    width,
    height,
    halfSideNm,
    bbox,
    mimeType: 'image/png',
  }
}
