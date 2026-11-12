import { orderSortieTrack, type SortieSide } from '@/services/offsetRouteFpl'
import { crossTrackNm, type OffsetRoutePoint } from '@survey-planning/offsetRoutePlan.js'

export type CrewOverlayId = 'team1' | 'team2' | 'team3'

export type SerpentineAirport = {
  identifier: string
  latitude: number
  longitude: number
}

export type SerpentinePass = {
  number: 1 | 2
  side: SortieSide
  names: string[]
  /** [lon, lat] along this lane. Airport transits are drawn separately. */
  coordinates: [number, number][]
  waypoints: Array<{ lat: number; lon: number; name: string; surveySide?: 'left' | 'right' }>
  laneIndex?: number
  laneGroup?: number
  offsetNm?: number
  surveySide?: 'left' | 'right'
}

/**
 * One crew's two offset sorties, joined so the map can show the turnaround.
 * For assigning more than one team to the same route on the same day.
 */
export type CrewSerpentine = {
  id: CrewOverlayId
  label: string
  airport: string | null
  passes: SerpentinePass[]
}

function waypointName(point: OffsetRoutePoint): string {
  return point.g1000Name || point.ptIdent
}

/** [lon, lat] through one sortie's labeled waypoints, in flight order. */
export function sortieWaypointLine(
  waypoints: Array<{ lon: number; lat: number }>
): [number, number][] {
  return waypoints.map((point) => [point.lon, point.lat])
}

/** Which side of the centerline this flown track is on. Positive cross-track is right. */
export function surveySideOfTrack(
  track: Array<{ lat: number; lon: number }>,
  centerline: Array<{ lat: number; lon: number }>
): 'left' | 'right' | undefined {
  const count = Math.min(track.length, centerline.length)
  for (let index = 0; index < count; index += 1) {
    const a = centerline[Math.max(0, index - 1)]
    const b = centerline[Math.min(count - 1, Math.max(index, 1))]
    if (a.lat === b.lat && a.lon === b.lon) continue
    const cross = crossTrackNm(track[index], a, b)
    if (Math.abs(cross) >= 0.02) return cross > 0 ? 'right' : 'left'
  }
  return undefined
}

function passFromTrack(opts: {
  number: 1 | 2
  side: SortieSide
  track: OffsetRoutePoint[]
  start: SerpentineAirport | null
  end: SerpentineAirport | null
  centerline?: Array<{ lat: number; lon: number }>
}): SerpentinePass {
  const ordered = opts.track
  const coordinates: [number, number][] = []
  if (opts.start) coordinates.push([opts.start.longitude, opts.start.latitude])
  for (const point of ordered) coordinates.push([point.lon, point.lat])
  if (opts.end) coordinates.push([opts.end.longitude, opts.end.latitude])
  return {
    number: opts.number,
    side: opts.side,
    names: ordered.map(waypointName),
    coordinates,
    waypoints: ordered.map((point) => ({
      lat: point.lat,
      lon: point.lon,
      name: waypointName(point),
    })),
    surveySide: opts.centerline ? surveySideOfTrack(ordered, opts.centerline) : undefined,
  }
}

/**
 * Assemble one crew's overlay from offset tracks the app already built.
 * Does not recompute offsets or rename waypoints.
 */
export function serpentineFromTracks(opts: {
  id: CrewOverlayId
  label: string
  sortie1Side: SortieSide
  inner: OffsetRoutePoint[]
  outer: OffsetRoutePoint[]
  departure?: SerpentineAirport | null
  destination?: SerpentineAirport | null
  /** Published centerline, same order as the unreversed offset tracks. Display only. */
  centerline?: Array<{ lat: number; lon: number }>
}): CrewSerpentine {
  const departure = opts.departure ?? null
  const destination = opts.destination ?? null
  const centerline = opts.centerline ?? []
  const reversedCenterline = [...centerline].reverse()
  const sortie1 = orderSortieTrack({
    inner: opts.inner,
    outer: opts.outer,
    sortie1Side: opts.sortie1Side,
    sortieNumber: 1,
  })
  const sortie2 = orderSortieTrack({
    inner: opts.inner,
    outer: opts.outer,
    sortie1Side: opts.sortie1Side,
    sortieNumber: 2,
  })
  return {
    id: opts.id,
    label: opts.label,
    airport: departure?.identifier ?? null,
    passes: [
      passFromTrack({
        number: 1,
        side: sortie1.side,
        track: sortie1.waypoints,
        start: departure,
        end: destination,
        centerline,
      }),
      passFromTrack({
        number: 2,
        side: sortie2.side,
        track: sortie2.waypoints,
        start: destination,
        end: departure,
        centerline: reversedCenterline,
      }),
    ],
  }
}

export function emptyCrewOverlay(id: CrewOverlayId, label: string): CrewSerpentine {
  return { id, label, airport: null, passes: [] }
}

/** The overlay to draw. Every other crew's path is left out. */
export function selectedCrewOverlay(
  overlays: CrewSerpentine[],
  selectedId: CrewOverlayId
): CrewSerpentine | null {
  return overlays.find((overlay) => overlay.id === selectedId) ?? null
}

/** Where Pass 1 ends and Pass 2 begins. Null when that crew has no two-pass path. */
export function crossoverEnds(
  overlay: CrewSerpentine | null
): { pass1End: [number, number]; pass2Start: [number, number] } | null {
  const pass1End = overlay?.passes[0]?.coordinates.at(-1)
  const pass2Start = overlay?.passes[1]?.coordinates[0]
  if (!pass1End || !pass2Start) return null
  return { pass1End, pass2Start }
}
