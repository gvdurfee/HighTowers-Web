/**
 * Halfway-offset flight tracks for an MTR corridor.
 * Each side sits halfway from the centerline to that side's published edge
 * (6 NM side → 3 NM offset). Corners are the intersection of the adjacent
 * shifted legs. Sharp turns do not gain extra waypoints; bad corners are flagged.
 */

import { halfWidthNmForLeg, legContainedInSpan, readMtrWidth } from './mtrWidthParser.js'
import { assignOffsetWaypointNames, G1000_USER_WAYPOINT_ID_MAX_LEN } from './g1000Names.js'

export { G1000_USER_WAYPOINT_ID_MAX_LEN }

const EARTH_RADIUS_M = 6371000
const M_PER_NM = 1852

/**
 * @typedef {object} OffsetRoutePoint
 * @property {string} ptIdent
 * @property {string} [g1000Name]
 * @property {string} [originalName]
 * @property {number} lat
 * @property {number} lon
 */

/**
 * @typedef {object} OffsetLegWidth
 * @property {number} leftNm - Full corridor width left of centerline
 * @property {number} rightNm - Full corridor width right of centerline
 */

/**
 * @typedef {'foldBack' | 'outsideCorridor' | 'straightWidthChange'} OffsetFlagReason
 */

/**
 * @param {number} deg
 */
function toRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * @param {number} rad
 */
function toDeg(rad) {
  return (rad * 180) / Math.PI
}

/**
 * Local east/north meters around a corner. Accurate for the few-NM offsets
 * used on an MTR leg.
 * @param {number} lat
 * @param {number} lon
 * @param {number} lat0
 * @param {number} lon0
 */
function toLocal(lat, lon, lat0, lon0) {
  const north = EARTH_RADIUS_M * toRad(lat - lat0)
  const east = EARTH_RADIUS_M * Math.cos(toRad(lat0)) * toRad(lon - lon0)
  return { e: east, n: north }
}

/**
 * @param {number} east
 * @param {number} north
 * @param {number} lat0
 * @param {number} lon0
 */
function fromLocal(east, north, lat0, lon0) {
  const lat = lat0 + toDeg(north / EARTH_RADIUS_M)
  const cos = Math.cos(toRad(lat0))
  const lon = lon0 + toDeg(east / (EARTH_RADIUS_M * (Math.abs(cos) < 1e-8 ? 1e-8 : cos)))
  return { lat, lon }
}

function sub(a, b) {
  return { e: a.e - b.e, n: a.n - b.n }
}

function add(a, b) {
  return { e: a.e + b.e, n: a.n + b.n }
}

function scale(a, s) {
  return { e: a.e * s, n: a.n * s }
}

function dot(a, b) {
  return a.e * b.e + a.n * b.n
}

function hypot(a) {
  return Math.hypot(a.e, a.n)
}

function normalize(a) {
  const L = hypot(a)
  if (L < 1e-6) return null
  return scale(a, 1 / L)
}

/** Left of travel in the east/north frame (north → west). */
function leftUnit(dir) {
  const u = normalize(dir)
  if (!u) return null
  return { e: -u.n, n: u.e }
}

/**
 * @param {{ e: number, n: number }} origin
 * @param {{ e: number, n: number }} direction
 * @param {{ e: number, n: number }} origin2
 * @param {{ e: number, n: number }} direction2
 */
function lineIntersect(origin, direction, origin2, direction2) {
  const cross = direction.e * direction2.n - direction.n * direction2.e
  const scaleRef = hypot(direction) * hypot(direction2)
  if (scaleRef < 1e-6 || Math.abs(cross) < 1e-8 * scaleRef) return null
  const dp = sub(origin2, origin)
  const t = (dp.e * direction2.n - dp.n * direction2.e) / cross
  return add(origin, scale(direction, t))
}

/**
 * Signed cross-track in NM. Positive is right of A→B.
 * @param {{ lat: number, lon: number }} point
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 */
export function crossTrackNm(point, a, b) {
  const B = toLocal(b.lat, b.lon, a.lat, a.lon)
  const P = toLocal(point.lat, point.lon, a.lat, a.lon)
  const dir = normalize(B)
  if (!dir) return 0
  const right = { e: dir.n, n: -dir.e }
  return dot(P, right) / M_PER_NM
}

