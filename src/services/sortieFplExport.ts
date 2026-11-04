import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import type { AirportRecord, WaypointRecord } from '@/db/schema'

export type SortieFplSortie = {
  sortieNumber: number
  startIdx: number
  endIdx: number
  startAt: string
  waypointFrom: string
  waypointTo: string
  offsets: number[]
  routeSequence?: string[]
  ferryInLabel?: string
  ferryOutLabel?: string
}

export type SortieFplPilotBrief = {
  teamLabel: string
  side: string
  rangeLabel: string
  startAt: string
  passCount: number
  offsetsLabel: string
  ferryInLabel?: string
  ferryOutLabel?: string
  warnRoutePointLimit: boolean
  routePointCount: number
  filename: string
}

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

export function buildSortieFplFromWaypoints(opts: {
  waypoints: WaypointRecord[]
  sortie: SortieFplSortie
  teamDeparture: AirportRecord
  destinationAirport?: AirportRecord
  routeLabel: string
  teamLabel: string
  side: string
  created?: Date
}): { xml: string; brief: SortieFplPilotBrief } {
  void opts
  throw new Error('Sortie files use offset-lane waypoints. The centerline sortie export is not available.')
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
