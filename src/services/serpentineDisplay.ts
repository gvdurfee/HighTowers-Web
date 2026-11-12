/**
 * Map-only flyby turns for the team serpentine overlay.
 * Used when more than one team is assigned to the same route on the same day.
 * Does not change offsets, waypoint names, sortie order, or .fpl output.
 *
 * Groundspeed is a typical low-level survey speed.
 * The radius is a standard-rate turn (3 degrees per second) at that speed:
 * the airplane turns early, the arc stays tangent to both legs, and the
 * waypoint stays on the outside of the turn.
 */
export const SERPENTINE_FLYBY = {
  groundspeedKnots: 120,
  standardRateDegPerSecond: 3,
  /**
   * A near-reverse flyby at the standard-rate radius would begin many miles
   * before the fix. Keep the turnaround inside this lead so it stays at the
   * crossover. The radius shrinks just enough to remain tangent to both legs.
   */
  maxLeadNm: 2,
} as const

export const SERPENTINE_YELLOW = '#FFD911'
export const SERPENTINE_TURN_BLUE = '#0E2B8D'
/** Brighter than CAP ultramarine so the centerline and arrows read on satellite imagery. */
export const MAP_ROUTE_BLUE = '#3F00FF'

/** Quiet at the whole-route view, readable when zoomed in. */
export const LEG_ARROW_MIN_PX = 8
export const LEG_ARROW_MAX_PX = 16

/** A shorter straight middle has no room for an arrow clear of the corner arcs. */
const MIN_ARROW_LEG_NM = 0.8
const MIN_STRAIGHT_NM = 0.4

export function legArrowSizePx(zoom: number): number {
  const scaled = LEG_ARROW_MIN_PX + (zoom - 6) * 1.25
  return Math.min(LEG_ARROW_MAX_PX, Math.max(LEG_ARROW_MIN_PX, Math.round(scaled)))
}

const EARTH_RADIUS_M = 6371000
const M_PER_NM = 1852
const NEAR_REVERSE_DEG = 120
const MIN_TURN_DEG = 8
const MAX_LEAD_FRACTION = 0.45

export type LonLat = [number, number]

export type FlybyTurn = {
  kind: 'flyby' | 'teardrop'
  turnDeg: number
  radiusNm: number
  leadNm: number
  standardRadiusNm: number
  start: LonLat
  end: LonLat
  /** Center of the circle tangent to the inbound leg. */
  center: LonLat
  /** Center of the circle tangent to the outbound leg. Same as center for a single arc. */
  endCenter: LonLat
  waypoint: LonLat
  samples: LonLat[]
  shade: LonLat[]
  /** True when a sample falls outside the published corridor edges. */
  outsideCorridor: boolean
  crossover: boolean
}

export type SerpentineArrow = {
  pass: 1 | 2
  lon: number
  lat: number
  bearing: number
  name: string
}

export type SerpentineLabel = {
  pass: 1 | 2
  name: string
  lon: number
  lat: number
  role: 'entry' | 'exit' | null
  bearing: number
  /** Screen direction, degrees from north, pointing away from the centerline. */
  awayBearing?: number
}

export type LaneCaption = {
  text: string
  lon: number
  lat: number
}

export type LegArrow = {
  fromName: string
  toName: string
  lon: number
  lat: number
  bearing: number
  /** Ultramarine on the yellow passes. Yellow on the blue turnaround. */
  color: string
  turnaround: boolean
}

export type TransitAirport = {
  identifier: string
  latitude: number
  longitude: number
  /** Shown on the map marker. A refuel stop uses "KTCC — refuel". */
  caption?: string
}

/** Dashed leg between a saved airport and the survey, not part of the yellow path. */
export type TransitLeg = {
  role: 'departure' | 'landing'
  identifier: string
  caption: string
  coordinates: LonLat[]
  arrow: LegArrow | null
}

export const NO_DEPARTURE_AIRPORT_NOTE = 'No departure airport set.'
export const NO_LANDING_AIRPORT_NOTE = 'No landing airport set.'

/** Map View opens on Sortie 1. The page remembers a later choice until it closes. */
export const DEFAULT_MAP_SORTIE = 1 as const