/**
 * Distance from a point to a finite leg, in NM.
 * @param {{ lat: number, lon: number }} point
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 */
export function distanceToSegmentNm(point, a, b) {
  const B = toLocal(b.lat, b.lon, a.lat, a.lon)
  const P = toLocal(point.lat, point.lon, a.lat, a.lon)
  const len2 = dot(B, B)
  if (len2 < 1) return hypot(P) / M_PER_NM
  const t = Math.min(1, Math.max(0, dot(P, B) / len2))
  return hypot(sub(P, scale(B, t))) / M_PER_NM
}

/**
 * @param {{ lat: number, lon: number }} point
 * @param {{ lat: number, lon: number }} legA
 * @param {{ lat: number, lon: number }} legB
 * @param {number} offsetM
 * @param {'left' | 'right'} side
 */
function offsetEndpoint(point, legA, legB, offsetM, side) {
  const A = toLocal(legA.lat, legA.lon, point.lat, point.lon)
  const B = toLocal(legB.lat, legB.lon, point.lat, point.lon)
  const left = leftUnit(sub(B, A))
  if (!left) return { lat: point.lat, lon: point.lon }
  const normal = side === 'left' ? left : scale(left, -1)
  return fromLocal(normal.e * offsetM, normal.n * offsetM, point.lat, point.lon)
}

/**
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 * @param {number} offsetM
 * @param {'left' | 'right'} side
 */
function offsetLegChord(a, b, offsetM, side) {
  return {
    start: offsetEndpoint(a, a, b, offsetM, side),
    end: offsetEndpoint(b, a, b, offsetM, side),
  }
}

/**
 * Heading change at `b`, in degrees, signed positive to the right, range (-180, 180].
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 * @param {{ lat: number, lon: number }} c
 */
export function courseChangeDeg(a, b, c) {
  const Bin = toLocal(a.lat, a.lon, b.lat, b.lon)
  const Bout = toLocal(c.lat, c.lon, b.lat, b.lon)
  const inDir = normalize(scale(Bin, -1))
  const outDir = normalize(Bout)
  if (!inDir || !outDir) return 0
  const cross = inDir.e * outDir.n - inDir.n * outDir.e
  const dotTurn = inDir.e * outDir.e + inDir.n * outDir.n
  const signedLeft = toDeg(Math.atan2(cross, dotTurn))
  return -signedLeft
}

/**
 * @param {OffsetRoutePoint[]} waypoints
 * @param {number[]} offsetNmPerLeg - Halfway (or full-edge) distance for each leg
 * @param {number[]} corridorNmPerLeg - Full side width used for the outside-corridor check
 * @param {'left' | 'right'} side
 */
