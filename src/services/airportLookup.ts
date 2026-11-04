/**
 * FAA airport lookup used by Flight Plans and the Coordinator Console.
 * Source: the public FAA US_Airport FeatureServer (ICAO_ID and FAA IDENT).
 */

const FAA_AIRPORT_QUERY_URL =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query'

export interface AirportResult {
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

export const FAA_AIRPORT_SERVICE_MESSAGE =
  "FAA airport service didn't respond. Check your connection and try again."

const FAA_AIRPORT_TIMEOUT_MS = 20_000

export type AirportLookupResult =
  | { status: 'found'; id: string; airport: AirportResult }
  | { status: 'not-found'; id: string }
  | { status: 'unavailable'; id: string }

/** Letters and digits only, uppercased. Spaces, invisible characters, and punctuation are dropped. */
export function cleanAirportId(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toUpperCase()
}

export function airportLookupMessage(result: AirportLookupResult): string | null {
  if (result.status === 'found') return null
  if (result.status === 'unavailable') return FAA_AIRPORT_SERVICE_MESSAGE
  return result.id ? `Could not find airport: ${result.id}` : 'Could not find airport'
}

/** Typed id first. A K-prefixed 4-letter id also tries the 3-letter FAA location id. */
export function airportSearchIds(identifier: string): string[] {
  const id = cleanAirportId(identifier)
  if (!id) return []
  if (/^K[A-Z]{3}$/.test(id)) return [id, id.slice(1)]
  return [id]
}

class AirportServiceError extends Error {
  constructor() {
    super(FAA_AIRPORT_SERVICE_MESSAGE)
    this.name = 'AirportServiceError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sqlId(id: string): string {
  return id.replace(/'/g, "''")
}

function parseDms(dms: string): number | null {
  if (typeof dms !== 'string') return null
  const trimmed = dms.trim()
  const num = Number(trimmed)
  if (!Number.isNaN(num)) return num
  const match = trimmed.match(/^(\d+)-(\d+)-([\d.]+)([NSEW])$/i)
  if (!match) return null
  const d = Number(match[1]) ?? 0
  const m = Number(match[2]) ?? 0
  const s = Number(match[3]) ?? 0
  const hemi = match[4].toUpperCase()
  let decimal = d + m / 60 + s / 3600
  if (hemi === 'S' || hemi === 'W') decimal *= -1
  return decimal
}

function getNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string') {
      const n = Number(v)
      if (!Number.isNaN(n)) return n
    }
  }
  return null
}

function text(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export function airportFromAttributes(
  attrs: Record<string, unknown>,
  fallbackId: string
): AirportResult | null {
  let lat: number | null = null
  let lon: number | null = null

  const latAttr = text(attrs, 'LATITUDE', 'latitude')
  const lonAttr = text(attrs, 'LONGITUDE', 'longitude')
  if (latAttr) lat = parseDms(latAttr) ?? getNum(attrs, 'LATITUDE', 'latitude')
  if (lonAttr) lon = parseDms(lonAttr) ?? getNum(attrs, 'LONGITUDE', 'longitude')
  if (lat == null) lat = getNum(attrs, 'WGS_DLAT', 'wgsDlat')
  if (lon == null) lon = getNum(attrs, 'WGS_DLON', 'wgsDlong')
  if (lat == null || lon == null) return null

  const ident = text(attrs, 'ICAO_ID', 'IDENT', 'icaoId', 'ident') ?? fallbackId
  const name = text(attrs, 'NAME', 'name') ?? ''
  const elev = getNum(attrs, 'ELEVATION', 'elevation')

  return {
    identifier: ident,
    name,
    latitude: lat,
    longitude: lon,
    elevation: elev ?? undefined,
  }
}

async function queryAirport(id: string): Promise<AirportResult | null> {
  const params = new URLSearchParams({
    where: `ICAO_ID='${sqlId(id)}' OR IDENT='${sqlId(id)}'`,
    outFields: 'IDENT,NAME,LATITUDE,LONGITUDE,ICAO_ID,ELEVATION',
    returnGeometry: 'false',
    outSR: '4326',
    f: 'json',
  })
  let res: Response
  try {
    res = await fetch(`${FAA_AIRPORT_QUERY_URL}?${params}`, {
      signal: AbortSignal.timeout(FAA_AIRPORT_TIMEOUT_MS),
    })
  } catch {
    throw new AirportServiceError()
  }
  if (!res.ok) throw new AirportServiceError()

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new AirportServiceError()
  }
  if (!isRecord(data) || data.error) throw new AirportServiceError()
  if (!Array.isArray(data.features)) throw new AirportServiceError()
  if (data.features.length === 0) return null

  const feature = data.features[0]
  if (!isRecord(feature) || !isRecord(feature.attributes)) throw new AirportServiceError()
  const airport = airportFromAttributes(feature.attributes, id)
  if (!airport) throw new AirportServiceError()
  return airport
}

export async function fetchAirport(identifier: string): Promise<AirportLookupResult> {
  const id = cleanAirportId(identifier)
  if (!id) return { status: 'not-found', id: '' }
  const ids = airportSearchIds(id)
  try {
    for (const candidate of ids) {
      const found = await queryAirport(candidate)
      if (found) return { status: 'found', id, airport: found }
    }
  } catch (err) {
    if (err instanceof AirportServiceError) return { status: 'unavailable', id }
    throw err
  }
  return { status: 'not-found', id }
}
