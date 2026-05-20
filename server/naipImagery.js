/**
 * USDA NAIP orthoimagery via public ArcGIS ImageServer exportImage.
 * @see https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip
 */

import fetch from 'node-fetch'
import { computeSquareBbox } from './imageryBbox.js'

export { computeSquareBbox }

export const NAIP_ATTRIBUTION =
  'Imagery © USDA Farm Service Agency (NAIP); distributed by USGS'

const ORIGIN_SHIFT = 20037508.342789244

const NAIP_IMAGE_SERVERS = [
  'https://naip.imagery1.arcgis.com/arcgis/rest/services/NAIP/ImageServer',
  'https://gis.apfo.usda.gov/arcgis/rest/services/NAIP/USDA_CONUS_PRIME/ImageServer',
]

/** @param {number} lon @param {number} lat */
export function lonLatToWebMercator(lon, lat) {
  const x = (lon * ORIGIN_SHIFT) / 180
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (ORIGIN_SHIFT / 180)
  return { x, y }
}

/** @param {{ west: number, south: number, east: number, north: number }} bbox WGS-84 */
export function wgs84BboxToWebMercator(bbox) {
  const sw = lonLatToWebMercator(bbox.west, bbox.south)
  const ne = lonLatToWebMercator(bbox.east, bbox.north)
  return { xmin: sw.x, ymin: sw.y, xmax: ne.x, ymax: ne.y }
}

/**
 * @param {string} serviceBase
 * @param {{ xmin: number, ymin: number, xmax: number, ymax: number }} mercatorBbox
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Buffer>}
 */
async function exportImageFromService(serviceBase, mercatorBbox, width, height) {
  const { xmin, ymin, xmax, ymax } = mercatorBbox
  const params = new URLSearchParams({
    f: 'image',
    format: 'png',
    transparent: 'false',
    size: `${width},${height}`,
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    bboxSR: '102100',
    imageSR: '102100',
    interpolation: 'RSP_BilinearInterpolation',
  })

  const url = `${serviceBase}/exportImage?${params}`
  const res = await fetch(url, { headers: { Accept: 'image/png,image/*' } })
  const buf = Buffer.from(await res.arrayBuffer())

  if (!res.ok) {
    const preview = buf.toString('utf8', 0, Math.min(500, buf.length))
    throw new Error(`NAIP exportImage failed (${res.status}): ${preview}`)
  }

  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
  if (!isPng && !isJpeg) {
    const preview = buf.toString('utf8', 0, Math.min(500, buf.length))
    throw new Error(`NAIP exportImage unexpected response: ${preview}`)
  }

  return buf
}

/**
 * Fetch a georeferenced NAIP ortho patch for the given WGS-84 bbox.
 * @param {{ west: number, south: number, east: number, north: number }} bbox
 * @param {{ width?: number, height?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function fetchNaipOrthoPng(bbox, opts = {}) {
  const width = opts.width ?? 1024
  const height = opts.height ?? 1024
  const mercatorBbox = wgs84BboxToWebMercator(bbox)

  let lastError
  for (const serviceBase of NAIP_IMAGE_SERVERS) {
    try {
      return await exportImageFromService(serviceBase, mercatorBbox, width, height)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('NAIP exportImage failed on all configured services')
}

/**
 * Best-effort acquisition year from ImageServer identify (may be absent).
 * @param {number} centerLat
 * @param {number} centerLon
 * @returns {Promise<string | null>}
 */
export async function fetchNaipVintageLabel(centerLat, centerLon) {
  const geometry = JSON.stringify({
    x: centerLon,
    y: centerLat,
    spatialReference: { wkid: 4326 },
  })
  const params = new URLSearchParams({
    f: 'json',
    geometry,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    returnCatalogItems: 'true',
    returnGeometry: 'false',
  })

  for (const serviceBase of NAIP_IMAGE_SERVERS) {
    try {
      const url = `${serviceBase}/identify?${params}`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      const year = extractVintageYear(data)
      if (year) return year
    } catch {
      /* try next service */
    }
  }
  return null
}

/** @param {unknown} data */
function extractVintageYear(data) {
  if (!data || typeof data !== 'object') return null
  const root = /** @type {Record<string, unknown>} */ (data)
  const catalog = root.catalogItems
  if (!catalog || typeof catalog !== 'object') return null
  const items = /** @type {Record<string, unknown>} */ (catalog).features
  if (!Array.isArray(items) || items.length === 0) return null

  for (const feature of items) {
    if (!feature || typeof feature !== 'object') continue
    const attrs = /** @type {Record<string, unknown>} */ (feature).attributes
    if (!attrs || typeof attrs !== 'object') continue
    const year = pickYearFromAttributes(attrs)
    if (year) return year
  }
  return null
}

/** @param {Record<string, unknown>} attrs */
function pickYearFromAttributes(attrs) {
  const keys = [
    'SRC_DATE',
    'SrcDate',
    'src_date',
    'Year',
    'YEAR',
    'AcquisitionDate',
    'ACQ_DATE',
    'Date',
  ]
  for (const key of keys) {
    const raw = attrs[key]
    if (raw == null) continue
    if (typeof raw === 'number' && raw >= 1990 && raw <= 2100) return String(Math.floor(raw))
    const text = String(raw)
    const m = text.match(/\b(20\d{2}|19\d{2})\b/)
    if (m) return m[1]
  }
  return null
}
