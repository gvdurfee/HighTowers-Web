import { nauticalMilesBetween } from '@survey-planning/surveyGeometry.js'

/** A lane waypoint on one sortie, in flown order. Airports are not included. */
export type SurveyStop = {
  name: string
  lat: number
  lon: number
}

export type SortieProgressStatus = 'not-started' | 'stopped' | 'completed'

/** Where a crew stopped. Stored beside the sortie list, keyed by sortie id. */
export type SortieProgress = {
  status: SortieProgressStatus
  /** Lane waypoint name when status is stopped. */
  stoppedAt?: string | null
  note?: string
  /** YYYY-MM-DD. The day the mark was recorded. */
  recordedOn?: string
  /** Survey waypoint names in flown order when the mark was saved. */
  waypointKey?: string
}

export const COVERED_LINE = '#0072B2'
export const REMAINING_LINE = '#E69F00'

export function sortieProgressId(teamId: string, sortieNumber: number): string {
  return `${teamId}:${sortieNumber}`
}

export function todayIso(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function surveyStops(
  waypoints: Array<{ g1000Name?: string; name?: string; lat: number; lon: number }>,
  airportIdents: Array<string | null | undefined>
): SurveyStop[] {
  const airports = new Set(
    airportIdents
      .filter((ident): ident is string => Boolean(ident && ident.trim()))
      .map((ident) => ident.trim().toUpperCase())
  )
  const stops: SurveyStop[] = []
  for (const point of waypoints) {
    const name = (point.g1000Name || point.name || '').trim()
    if (!name || airports.has(name.toUpperCase())) continue
    stops.push({ name, lat: point.lat, lon: point.lon })
  }
  return stops
}

export function waypointKey(stops: SurveyStop[]): string {
  return stops.map((stop) => stop.name).join('|')
}

function oneDecimal(nm: number): string {
  return (Math.round(nm * 10) / 10).toFixed(1)
}

/** Survey lane miles from the first lane waypoint through `throughName`, inclusive. */
export function surveyLaneNm(stops: SurveyStop[], throughName?: string | null): number {
  if (stops.length < 2) return 0
  let end = stops.length - 1
  if (throughName) {
    const index = stops.findIndex((stop) => stop.name === throughName)
    if (index < 1) return 0
    end = index
  }
  let sum = 0
  for (let index = 1; index <= end; index += 1) {
    sum += nauticalMilesBetween(stops[index - 1], stops[index])
  }
  return Math.round(sum * 10) / 10
}

export function coveredSurveyNm(stops: SurveyStop[], mark: SortieProgress | undefined): number {
  if (!mark || mark.status === 'not-started') return 0
  if (mark.status === 'completed') return surveyLaneNm(stops)
  return surveyLaneNm(stops, mark.stoppedAt)
}

export function surveySummaryLine(surveyedNm: number, totalNm: number): string {
  const pct = totalNm > 0 ? Math.round((surveyedNm / totalNm) * 100) : 0
  return `Surveyed ${oneDecimal(surveyedNm)} of ${oneDecimal(totalNm)} NM (${pct}%)`
}

export function reconcileSortieProgress(
  previous: Record<string, SortieProgress> | undefined,
  current: Array<{ id: string; label: string; waypointKey: string }>,
  previousLabels: Record<string, string> = {}
): { progress: Record<string, SortieProgress>; cleared: string[] } {
  const progress: Record<string, SortieProgress> = {}
  const cleared: string[] = []
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const [id, mark] of Object.entries(previous ?? {})) {
    if (!mark || mark.status === 'not-started') continue
    const sortie = byId.get(id)
    const label = sortie?.label ?? previousLabels[id] ?? id
    if (!sortie) {
      cleared.push(label)
      continue
    }
    if (!sortie.waypointKey || !mark.waypointKey || mark.waypointKey === sortie.waypointKey) {
      progress[id] = mark
      continue
    }
    cleared.push(label)
  }
  return { progress, cleared }
}

export function progressClearNotice(cleared: string[]): string | null {
  if (cleared.length === 0) return null
  const names =
    cleared.length === 1 ? cleared[0] : `${cleared.slice(0, -1).join(', ')} and ${cleared[cleared.length - 1]}`
  const which = cleared.length === 1 ? 'that sortie changed' : 'those sorties changed'
  return `Progress was cleared for ${names} because ${which}.`
}

export type CoverageLines = {
  covered: [number, number][]
  remaining: [number, number][]
}

/** Solid covered path and dashed remainder for the selected sortie. Null when nothing is marked. */
export function coverageLines(stops: SurveyStop[], mark: SortieProgress | undefined): CoverageLines | null {
  if (!mark || mark.status === 'not-started' || stops.length < 2) return null
  const line = (points: SurveyStop[]): [number, number][] => points.map((stop) => [stop.lon, stop.lat])
  if (mark.status === 'completed') return { covered: line(stops), remaining: [] }
  const index = stops.findIndex((stop) => stop.name === mark.stoppedAt)
  if (index < 0) return null
  return {
    covered: line(stops.slice(0, index + 1)),
    remaining: line(stops.slice(index)),
  }
}
