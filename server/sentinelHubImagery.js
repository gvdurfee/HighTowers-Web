/**
 * Recent Sentinel-2 imagery via Copernicus Data Space / Sentinel Hub Process API.
 * @see https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process.html
 */

import fetch from 'node-fetch'

const CDSE_TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
/** CDSE Sentinel Hub Process API (same as Python examples in Copernicus docs). */
const CDSE_PROCESS_URL = 'https://sh.dataspace.copernicus.eu/process/v1'

const METERS_PER_DEG_LAT = 111_320
const MILES_TO_METERS = 1609.344

/** @param {number} centerLat @param {number} centerLon @param {number} halfSideMiles */
export function computeSquareBbox(centerLat, centerLon, halfSideMiles = 0.5) {
  const halfM = halfSideMiles * MILES_TO_METERS
  const dLat = halfM / METERS_PER_DEG_LAT
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.max(cosLat, 0.01)
  const dLon = halfM / metersPerDegLon
  return {
    west: centerLon - dLon,
    east: centerLon + dLon,
    south: centerLat - dLat,
    north: centerLat + dLat,
  }
}

let tokenCache = { token: null, expiresAt: 0 }

async function getCdseAccessToken() {
  const clientId = process.env.CDSE_OAUTH_CLIENT_ID
  const clientSecret = process.env.CDSE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Set CDSE_OAUTH_CLIENT_ID and CDSE_OAUTH_CLIENT_SECRET (Copernicus Data Space OAuth client). See server/README.md'
    )
  }

  const now = Date.now()
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(CDSE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`CDSE OAuth failed (${res.status}): ${text.slice(0, 500)}`)
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('CDSE OAuth returned non-JSON')
  }

  const ttlSec = typeof data.expires_in === 'number' ? data.expires_in : 600
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, ttlSec - 120) * 1000,
  }
  return tokenCache.token
}

/** True-color Sentinel-2 L2A (aligned with CDSE Process examples). ~10 m on the ground. */
const TRUE_COLOR_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04"],
    output: {
      bands: 3,
      sampleType: "AUTO"
    }
  };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];
}
`.trim()

/**
 * Fetch a PNG patch for the given bbox (WGS-84).
 * @param {{ west: number, south: number, east: number, north: number }} bbox
 * @param {{ width?: number, height?: number, daysBack?: number, maxCloud?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function fetchSentinel2TrueColorPng(bbox, opts = {}) {
  const width = opts.width ?? 1024
  const height = opts.height ?? 1024
  const daysBack = opts.daysBack ?? 150
  const maxCloud = opts.maxCloud ?? 85

  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - daysBack)

  const { west, south, east, north } = bbox

  const token = await getCdseAccessToken()

  const payload = {
    input: {
      bounds: {
        bbox: [west, south, east, north],
        properties: {
          crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
        },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: from.toISOString(),
              to: to.toISOString(),
            },
            maxCloudCoverage: maxCloud,
            mosaickingOrder: 'leastCC',
          },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [
        {
          identifier: 'default',
          format: { type: 'image/png' },
        },
      ],
    },
    evalscript: TRUE_COLOR_EVALSCRIPT,
  }

  const res = await fetch(CDSE_PROCESS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    body: JSON.stringify(payload),
  })

  const buf = Buffer.from(await res.arrayBuffer())

  if (!res.ok) {
    const msg = buf.length < 2000 ? buf.toString('utf8') : buf.toString('utf8', 0, 2000)
    throw new Error(`Sentinel Hub Process API failed (${res.status}): ${msg}`)
  }

  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('png') && buf[0] !== 0x89) {
    const preview = buf.toString('utf8', 0, Math.min(500, buf.length))
    throw new Error(`Unexpected response (expected PNG): ${preview}`)
  }

  return buf
}