export type MapSortieNumber = 1 | 2

/**
 * The sortie to draw. A crew with one sortie keeps that sortie.
 * The blue turnaround joins Sortie 1 to Sortie 2, so it is not part of either sortie.
 */
export function passesForSortie<T extends { number: MapSortieNumber }>(
  passes: T[],
  sortie: MapSortieNumber
): T[] {
  if (passes.length <= 1) return passes
  return passes.filter((pass) => pass.number === sortie)
}

/**
 * Sortie 1 leaves the plan departure and lands at the plan destination.
 * Sortie 2 swaps those ends, matching the offset .fpl for that sortie.
 */
export function airportsForSortie(
  sortie: MapSortieNumber,
  airports: { departure?: TransitAirport | null; landing?: TransitAirport | null }
): { departure: TransitAirport | null; landing: TransitAirport | null } {
  const departure = airports.departure ?? null
  const landing = airports.landing ?? null
  if (sortie === 2) return { departure: landing, landing: departure }
  return { departure, landing }
}

export type SkippedLegArrow = {
  fromName: string
  toName: string
  lengthNm: number
}

export type SerpentineDisplay = {
  groundspeedKnots: number
  standardRadiusNm: number
  flow: LonLat[]
  /** One yellow line per width piece. A single piece is the same line as `flow`. */
  flows: LonLat[][]
  shades: LonLat[][]
  turns: FlybyTurn[]
  /** One polyline per turnaround, drawn in blue on top of the yellow path. */
  crossoverLegs: LonLat[][]
  /** Pass 1 and Pass 2 start arrows. */
  arrows: SerpentineArrow[]
  /** One arrow at the midpoint of each leg that has room for one. */
  legArrows: LegArrow[]
  skippedLegArrows: SkippedLegArrow[]
  labels: SerpentineLabel[]
  /** Offset caption at the middle of each lane, for example "3 NM left". */
  laneCaptions: LaneCaption[]
  /** Departure to the entry, and the exit to the landing airport, when those airports are saved. */
  airportLegs: TransitLeg[]
  airportNotes: string[]
}

type LatLon = { lat: number; lon: number }

type DisplayPass = {
  number: 1 | 2
  coordinates: LonLat[]
  waypoints: Array<{ lat: number; lon: number; name: string; surveySide?: 'left' | 'right' }>
  laneIndex?: number
  laneGroup?: number
  offsetNm?: number
  surveySide?: 'left' | 'right'
}

function comparePasses(a: DisplayPass, b: DisplayPass): number {
  return a.number - b.number || (a.laneGroup ?? 0) - (b.laneGroup ?? 0) || (a.laneIndex ?? 0) - (b.laneIndex ?? 0)
}

/** Width changes are separate pieces. A classic two-sortie path has no lane group and stays one piece. */
function splitLaneGroups(passes: DisplayPass[]): DisplayPass[][] {
  const ordered = [...passes].sort(comparePasses)
  if (!ordered.some((pass) => pass.laneGroup != null)) return [ordered]
  const groups: DisplayPass[][] = []
  for (const pass of ordered) {
    const group = pass.laneGroup ?? 0
    const last = groups[groups.length - 1]
    if (!last || (last[0].laneGroup ?? 0) !== group) groups.push([pass])
    else last.push(pass)
  }
  return groups
}

