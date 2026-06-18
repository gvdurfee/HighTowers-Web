import {
  buildSortieFplExportInput,
  formatSortieFplFilename,
  sliceFragmentWaypoints,
} from '@survey-planning/surveySortieFplRoute.js'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import type { AirportRecord, WaypointRecord } from '@/db/schema'
import { G1000Service } from '@/services/g1000'

export type SortieFplSortie = {
  sortieNumber: number
  startIdx: number
  endIdx: number
  startAt: string
  waypointFrom: string
  waypointTo: string
  offsets: number[]
}

export type SortieFplPilotBrief = {
  teamLabel: string
  side: string
  rangeLabel: string
  startAt: string
  passCount: number
  offsetsLabel: string
  warnRoutePointLimit: boolean
  routePointCount: number
  filename: string
}

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

function mapFragmentWaypoints(slice: WaypointRecord[]) {
  return slice.map((w) => ({
    ptIdent: waypointPtIdent(w.originalName),
    g1000Name: w.g1000Name,
    lat: w.latitude,
    lon: w.longitude,
  }))
}

function airportFromRecord(a: AirportRecord) {
  return {
    identifier: a.identifier,
    name: a.name,
    lat: a.latitude,
    lon: a.longitude,
    elevation: a.elevation,
  }
}

export function buildSortieFplFromWaypoints(opts: {
  waypoints: WaypointRecord[]
  sortie: SortieFplSortie
  teamDeparture: AirportRecord
  routeLabel: string
  teamLabel: string
  side: string
}): { xml: string; brief: SortieFplPilotBrief } {
  const slice = sliceFragmentWaypoints(opts.waypoints, opts.sortie.startIdx, opts.sortie.endIdx) as WaypointRecord[]
  const fragmentWaypoints = mapFragmentWaypoints(slice)
  const exportInput = buildSortieFplExportInput({
    sortie: opts.sortie,
    fragmentWaypoints,
    teamDeparture: airportFromRecord(opts.teamDeparture),
    routeLabel: opts.routeLabel,
  })

  const dep = exportInput.teamDeparture
  const airportInput = {
    identifier: dep.identifier,
    name: dep.name,
    latitude: dep.latitude,
    longitude: dep.longitude,
    elevation: dep.elevation,
  }

  const xml = G1000Service.generateSortieFlightPlan({
    routeLabel: exportInput.routeLabel,
    sortieNumber: exportInput.sortieNumber,
    departureAirport: airportInput,
    destinationAirport: airportInput,
    fragmentWaypoints: exportInput.fragmentWaypoints.map((wp) => ({
      g1000Name: wp.g1000Name,
      latitude: wp.lat,
      longitude: wp.lon,
    })),
    routeSequence: exportInput.routeSequence,
  })

  const filename = formatSortieFplFilename({
    dep: dep.identifier,
    routeName: opts.routeLabel,
    from: opts.sortie.waypointFrom,
    to: opts.sortie.waypointTo,
    sortieNumber: opts.sortie.sortieNumber,
  })

  return {
    xml,
    brief: {
      teamLabel: opts.teamLabel,
      side: opts.side,
      rangeLabel: `${opts.sortie.waypointFrom}→${opts.sortie.waypointTo}`,
      startAt: opts.sortie.startAt,
      passCount: opts.sortie.offsets.length,
      offsetsLabel: opts.sortie.offsets.join(', '),
      warnRoutePointLimit: exportInput.warnRoutePointLimit,
      routePointCount: exportInput.routePointCount,
      filename,
    },
  }
}

export function downloadSortieFpl(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportSortieFplDownload(opts: Parameters<typeof buildSortieFplFromWaypoints>[0]): SortieFplPilotBrief {
  const { xml, brief } = buildSortieFplFromWaypoints(opts)
  downloadSortieFpl(xml, brief.filename)
  return brief
}

/** Manual fragment export from flight plan detail (from/to ptIdent on full waypoint list). */
export function buildManualSortieFromPtIdents(opts: {
  waypoints: WaypointRecord[]
  fromPt: string
  toPt: string
  startAt: string
  offsets: number[]
  teamDeparture: AirportRecord
  routeLabel: string
  sortieNumber?: number
}): SortieFplSortie {
  const ptIdents = opts.waypoints.map((w) => waypointPtIdent(w.originalName))
  const startIdx = ptIdents.findIndex((p) => p === opts.fromPt)
  const endIdx = ptIdents.findIndex((p) => p === opts.toPt)
  if (startIdx < 0 || endIdx < 0) {
    throw new Error('From/to waypoint not found on this flight plan.')
  }
  const lo = Math.min(startIdx, endIdx)
  const hi = Math.max(startIdx, endIdx)
  if (lo === hi) {
    throw new Error('Sortie fragment must span at least two waypoints.')
  }
  const startAt = opts.startAt.trim()
  if (startAt !== ptIdents[lo] && startAt !== ptIdents[hi]) {
    throw new Error('Start-at must be the first or last waypoint of the selected fragment.')
  }
  return {
    sortieNumber: opts.sortieNumber ?? 1,
    startIdx: lo,
    endIdx: hi,
    startAt,
    waypointFrom: ptIdents[lo],
    waypointTo: ptIdents[hi],
    offsets: opts.offsets,
  }
}

export function parseOffsetsInput(raw: string): number[] {
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) throw new Error('Enter at least one offset in NM.')
  const offsets = parts.map((p) => {
    const n = Number(p)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid offset: ${p}`)
    return n
  })
  return offsets
}
