import {
  buildOffsetRoutes,
  courseChangeDeg,
  crossTrackNm,
  type OffsetFlag,
  type OffsetLegWidth,
  type OffsetRoutePoint,
} from '@survey-planning/offsetRoutePlan.js'
import type { SortieSide } from '@/services/offsetRouteFpl'

const EARTH_RADIUS_NM = 6371000 / 1852
const SAME_POINT_NM = 0.05
const REVERSAL_DEG = 170

export const SPUR_PROPOSAL_GENERATOR_VERSION = 1

export const SPUR_ACCEPT_BLOCK =
  'Accept stays off. The turnaround that joins the two offset endpoints is not defined. Needed from the planner: the connector between those two endpoints, and what that drawing is allowed to include. No bank angle, radius, or turn coordinates are on file, and this preview does not invent them.'

export type SpurPoint = {
  ptIdent?: string
  originalName?: string
  lat: number
  lon: number
}

export type SpurHit = {
  index: number
  outboundName: string
  turnName: string
  returnName: string
  courseChangeDeg: number
}

export type SpurLegLabel = {
  from: string
  to: string
  travel: string
  geographicSide: string
  ofTrack: string
  proposalRole: string
}

export type SpurPreview = {
  detected: boolean
  hits: SpurHit[]
  acceptEnabled: false
  acceptBlockedReason: string
  warnings: string[]
  legs: SpurLegLabel[]
  discrepancy: string
  sortie2: string
  distinctPoints: string[]
  efficiency: {
    savingsClaimed: false
    excluded: string[]
  }
}

function pointName(point: SpurPoint): string {
  return point.originalName || point.ptIdent || 'point'
}

function distanceNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const y = Math.sin(dλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function compass(bearing: number): string {
  const cards = ['north', 'east', 'south', 'west']
  return cards[Math.round(bearing / 90) % 4]
}

function geographicSide(bearing: number, rightPositive: number): string {
  const lateral = rightPositive >= 0 ? 'right' : 'left'
  const normal = lateral === 'left' ? bearing - 90 : bearing + 90
  return `${compass((normal + 360) % 360)} (${lateral} of ${compass(bearing)}bound travel)`
}

/**
 * A bounded out-and-back: three points, the first and third the same place,
 * a turn of about 180°, and at least one waypoint after the return.
 * This does not remove or merge any other repeated point.
 */
export function detectReciprocalSpurs(waypoints: SpurPoint[]): SpurHit[] {
  if (waypoints.length < 4) return []
  const hits: SpurHit[] = []
  for (let index = 0; index <= waypoints.length - 4; index++) {
    const outbound = waypoints[index]
    const turn = waypoints[index + 1]
    const back = waypoints[index + 2]
    if (distanceNm(outbound, turn) <= SAME_POINT_NM) continue
    if (distanceNm(outbound, back) > SAME_POINT_NM) continue
    const change = Math.abs(courseChangeDeg(outbound, turn, back))
    if (change < REVERSAL_DEG) continue
    hits.push({
      index,
      outboundName: pointName(outbound),
      turnName: pointName(turn),
      returnName: pointName(back),
      courseChangeDeg: change,
    })
  }
  return hits
}

function distinctSameLetters(waypoints: SpurPoint[]): string[] {
  const groups = new Map<string, SpurPoint[]>()
  for (const point of waypoints) {
    const key = (point.ptIdent || pointName(point)).replace(/^.*-/, '')
    const list = groups.get(key) ?? []
    list.push(point)
    groups.set(key, list)
  }
  const notes: string[] = []
  for (const [letter, points] of groups) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (distanceNm(points[i], points[j]) > 1) {
          notes.push(
            `${letter} at ${points[i].lat.toFixed(6)}, ${points[i].lon.toFixed(6)} and ${letter} at ${points[j].lat.toFixed(6)}, ${points[j].lon.toFixed(6)} stay distinct.`
          )
        }
      }
    }
  }
  return notes
}