export function buildOffsetTrack(waypoints, offsetNmPerLeg, corridorNmPerLeg, side) {
  if (waypoints.length < 2) {
    throw new Error('An offset route needs at least two waypoints.')
  }
  if (offsetNmPerLeg.length !== waypoints.length - 1) {
    throw new Error('Each leg needs an offset distance.')
  }
  const offsetsM = offsetNmPerLeg.map((nm) => {
    if (!Number.isFinite(nm) || nm < 0) throw new Error(`Invalid offset: ${nm}`)
    return nm * M_PER_NM
  })

  /** @type {OffsetRoutePoint[]} */
  const corners = []
  /** @type {Array<{ index: number, ptIdent: string, side: 'left' | 'right', reason: OffsetFlagReason, message: string, lat: number, lon: number }>} */
  const flags = []

  const remember = (index, lat, lon) => {
    corners.push({
      ptIdent: waypoints[index].ptIdent,
      g1000Name: waypoints[index].g1000Name,
      originalName: waypoints[index].originalName,
      lat,
      lon,
    })
  }

  const first = offsetLegChord(waypoints[0], waypoints[1], offsetsM[0], side)
  remember(0, first.start.lat, first.start.lon)

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prevNm = offsetNmPerLeg[i - 1]
    const nextNm = offsetNmPerLeg[i]
    const prev = offsetLegChord(waypoints[i - 1], waypoints[i], offsetsM[i - 1], side)
    const next = offsetLegChord(waypoints[i], waypoints[i + 1], offsetsM[i], side)
    const lat0 = waypoints[i].lat
    const lon0 = waypoints[i].lon
    const A = toLocal(prev.start.lat, prev.start.lon, lat0, lon0)
    const B = toLocal(prev.end.lat, prev.end.lon, lat0, lon0)
    const C = toLocal(next.start.lat, next.start.lon, lat0, lon0)
    const D = toLocal(next.end.lat, next.end.lon, lat0, lon0)
    const d1 = sub(B, A)
    const d2 = sub(D, C)
    const hit = lineIntersect(A, d1, C, d2)
    const ptIdent = waypoints[i].ptIdent

    if (!hit) {
      const useIncoming = fromLocal(B.e, B.n, lat0, lon0)
      remember(i, useIncoming.lat, useIncoming.lon)
      if (Math.abs(prevNm - nextNm) > 0.02) {
        flags.push({
          index: i,
          ptIdent,
          side,
          reason: 'straightWidthChange',
          lat: useIncoming.lat,
          lon: useIncoming.lon,
          message: `${ptIdent} changes width on a straight segment (${prevNm.toFixed(1)} NM to ${nextNm.toFixed(1)} NM). One corner cannot sit on both offsets, so this corner keeps the incoming half-width. No step waypoint was added.`,
        })
      }
      continue
    }

    const place = fromLocal(hit.e, hit.n, lat0, lon0)
    const hitDistNm = hypot(hit) / M_PER_NM
    const legSpanNm = Math.max(hypot(d1), hypot(d2)) / M_PER_NM
    const turn = Math.abs(courseChangeDeg(waypoints[i - 1], waypoints[i], waypoints[i + 1]))
    const exploded = !Number.isFinite(hitDistNm) || hitDistNm > Math.max(40, legSpanNm * 2)
    if (exploded) {
      const local = fromLocal(B.e, B.n, lat0, lon0)
      remember(i, local.lat, local.lon)
      flags.push({
        index: i,
        ptIdent,
        side,
        reason: 'foldBack',
        lat: local.lat,
        lon: local.lon,
        message: `${ptIdent} on the ${side} track does not join cleanly (course change ${turn.toFixed(0)}°). The corner stays on the incoming half-width. No extra waypoint was added.`,
      })
      continue
    }

    remember(i, place.lat, place.lon)

    const segIn = sub(B, A)
    const tIn = dot(segIn, segIn) < 1 ? 1 : dot(sub(hit, A), segIn) / dot(segIn, segIn)
    const segOut = sub(D, C)
    const tOut = dot(segOut, segOut) < 1 ? 1 : dot(sub(hit, C), segOut) / dot(segOut, segOut)
    if (tIn < -0.02 || tOut > 1.02) {
      flags.push({
        index: i,
        ptIdent,
        side,
        reason: 'foldBack',
        lat: place.lat,
        lon: place.lon,
        message: `${ptIdent} on the ${side} track folds back behind the previous leg (course change ${turn.toFixed(0)}°). No extra waypoint was added.`,
      })
    }

    const distNm = Math.min(
      distanceToSegmentNm(place, waypoints[i - 1], waypoints[i]),
      distanceToSegmentNm(place, waypoints[i], waypoints[i + 1])
    )
    const limitNm = Math.max(corridorNmPerLeg[i - 1] ?? 0, corridorNmPerLeg[i] ?? 0)
    if (distNm > limitNm + 0.05) {
      flags.push({
        index: i,
        ptIdent,
        side,
        reason: 'outsideCorridor',
        lat: place.lat,
        lon: place.lon,
        message: `${ptIdent} on the ${side} track is ${distNm.toFixed(1)} NM from the centerline, outside the ${limitNm.toFixed(1)} NM corridor. No extra waypoint was added.`,
      })
    }
  }

  const last = waypoints.length - 1
  const endChord = offsetLegChord(
    waypoints[last - 1],
    waypoints[last],
    offsetsM[offsetsM.length - 1],
    side
  )
  remember(last, endChord.end.lat, endChord.end.lon)

  return { side, waypoints: corners, flags }
}

/** |net turn| below this, or a signed area this small beside the route length, has no clear inside. */
const CURVE_TURN_MIN_DEG = 30
const CURVE_AREA_RATIO_MIN = 0.01

function curveEntryLabel(waypoints) {
  const point = waypoints?.[0]
  const raw = String(point?.ptIdent || point?.originalName || '').trim()
  return raw || 'the entry'
}

/**
 * Inside of the published centerline, closed from the exit back to the entry.
 * A clockwise route keeps the inside on the right of the direction of flight.
 * A counter-clockwise route keeps it on the left. A nearly straight or S-shaped
 * route keeps the inside on the left and says so.
 * @param {Array<{ lat: number, lon: number, ptIdent?: string, originalName?: string }>} waypoints
 */
