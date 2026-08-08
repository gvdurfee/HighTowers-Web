/**
 * API service for MTR waypoints (FAA NASR for IR/VR, public DISDI ArcGIS for SR + fallback),
 * FAA airports, and elevation.
 * Ports logic from HighTowers-2025 APIService.swift
 *
 * Note: the former NIFC `services3…/Military_Training_Routes` service now returns
 * HTTP 499 "Token Required". SR (and ArcGIS fallback for IR/VR) use DISDI's public
 * MTRs_and_SUAs FeatureServer instead.
 */

import { apiUrl } from '@/config/apiConfig'
import { convertWaypointNameToG1000 } from '@/utils/g1000WaypointName'
import { findRouteWaypoint } from '@/utils/mtrWaypointLookup'

const FAA_URL =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query'

/** DISDI public MTR points/corridors (no token). Layers: IR=0, SR=1, VR=2. */
const ARCGIS_BASE =
  'https://services7.arcgis.com/n1YM8pTrFmm7L4hs/ArcGIS/rest/services/MTRs_and_SUAs/FeatureServer'
const IR_LAYER = 0
const SR_LAYER = 1
const VR_LAYER = 2

// CORS-enabled; OpenTopoData disables CORS for browser requests
const ELEVATION_URL = 'https://www.elevation-api.eu/v1/elevation'

// Cache for full-route waypoint data to avoid re-fetching the same route per waypoint in a sequence
const routeCache = new Map<string, { originalName: string; g1000Name: string; latitude: number; longitude: number; ptIdent?: string; nxPoint?: string }[]>()

export type RouteType = 'IR' | 'SR' | 'VR'

export interface AirportResult {
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

interface ArcGisFeature {
  attributes: Record<string, unknown>
}

interface ArcGisResponse {
  features?: ArcGisFeature[]
  error?: { code?: number; message?: string }
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

function getStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string') return v
  }
  return null
}