function roleFor(index: number, hits: SpurHit[], sortie1Side: SortieSide | null): string {
  const hit = hits.find((item) => index === item.index || index === item.index + 1)
  if (hit && index === hit.index) {
    return `Spur outbound ${hit.outboundName} to ${hit.turnName}. The proposal covers both physical sides of this spur on Sortie 1. The current file puts one side on each sortie.`
  }
  if (hit) {
    return `Return ${hit.turnName} to ${hit.returnName}. The saved corner stays on the incoming side, and this chord crosses the centerline. The opposite-side parallel and the turn between the two offset endpoints are unresolved.`
  }
  const first = sortie1Side === 'outer' ? 'outside' : sortie1Side === 'inner' ? 'inside' : 'the saved first side'
  return `Main route. Sortie 1 currently follows the ${first}. The proposal puts this leg outside on Sortie 1 and inside on Sortie 2.`
}

export function buildSpurPreview(opts: {
  waypoints: SpurPoint[]
  legWidths?: OffsetLegWidth[] | null
  sortie1Side?: SortieSide | null
  flags?: OffsetFlag[]
}): SpurPreview {
  const hits = detectReciprocalSpurs(opts.waypoints)
  const empty: SpurPreview = {
    detected: false,
    hits: [],
    acceptEnabled: false,
    acceptBlockedReason: SPUR_ACCEPT_BLOCK,
    warnings: [],
    legs: [],
    discrepancy: '',
    sortie2: '',
    distinctPoints: [],
    efficiency: { savingsClaimed: false, excluded: [] },
  }
  if (hits.length === 0) return empty

  let flags = opts.flags ?? []
  let built: ReturnType<typeof buildOffsetRoutes> | null = null
  if (opts.legWidths && opts.legWidths.length === opts.waypoints.length - 1) {
    try {
      built = buildOffsetRoutes(opts.waypoints as OffsetRoutePoint[], opts.legWidths)
      flags = built.flags
    } catch {
      built = null
    }
  }

  const legs: SpurLegLabel[] = []
  for (let index = 0; index < opts.waypoints.length - 1; index++) {
    const from = opts.waypoints[index]
    const to = opts.waypoints[index + 1]
    const bearing = bearingDeg(from, to)
    const chord = built
      ? [built.inner.waypoints[index], built.inner.waypoints[index + 1]]
      : null
    const startCross = chord ? crossTrackNm(chord[0], from, to) : 0
    const endCross = chord ? crossTrackNm(chord[1], from, to) : 0
    const crosses = chord != null && startCross * endCross < -0.2
    const side = !chord
      ? 'not measured until corridor widths are available'
      : crosses
        ? 'crosses the centerline'
        : geographicSide(bearing, startCross)
    legs.push({
      from: pointName(from),
      to: pointName(to),
      travel: compass(bearing),
      geographicSide: side,
      ofTrack: built ? 'inner track midpoint' : 'centerline only',
      proposalRole: roleFor(index, hits, opts.sortie1Side ?? null),
    })
  }

  const side = opts.sortie1Side ?? null
  const discrepancy =
    side === 'inner'
      ? 'The saved first side is Inner, so Sortie 1 currently follows the inside of the main route. The proposal puts the outside of the main route on Sortie 1 and the inside on Sortie 2. This preview does not move either file onto one side.'
      : side === 'outer'
        ? 'The saved first side is Outer, which is the proposal’s main-route role for Sortie 1. Sortie 2 would be the inside. The spur return is still unresolved, so this preview does not drop the spur from Sortie 2.'
        : 'No first side is saved. The proposal still needs Sortie 1 outside on the main route and Sortie 2 inside, after the spur turn is defined.'

  return {
    detected: true,
    hits,
    acceptEnabled: false,
    acceptBlockedReason: SPUR_ACCEPT_BLOCK,
    warnings: flags.map((flag) => flag.message),
    legs,
    discrepancy,
    sortie2:
      'Sortie 2 keeps the spur. Removing it waits until the opposite parallel is covered along the whole spur, not only at the endpoints. That coverage is unverified while the turn is unresolved.',
    distinctPoints: distinctSameLetters(opts.waypoints),
    efficiency: {
      savingsClaimed: false,
      excluded: [
        'The turnaround between the two offset endpoints at the spur.',
        'Any connector from the spur return onto the main route.',
      ],
    },
  }
}