function offsetCaption(nm: number, side: 'left' | 'right'): string {
  const rounded = Math.round(nm * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${text} NM ${side}`
}

type Vertex = { coord: LonLat; crossover: boolean }

export function standardRateRadiusNm(
  groundspeedKnots: number = SERPENTINE_FLYBY.groundspeedKnots
): number {
  const omega = (SERPENTINE_FLYBY.standardRateDegPerSecond * Math.PI) / 180
  return groundspeedKnots / 3600 / omega
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function distanceNm(a: LatLon, b: LatLon): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return (2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))) / M_PER_NM
}

function destination(origin: LatLon, bearing: number, distanceNmValue: number): LatLon {
  const δ = (distanceNmValue * M_PER_NM) / EARTH_RADIUS_M
  const θ = (bearing * Math.PI) / 180
  const φ1 = (origin.lat * Math.PI) / 180
  const λ1 = (origin.lon * Math.PI) / 180
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    )
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
  }
}

function signedTurn(inbound: number, outbound: number): number {
  let delta = outbound - inbound
  while (delta > 180) delta -= 360
  while (delta <= -180) delta += 360
  return delta
}

function toLatLon(coord: LonLat): LatLon {
  return { lon: coord[0], lat: coord[1] }
}

function toLonLat(point: LatLon): LonLat {
  return [point.lon, point.lat]
}

function samePoint(a: LonLat, b: LonLat): boolean {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7
}

function ringContains(point: LonLat, ring: LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crosses = (yi > point[1]) !== (yj > point[1])
    if (!crosses) continue
    const xCross = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    if (point[0] < xCross) inside = !inside
  }
  return inside
}

function corridorRing(
  left: Array<{ lat: number; lon: number }> | undefined,
  right: Array<{ lat: number; lon: number }> | undefined
): LonLat[] | null {
  if (!left || !right || left.length < 2 || right.length < 2) return null
  const ring: LonLat[] = left.map((point) => [point.lon, point.lat])
  for (let i = right.length - 1; i >= 0; i--) ring.push([right[i].lon, right[i].lat])
  return ring
}

function outsideCorridor(samples: LonLat[], ring: LonLat[] | null): boolean {
  if (!ring) return false
  return samples.some((sample) => !ringContains(sample, ring))
}

type BuiltTurn = FlybyTurn | null

function buildTurn(
  prev: LonLat,
  waypoint: LonLat,
  next: LonLat,
  ring: LonLat[] | null,
  crossover: boolean
): BuiltTurn {
  const p = toLatLon(prev)
  const w = toLatLon(waypoint)
  const n = toLatLon(next)
  const legIn = distanceNm(p, w)
  const legOut = distanceNm(w, n)
  if (legIn < 0.02 || legOut < 0.02) return null
  const inbound = bearingDeg(p, w)
  const outbound = bearingDeg(w, n)
  const turn = signedTurn(inbound, outbound)
  const turnAbs = Math.abs(turn)
  if (turnAbs < MIN_TURN_DEG || turnAbs > 179.5) return null

  const standardRadiusNm = standardRateRadiusNm()
  const halfTurn = (turnAbs * Math.PI) / 180 / 2
  const tanHalf = Math.tan(halfTurn)
  if (!(tanHalf > 0)) return null
  const filletLead = standardRadiusNm * tanHalf
  let radiusNm = standardRadiusNm
  let leadNm = filletLead
  const maxLead = Math.min(SERPENTINE_FLYBY.maxLeadNm, MAX_LEAD_FRACTION * Math.min(legIn, legOut))
  if (leadNm > maxLead) {
    leadNm = maxLead
    radiusNm = leadNm / tanHalf
  }
  if (leadNm < 0.02 || radiusNm < 0.02) return null

  const arc = circleSamples(w, inbound, outbound, turn, leadNm, radiusNm)
  if (!arc) return null
  return {
    kind: turnAbs >= NEAR_REVERSE_DEG ? 'teardrop' : 'flyby',
    turnDeg: turn,
    radiusNm,
    leadNm,
    standardRadiusNm,
    ...arc,
    waypoint,
    shade: [...arc.samples, waypoint],
    outsideCorridor: outsideCorridor(arc.samples, ring),
    crossover,
  }
}

function circleSamples(
  w: LatLon,
  inbound: number,
  outbound: number,
  turn: number,
  leadNm: number,
  radiusNm: number
): { start: LonLat; end: LonLat; center: LonLat; endCenter: LonLat; samples: LonLat[] } | null {
  const start = destination(w, inbound + 180, leadNm)
  const end = destination(w, outbound, leadNm)
  const insideBearing = inbound + (turn > 0 ? 90 : -90)
  const center = destination(start, insideBearing, radiusNm)
  const startAng = bearingDeg(center, start)
  const endAng = bearingDeg(center, end)
  let sweep = signedTurn(startAng, endAng)
  if (turn > 0 && sweep < 0) sweep += 360
  if (turn < 0 && sweep > 0) sweep -= 360
  const steps = Math.max(12, Math.ceil(Math.abs(sweep) / 3))
  const samples: LonLat[] = []
  for (let step = 0; step <= steps; step++) {
    const angle = startAng + sweep * (step / steps)
    samples.push(toLonLat(destination(center, angle, radiusNm)))
  }
  const centerCoord = toLonLat(center)
  return { start: toLonLat(start), end: toLonLat(end), center: centerCoord, endCenter: centerCoord, samples }
}

function combinePasses(passes: DisplayPass[]): Vertex[] {
  const vertices: Vertex[] = []
  const push = (coord: LonLat, crossover: boolean) => {
    const prev = vertices[vertices.length - 1]
    if (prev && samePoint(prev.coord, coord)) {
      prev.crossover = prev.crossover || crossover
      return
    }
    vertices.push({ coord, crossover })
  }
  const ordered = [...passes].sort(comparePasses)
  ordered.forEach((pass, passIndex) => {
    pass.waypoints.forEach((point, index) => {
      const endOfPass = index === pass.waypoints.length - 1
      push([point.lon, point.lat], endOfPass && passIndex < ordered.length - 1)
    })
  })
  return vertices
}

function labelBearing(
  waypoints: Array<{ lat: number; lon: number }>,
  index: number
): number {
  const current = waypoints[index]
  const next = waypoints[index + 1]
  const prev = waypoints[index - 1]
  if (next) return bearingDeg(current, next)
  if (prev) return bearingDeg(prev, current)
  return 0
}

function arrowOnLeg(
  pass: 1 | 2,
  from: { lat: number; lon: number; name: string },
  to: { lat: number; lon: number } | undefined,
  capNm: number
): SerpentineArrow | null {
  if (!to) return null
  const dist = distanceNm(from, to)
  if (dist < 0.05) return null
  const travel = Math.min(capNm, dist * 0.2)
  const point = destination(from, bearingDeg(from, to), Math.max(travel, Math.min(0.15, dist * 0.5)))
  return {
    pass,
    lon: point.lon,
    lat: point.lat,
    bearing: bearingDeg(from, to),
    name: from.name,
  }
}

function leadAt(turns: FlybyTurn[], point: { lat: number; lon: number }): number {
  const turn = turns.find((item) => samePoint(item.waypoint, [point.lon, point.lat]))
  return turn?.leadNm ?? 0
}

/** The flown crossover from the end of one pass to the start of the next, including its flyby arc. */
function turnaroundLines(passes: DisplayPass[], turns: FlybyTurn[]): LonLat[][] {
  const ordered = [...passes].sort(comparePasses)
  const lines: LonLat[][] = []
  for (let index = 0; index < ordered.length - 1; index++) {
    const from = ordered[index].waypoints.at(-1)
    const to = ordered[index + 1].waypoints[0]
    if (!from || !to) continue
    const fromCoord: LonLat = [from.lon, from.lat]
    const toCoord: LonLat = [to.lon, to.lat]
    if (samePoint(fromCoord, toCoord)) continue
    const arc = turns.find((turn) => turn.crossover && samePoint(turn.waypoint, fromCoord))
    const nextTurn = turns.find((turn) => samePoint(turn.waypoint, toCoord))
    const line: LonLat[] = arc ? [...arc.samples] : [fromCoord]
    const end = nextTurn?.start ?? toCoord
    const last = line[line.length - 1]
    const fromPoint = toLatLon(fromCoord)
    if (
      last &&
      !samePoint(last, end) &&
      distanceNm(fromPoint, toLatLon(end)) > distanceNm(fromPoint, toLatLon(last)) + 0.01
    ) {
      line.push(end)
    }
    if (line.length >= 2) lines.push(line)
  }
  return lines
}

function savedAirport(airport: TransitAirport | null | undefined): TransitAirport | null {
  if (!airport) return null
  const identifier = airport.identifier.trim()
  if (!identifier) return null
  if (!Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude)) return null
  return {
    identifier,
    latitude: airport.latitude,
    longitude: airport.longitude,
    caption: airport.caption,
  }
}

/** Notes for airports the crew does not have. Does not look up or invent an airport. */
export function crewAirportNotes(airports?: {
  departure?: TransitAirport | null
  landing?: TransitAirport | null
}): string[] {
  const notes: string[] = []
  if (!savedAirport(airports?.departure)) notes.push(NO_DEPARTURE_AIRPORT_NOTE)
  if (!savedAirport(airports?.landing)) notes.push(NO_LANDING_AIRPORT_NOTE)
  return notes
}

function transitLeg(
  role: 'departure' | 'landing',
  airport: TransitAirport,
  waypoint: { name: string; lat: number; lon: number },
  fromAirport: boolean
): TransitLeg | null {
  const airportPoint = { name: airport.identifier, lat: airport.latitude, lon: airport.longitude }
  const from = fromAirport ? airportPoint : waypoint
  const to = fromAirport ? waypoint : airportPoint
  if (samePoint([from.lon, from.lat], [to.lon, to.lat])) return null
  const placed = legArrowFor(from, to, [], false)
  return {
    role,
    identifier: airport.identifier,
    caption: airport.caption?.trim() || airport.identifier,
    coordinates: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    arrow: placed.arrow,
  }
}

function buildAirportLegs(
  passes: DisplayPass[],
  airports?: { departure?: TransitAirport | null; landing?: TransitAirport | null }
): { airportLegs: TransitLeg[]; airportNotes: string[] } {
  const ordered = [...passes].sort(comparePasses)
  const entry = ordered[0]?.waypoints[0]
  const exit = ordered[ordered.length - 1]?.waypoints.at(-1)
  const legs: TransitLeg[] = []
  const departure = savedAirport(airports?.departure)
  const landing = savedAirport(airports?.landing)
  if (departure && entry) {
    const leg = transitLeg('departure', departure, entry, true)
    if (leg) legs.push(leg)
  }
  if (landing && exit) {
    const leg = transitLeg('landing', landing, exit, false)
    if (leg) legs.push(leg)
  }
  return { airportLegs: legs, airportNotes: crewAirportNotes(airports) }
}

function legArrowFor(
  from: { name: string; lat: number; lon: number },
  to: { name: string; lat: number; lon: number },
  turns: FlybyTurn[],
  turnaround: boolean
): { arrow: LegArrow | null; skipped: SkippedLegArrow | null } {
  const dist = distanceNm(from, to)
  const straight = dist - leadAt(turns, from) - leadAt(turns, to)
  if (dist < MIN_ARROW_LEG_NM || straight < MIN_STRAIGHT_NM) {
    return { arrow: null, skipped: { fromName: from.name, toName: to.name, lengthNm: dist } }
  }
  const mid = destination(from, bearingDeg(from, to), dist / 2)
  return {
    arrow: {
      fromName: from.name,
      toName: to.name,
      lon: mid.lon,
      lat: mid.lat,
      bearing: bearingDeg(from, to),
      color: MAP_ROUTE_BLUE,
      turnaround,
    },
    skipped: null,
  }
}

export function buildSerpentineDisplay(
  passes: DisplayPass[],
  corridor?: {
    left?: Array<{ lat: number; lon: number }>
    right?: Array<{ lat: number; lon: number }>
  },
  airports?: { departure?: TransitAirport | null; landing?: TransitAirport | null }
): SerpentineDisplay {
  const groups = splitLaneGroups(passes)
  if (groups.length > 1) {
    const parts = groups.map((group) => buildSerpentineDisplay(group, corridor))
    const labels = parts.flatMap((part) => part.labels)
    if (passes.length > 0 && passes.every((pass) => pass.number === passes[0].number)) {
      for (const label of labels) label.role = null
      if (labels[0]) labels[0].role = 'entry'
      const last = labels[labels.length - 1]
      if (last && labels.length > 1) last.role = 'exit'
    }
    return {
      groundspeedKnots: parts[0].groundspeedKnots,
      standardRadiusNm: parts[0].standardRadiusNm,
      flow: parts[0].flow,
      flows: parts.flatMap((part) => part.flows),
      shades: parts.flatMap((part) => part.shades),
      turns: parts.flatMap((part) => part.turns),
      crossoverLegs: parts.flatMap((part) => part.crossoverLegs),
      arrows: parts.flatMap((part) => part.arrows),
      legArrows: parts.flatMap((part) => part.legArrows),
      skippedLegArrows: parts.flatMap((part) => part.skippedLegArrows),
      labels,
      laneCaptions: parts.flatMap((part) => part.laneCaptions),
      ...buildAirportLegs(passes, airports),
    }
  }
  const piece = groups[0] ?? []
  const standardRadius = standardRateRadiusNm()
  const ring = corridorRing(corridor?.left, corridor?.right)
  const vertices = combinePasses(piece)
  const turns: FlybyTurn[] = []
  for (let index = 1; index < vertices.length - 1; index++) {
    const turn = buildTurn(
      vertices[index - 1].coord,
      vertices[index].coord,
      vertices[index + 1].coord,
      ring,
      vertices[index].crossover
    )
    if (turn) turns.push(turn)
  }

  const flow: LonLat[] = []
  const pushFlow = (coord: LonLat) => {
    const prev = flow[flow.length - 1]
    if (!prev || !samePoint(prev, coord)) flow.push(coord)
  }
  if (vertices.length > 0) pushFlow(vertices[0].coord)
  for (let index = 1; index < vertices.length; index++) {
    const turn = turns.find((item) => samePoint(item.waypoint, vertices[index].coord))
    if (turn) {
      for (const sample of turn.samples) pushFlow(sample)
    } else {
      pushFlow(vertices[index].coord)
    }
  }

  // Blue turnarounds join the lanes of this piece. A one-lane sortie has none.
  const crossoverLegs = turnaroundLines(piece, turns)

  const arrows: SerpentineArrow[] = []
  const legArrows: LegArrow[] = []
  const skippedLegArrows: SkippedLegArrow[] = []
  const labels: SerpentineLabel[] = []
  const laneCaptions: LaneCaption[] = []
  const orderedPasses = [...piece].sort(comparePasses)
  const oneSortie = orderedPasses.length > 0 && orderedPasses.every((pass) => pass.number === orderedPasses[0].number)
  const multiLane = oneSortie && orderedPasses.length > 1
  orderedPasses.forEach((pass, passIndex) => {
    pass.waypoints.forEach((point, index) => {
      if (multiLane && passIndex > 0 && index === 0) {
        const previous = orderedPasses[passIndex - 1].waypoints.at(-1)
        if (previous && previous.name === point.name) return
      }
      const lastPass = passIndex === orderedPasses.length - 1
      const lastPoint = index === pass.waypoints.length - 1
      const role = oneSortie
        ? passIndex === 0 && index === 0
          ? 'entry'
          : lastPass && lastPoint
            ? 'exit'
            : null
        : pass.number === 1 && index === 0
          ? 'entry'
          : pass.number === 2 && index === pass.waypoints.length - 1
            ? 'exit'
            : null
      labels.push({
        pass: pass.number,
        name: point.name,
        lon: point.lon,
        lat: point.lat,
        role,
        bearing: labelBearing(pass.waypoints, index),
        awayBearing: (point.surveySide ?? pass.surveySide)
          ? trackAwayBearing(pass.waypoints, index, (point.surveySide ?? pass.surveySide)!)
          : undefined,
      })
    })
    if (pass.offsetNm != null && pass.surveySide && pass.waypoints.length >= 2) {
      const mid = Math.floor((pass.waypoints.length - 1) / 2)
      const from = pass.waypoints[mid]
      const to = pass.waypoints[mid + 1]
      const point = destination(from, bearingDeg(from, to), distanceNm(from, to) / 2)
      laneCaptions.push({
        text: offsetCaption(pass.offsetNm, pass.surveySide),
        lon: point.lon,
        lat: point.lat,
      })
    }
    const first = pass.waypoints[0]
    const second = pass.waypoints[1]
    if (first && (!multiLane || passIndex === 0)) {
      const arrow = arrowOnLeg(pass.number, first, second, pass.number === 1 ? 2 : 1.2)
      if (arrow) arrows.push(arrow)
    }
    for (let index = 0; index < pass.waypoints.length - 1; index++) {
      const placed = legArrowFor(pass.waypoints[index], pass.waypoints[index + 1], turns, false)
      if (placed.arrow) legArrows.push(placed.arrow)
      if (placed.skipped) skippedLegArrows.push(placed.skipped)
    }
  })
  for (let index = 0; index < orderedPasses.length - 1; index++) {
    const from = orderedPasses[index].waypoints.at(-1)
    const to = orderedPasses[index + 1].waypoints[0]
    if (!from || !to || samePoint([from.lon, from.lat], [to.lon, to.lat])) continue
    const placed = legArrowFor(from, to, turns, true)
    if (placed.arrow) legArrows.push(placed.arrow)
    if (placed.skipped) skippedLegArrows.push(placed.skipped)
  }

  return {
    groundspeedKnots: SERPENTINE_FLYBY.groundspeedKnots,
    standardRadiusNm: standardRadius,
    flow,
    flows: [flow],
    shades: turns.map((turn) => turn.shade),
    turns,
    crossoverLegs,
    arrows,
    legArrows,
    skippedLegArrows,
    labels,
    laneCaptions,
    ...buildAirportLegs(passes, airports),
  }
}

/** Screen offset so a name sits beside the yellow line, not on it. */
export function labelPixelOffset(bearing: number): [number, number] {
  const rad = ((bearing + 90) * Math.PI) / 180
  return [Math.round(Math.sin(rad) * 18), Math.round(-Math.cos(rad) * 18)]
}

/** How far an offset-track name sits off its waypoint, in screen pixels, at every zoom. */
export const OFFSET_MARKER_PX = 18

function normBearing(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Direction of travel. At a corner this is the bisector; a reversal keeps the incoming leg. */
export function travelHeading(
  waypoints: Array<{ lat: number; lon: number }>,
  index: number
): number {
  const current = waypoints[index]
  const prev = waypoints[index - 1]
  const next = waypoints[index + 1]
  if (!current) return 0
  if (prev && next) {
    const inbound = bearingDeg(prev, current)
    const outbound = bearingDeg(current, next)
    const east = Math.sin((inbound * Math.PI) / 180) + Math.sin((outbound * Math.PI) / 180)
    const north = Math.cos((inbound * Math.PI) / 180) + Math.cos((outbound * Math.PI) / 180)
    if (Math.hypot(east, north) < 1e-6) return inbound
    return normBearing((Math.atan2(east, north) * 180) / Math.PI)
  }
  if (next) return bearingDeg(current, next)
  if (prev) return bearingDeg(prev, current)
  return 0
}

/** Perpendicular to the track, on the side that faces away from the centerline. */
export function trackAwayBearing(
  waypoints: Array<{ lat: number; lon: number }>,
  index: number,
  side: 'left' | 'right'
): number {
  return normBearing(travelHeading(waypoints, index) + (side === 'right' ? 90 : -90))
}

/** The label grows further away from the centerline. The waypoint coordinate stays put. */
export function markerPlacementAway(awayBearing: number): {
  offset: [number, number]
  anchor: 'left' | 'right' | 'top' | 'bottom'
} {
  const rad = (awayBearing * Math.PI) / 180
  const x = Math.sin(rad)
  const y = -Math.cos(rad)
  if (Math.abs(x) >= Math.abs(y)) {
    return {
      offset: [Math.round(Math.sign(x || 1) * OFFSET_MARKER_PX), Math.round(y * 8)],
      anchor: x >= 0 ? 'left' : 'right',
    }
  }
  return {
    offset: [Math.round(x * 8), Math.round(Math.sign(y || 1) * OFFSET_MARKER_PX)],
    anchor: y >= 0 ? 'top' : 'bottom',
  }
}

/** Place the name so it grows away from the flown line. */
export function labelPlacement(bearing: number): {
  offset: [number, number]
  anchor: 'left' | 'right' | 'top' | 'bottom'
} {
  const rad = ((bearing + 90) * Math.PI) / 180
  const x = Math.sin(rad)
  const y = -Math.cos(rad)
  if (Math.abs(x) >= Math.abs(y)) {
    return {
      offset: [Math.round(Math.sign(x) * 6), Math.round(y * 6)],
      anchor: x >= 0 ? 'left' : 'right',
    }
  }
  return {
    offset: [Math.round(x * 6), Math.round(Math.sign(y) * 6)],
    anchor: y >= 0 ? 'top' : 'bottom',
  }
}