export const apiService = {
  async fetchAirport(identifier: string): Promise<AirportResult | null> {
    const id = identifier.trim().toUpperCase()
    const params = new URLSearchParams({
      where: `ICAO_ID='${id}' OR IDENT='${id}'`,
      outFields: 'IDENT,NAME,LATITUDE,LONGITUDE,ICAO_ID,ELEVATION',
      returnGeometry: 'false',
      outSR: '4326',
      f: 'json',
    })
    const res = await fetch(`${FAA_URL}?${params}`)
    if (!res.ok) throw new Error(`FAA API error: ${res.status}`)
    const data: ArcGisResponse = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    const attrs = feature.attributes

    let lat: number | null = null
    let lon: number | null = null

    const latAttr = getStr(attrs, 'LATITUDE', 'latitude')
    const lonAttr = getStr(attrs, 'LONGITUDE', 'longitude')
    if (typeof latAttr === 'string') lat = parseDms(latAttr) ?? getNum(attrs, 'LATITUDE', 'latitude')
    if (typeof lonAttr === 'string') lon = parseDms(lonAttr) ?? getNum(attrs, 'LONGITUDE', 'longitude')
    if (lat == null) lat = getNum(attrs, 'WGS_DLAT', 'wgsDlat')
    if (lon == null) lon = getNum(attrs, 'WGS_DLON', 'wgsDlong')

    if (lat == null || lon == null) return null

    const ident = getStr(attrs, 'ICAO_ID', 'IDENT', 'icaoId', 'ident') ?? identifier
    const name = getStr(attrs, 'NAME', 'name') ?? ''
    const elev = getNum(attrs, 'ELEVATION', 'elevation')

    return {
      identifier: ident,
      name,
      latitude: lat,
      longitude: lon,
      elevation: elev ?? undefined,
    }
  },

  async fetchRouteData(
    routeType: RouteType,
    routeNumber: string,
    entryLetter?: string,
    exitLetter?: string
  ): Promise<{ originalName: string; g1000Name: string; latitude: number; longitude: number; ptIdent?: string; nxPoint?: string }[]> {
    const num = routeNumber.replace(/^(IR|SR|VR)/i, '').trim()
    const cacheKey = `${routeType}-${num}`

    // For full-route fetches (waypoint lookup), use cache to avoid repeated ArcGIS/backend calls
    if (!entryLetter && !exitLetter) {
      const cached = routeCache.get(cacheKey)
      if (cached) return cached
    }

    // FAA NASR has IR and VR only; SR uses ArcGIS
    if (routeType === 'IR' || routeType === 'VR') {
      try {
        const params = new URLSearchParams({
          routeType,
          routeNumber: num,
          ...(entryLetter && { entry: entryLetter }),
          ...(exitLetter && { exit: exitLetter }),
        })
        const res = await fetch(`${apiUrl('/api/mtr/waypoints')}?${params}`)
        if (!res.ok) throw new Error(`MTR API error: ${res.status}`)
        const data: { waypoints: { originalName: string; g1000Name: string; latitude: number; longitude: number; ptIdent?: string; nxPoint?: string }[] } = await res.json()
        const results = data.waypoints ?? []
        if (results.length > 0) {
          if (!entryLetter && !exitLetter) routeCache.set(cacheKey, results)
          return results
        }
      } catch {
        // Fall back to ArcGIS if backend unreachable or returns empty
      }
    }

    const layer =
      routeType === 'IR' ? IR_LAYER : routeType === 'SR' ? SR_LAYER : VR_LAYER
    const mtrId = `${routeType}${num}`
    const params = new URLSearchParams({
      where: `MTR_IDENT='${mtrId}'`,
      outFields: 'MTR_IDENT,PT_IDENT,NX_POINT,WGS_DLAT,WGS_DLONG',
      outSR: '4326',
      resultRecordCount: '500',
      f: 'json',
    })
    const res = await fetch(`${ARCGIS_BASE}/${layer}/query?${params}`)
    if (!res.ok) throw new Error(`ARCGIS API error: ${res.status}`)
    const data: ArcGisResponse = await res.json()
    if (data.error) {
      throw new Error(
        `ARCGIS API error: ${data.error.message ?? 'unknown'}${
          data.error.code != null ? ` (${data.error.code})` : ''
        }`
      )
    }

    const results: { originalName: string; g1000Name: string; latitude: number; longitude: number; ptIdent?: string; nxPoint?: string }[] = []
    for (let i = 0; i < (data.features?.length ?? 0); i++) {
      const f = data.features![i]
      const attrs = f.attributes
      const lat = getNum(attrs, 'WGS_DLAT', 'wgsDlat', 'wgs_dlat')
      const lon = getNum(attrs, 'WGS_DLONG', 'WGS_DLON', 'wgsDlong', 'wgs_dlong')
      const ptIdent = (getStr(attrs, 'PT_IDENT', 'ptIdent', 'pt_ident') ?? '').trim()
      const nxPoint = (getStr(attrs, 'NX_POINT', 'nxPoint', 'nx_point') ?? '').trim()
      if (lat != null && lon != null && ptIdent) {
        const originalName = `${routeType}${num}-${ptIdent}`
        results.push({
          originalName,
          g1000Name: convertWaypointNameToG1000(originalName),
          latitude: lat,
          longitude: lon,
          ptIdent,
          nxPoint,
        })
      }
    }

    if (!entryLetter && !exitLetter && results.length > 0) {
      routeCache.set(cacheKey, results)
    }
    return results
  },

  /** Extracts a segment from route waypoints using entry and exit identifiers (e.g. A to Q). */
  extractRouteSegment(
    waypoints: { originalName: string; g1000Name: string; latitude: number; longitude: number; ptIdent?: string; nxPoint?: string }[],
    entryLetter: string,
    exitLetter: string
  ): { originalName: string; g1000Name: string; latitude: number; longitude: number }[] {
    const entry = entryLetter.toUpperCase().trim()
    const exit = exitLetter.toUpperCase().trim()
    if (!entry || !exit) return waypoints

    const byPtIdent = new Map<string, typeof waypoints[0]>()
    for (const w of waypoints) {
      const pt = (w.ptIdent ?? '').trim()
      if (pt) {
        const existing = byPtIdent.get(pt)
        const isSingleLetter = /^[A-Z]$/.test(pt)
        if (!existing || (isSingleLetter && !/^[A-Z]$/.test(existing.ptIdent ?? ''))) {
          byPtIdent.set(pt, w)
        }
      }
    }

    const ordered: typeof waypoints = []
    let current: string | null = entry
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      const rec = byPtIdent.get(current)
      if (!rec) break
      ordered.push(rec)
      if (current === exit) break
      const nx = (rec.nxPoint ?? '').trim()
      current = nx || null
    }
    return ordered.map(({ originalName, g1000Name, latitude, longitude }) => ({
      originalName,
      g1000Name,
      latitude,
      longitude,
    }))
  },

  async fetchWaypointCoordinate(
    routeType: RouteType,
    routeNumber: string,
    waypointLetter: string
  ): Promise<{ latitude: number; longitude: number } | null> {
    const waypoints = await this.fetchRouteData(routeType, routeNumber)
    const match = findRouteWaypoint(waypoints, waypointLetter)
    return match ? { latitude: match.latitude, longitude: match.longitude } : null
  },

  async fetchElevation(latitude: number, longitude: number): Promise<number> {
    const res = await fetch(
      `${ELEVATION_URL}/${latitude}/${longitude}?json`
    )
    if (!res.ok) throw new Error(`Elevation API error: ${res.status}`)
    const data: { elevation?: number } = await res.json()
    const elev = data.elevation
    if (elev == null || typeof elev !== 'number')
      throw new Error('No elevation result')
    return elev * 3.28084
  },
}