export function routeCurveSide(waypoints) {
  const entry = curveEntryLabel(waypoints)
  const unclear = {
    innerSide: /** @type {'left'} */ ('left'),
    outerSide: /** @type {'right'} */ ('right'),
    sense: /** @type {'unclear'} */ ('unclear'),
    netTurnDeg: 0,
    note: `This route has no clear inside; Inner = left of the route flown from ${entry}.`,
  }
  if (!waypoints || waypoints.length < 3) return unclear
  const origin = waypoints[0]
  const local = waypoints.map((point) => toLocal(point.lat, point.lon, origin.lat, origin.lon))
  let twice = 0
  for (let i = 0; i < local.length; i++) {
    const next = local[(i + 1) % local.length]
    twice += local[i].e * next.n - next.e * local[i].n
  }
  const areaM2 = twice / 2
  let lengthM = 0
  for (let i = 0; i < local.length - 1; i++) lengthM += hypot(sub(local[i + 1], local[i]))
  let netTurnDeg = 0
  for (let i = 1; i < waypoints.length - 1; i++) {
    netTurnDeg += courseChangeDeg(waypoints[i - 1], waypoints[i], waypoints[i + 1])
  }
  const lengthNm = lengthM / M_PER_NM
  const areaNm2 = areaM2 / (M_PER_NM * M_PER_NM)
  const areaRatio = lengthNm > 0 ? Math.abs(areaNm2) / (lengthNm * lengthNm) : 0
  if (Math.abs(netTurnDeg) < CURVE_TURN_MIN_DEG || areaRatio < CURVE_AREA_RATIO_MIN) {
    return { ...unclear, netTurnDeg }
  }
  const clockwise = areaNm2 < 0
  return {
    innerSide: clockwise ? 'right' : 'left',
    outerSide: clockwise ? 'left' : 'right',
    sense: clockwise ? 'clockwise' : 'counterclockwise',
    netTurnDeg,
    note: null,
  }
}

/**
 * Inner sits on the inside of the route's curve. Offsets are half that side's width.
 * `shapePoints` is the full published centerline when `waypoints` is only a segment.
 * @param {OffsetRoutePoint[]} waypoints
 * @param {OffsetLegWidth[]} legWidths
 * @param {Array<{ lat: number, lon: number, ptIdent?: string, originalName?: string }>} [shapePoints]
 */
export function buildOffsetRoutes(waypoints, legWidths, shapePoints) {
  if (legWidths.length !== waypoints.length - 1) {
    throw new Error('Width list must have one entry per leg.')
  }
  const curve = routeCurveSide(shapePoints?.length ? shapePoints : waypoints)
  const leftHalf = legWidths.map((leg) => leg.leftNm / 2)
  const rightHalf = legWidths.map((leg) => leg.rightNm / 2)
  const leftFull = legWidths.map((leg) => leg.leftNm)
  const rightFull = legWidths.map((leg) => leg.rightNm)
  const half = { left: leftHalf, right: rightHalf }
  const full = { left: leftFull, right: rightFull }
  const inner = buildOffsetTrack(waypoints, half[curve.innerSide], full[curve.innerSide], curve.innerSide)
  const outer = buildOffsetTrack(waypoints, half[curve.outerSide], full[curve.outerSide], curve.outerSide)
  const corridorLeft = buildOffsetTrack(waypoints, leftFull, leftFull, 'left')
  const corridorRight = buildOffsetTrack(waypoints, rightFull, rightFull, 'right')
  assignTrackNames(inner, 'inner')
  assignTrackNames(outer, 'outer')
  return {
    inner: { ...inner, label: 'inner' },
    outer: { ...outer, label: 'outer' },
    corridorLeft: corridorLeft.waypoints,
    corridorRight: corridorRight.waypoints,
    flags: [...inner.flags, ...outer.flags],
    nameError: inner.nameError || outer.nameError || null,
    curve,
  }
}

/**
 * ForeFlight MTR name when we have one; otherwise the point id.
 * @param {OffsetRoutePoint} wp
 */
function namingSource(wp) {
  const original = String(wp.originalName ?? '')
  if (/^(?:IR|SR|VR)\d/i.test(original.replace(/\*/g, ''))) return original
  if (wp.ptIdent) return wp.ptIdent
  return original || wp.g1000Name || ''
}

/**
 * @param {{ side: 'left' | 'right', waypoints: OffsetRoutePoint[], nameError?: string | null }} track
 * @param {'inner' | 'outer'} role
 */
function assignTrackNames(track, role) {
  const side = role
  const named = assignOffsetWaypointNames(
    track.waypoints.map((wp, index) => ({
      originalName: namingSource(wp),
      side,
      sequence: index + 1,
    }))
  )
  track.nameError = named.error
  track.waypoints.forEach((wp, index) => {
    wp.g1000Name = named.error ? '' : named.names[index].g1000Name
  })
}

/**
 * Same geographic track, flown back the other way. Names stay with their points.
 * @param {OffsetRoutePoint[]} waypoints
 * @returns {OffsetRoutePoint[]}
 */
export function reverseOffsetTrack(waypoints) {
  return [...waypoints].reverse().map((wp) => ({ ...wp }))
}

/**
 * Width lines the NASR parser does not understand. These must not be guessed.
 * @param {string[]} widthTexts
 */
export function listUnparsedWidthTexts(widthTexts) {
  return readMtrWidth(widthTexts).unparsed
}

/**
 * Why a leg has no published width.
 * @param {string} fromPt
 * @param {string} toPt
 * @param {string[]} unparsed
 * @returns {{ reason: 'unreadable' | 'not-covered', clause: string | null }}
 */
function gapForLeg(fromPt, toPt, unparsed) {
  const from = bareGapId(fromPt)
  const to = bareGapId(toPt)
  /** @type {string[]} */
  const related = []
  for (const clause of unparsed) {
    const value = clause.toUpperCase()
    const coordinate = /COORDINATE|\bN\d{2}-\d|\bSTARTING\s+AT\s+N\d/.test(value)
    const namesFrom = from && new RegExp(`\\b${from}\\b`).test(value)
    const namesTo = to && new RegExp(`\\b${to}\\b`).test(value)
    const namesAnyPoint = /\b(?:FROM|BETWEEN|TO)\s+[A-Z]/.test(value)
    if (coordinate || namesFrom || namesTo || !namesAnyPoint) related.push(clause)
  }
  if (related.length > 0) return { reason: 'unreadable', clause: related.join(' ') }
  return { reason: 'not-covered', clause: null }
}

function exclusionMasks(exclusions) {
  const re =
    /(?:BETWEEN|FROM)\s+(?:PTS\.?\s+)?([A-Z][A-Z0-9]*)\s+(?:AND|TO)\s+(?:PTS\.?\s+)?([A-Z][A-Z0-9]*)/g
  /** @type {Array<{ from: string, to: string, clause: string }>} */
  const pairs = []
  for (const note of exclusions ?? []) {
    const value = String(note).toUpperCase()
    let match
    while ((match = re.exec(value))) {
      pairs.push({ from: match[1], to: match[2], clause: note })
    }
  }
  return pairs
}

function bareGapId(pt) {
  return String(pt ?? '')
    .trim()
    .toUpperCase()
    .replace(/\*+$/g, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Published side widths for the pilot's chosen sequence.
 * A clause that cannot be read leaves only the legs it fails to fill.
 * Covered legs keep their published widths. Nothing is guessed.
 * @param {OffsetRoutePoint[]} waypoints
 * @param {string[]} widthTexts
 */
export function resolvePublishedLegWidths(waypoints, widthTexts) {
  const { spans, unparsed, exclusions } = readMtrWidth(widthTexts ?? [])
  const ordered = waypoints.map((wp) => wp.ptIdent)
  const orderedUpper = ordered.map((pt) => pt.toUpperCase())
  const masks = exclusionMasks(exclusions)
  /** @type {Array<(OffsetLegWidth & { fromPt: string, toPt: string }) | null>} */
  const legs = []
  /** @type {Array<{ index: number, fromPt: string, toPt: string, reason: 'unreadable' | 'not-covered', clause: string | null }>} */
  const missing = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const fromPt = waypoints[i].ptIdent
    const toPt = waypoints[i + 1].ptIdent
    const leftNm = halfWidthNmForLeg(spans, fromPt, toPt, 'left', ordered)
    const rightNm = halfWidthNmForLeg(spans, fromPt, toPt, 'right', ordered)
    const mask = masks.find((item) =>
      legContainedInSpan(item.from, item.to, fromPt, toPt, orderedUpper)
    )
    if (leftNm == null || rightNm == null) {
      const gap = gapForLeg(fromPt, toPt, unparsed)
      missing.push({ index: i, fromPt, toPt, reason: gap.reason, clause: gap.clause })
      legs.push(null)
    } else if (mask) {
      missing.push({
        index: i,
        fromPt,
        toPt,
        reason: 'unreadable',
        clause: mask.clause,
      })
      legs.push(null)
    } else {
      legs.push({ fromPt, toPt, leftNm, rightNm })
    }
  }
  if (missing.length > 0) {
    return {
      status: 'partial',
      reason: missing.some((leg) => leg.reason === 'unreadable') ? 'unparsed' : 'missing',
      unparsed,
      exclusions,
      missing,
      legs,
    }
  }
  return { status: 'published', reason: null, unparsed, exclusions, missing, legs }
}
