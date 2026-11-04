import { describe, it, expect } from 'vitest'
import {
  buildOffsetRoutes,
  buildOffsetTrack,
  courseChangeDeg,
  crossTrackNm,
  routeCurveSide,
  distanceToSegmentNm,
  listUnparsedWidthTexts,
  resolvePublishedLegWidths,
  reverseOffsetTrack,
} from '../shared/survey-planning/offsetRoutePlan.js'
import { buildSortieOffsetFpl } from '../src/services/offsetRouteFpl.ts'

const M_PER_NM = 1852
const EARTH_RADIUS_M = 6371000

function moveNm(lat, lon, bearingDeg, nm) {
  const δ = (nm * M_PER_NM) / EARTH_RADIUS_M
  const θ = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    )
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI }
}

function wp(ptIdent, lat, lon, g1000Name = ptIdent) {
  return { ptIdent, g1000Name, lat, lon }
}

describe('offset route straight leg', () => {
  it('places a 6 NM side halfway out, 3 NM off the centerline', () => {
    const a = wp('A', 34.5, -104, 'A111')
    const b = wp('B', 35.0, -104, 'B111')
    const track = buildOffsetTrack([a, b], [3], [6], 'right')
    expect(track.waypoints).toHaveLength(2)
    for (const point of track.waypoints) {
      const xt = crossTrackNm(point, a, b)
      expect(xt).toBeGreaterThan(2.92)
      expect(xt).toBeLessThan(3.08)
    }
    const mid = {
      lat: (track.waypoints[0].lat + track.waypoints[1].lat) / 2,
      lon: (track.waypoints[0].lon + track.waypoints[1].lon) / 2,
    }
    expect(Math.abs(crossTrackNm(mid, a, b) - 3)).toBeLessThan(0.08)
    expect(distanceToSegmentNm(mid, a, b)).toBeLessThan(3.08)
  })
})

describe('offset route width changes', () => {
  it('steps down and back without adding waypoints', () => {
    const a = wp('A', 34.2, -104.4, 'A113')
    const bPos = moveNm(a.lat, a.lon, 25, 40)
    const b = wp('B', bPos.lat, bPos.lon, 'B113')
    const cPos = moveNm(b.lat, b.lon, 0, 40)
    const c = wp('C', cPos.lat, cPos.lon, 'C113')
    const dPos = moveNm(c.lat, c.lon, 340, 40)
    const d = wp('D', dPos.lat, dPos.lon, 'D113')
    const points = [a, b, c, d]
    const widths = [
      { leftNm: 6, rightNm: 6 },
      { leftNm: 4, rightNm: 4 },
      { leftNm: 6, rightNm: 6 },
    ]
    const plan = buildOffsetRoutes(points, widths)
    expect(plan.outer.waypoints).toHaveLength(4)
    expect(plan.inner.waypoints).toHaveLength(4)
    const expected = [3, 2, 3]
    for (let i = 0; i < 3; i++) {
      const mid = {
        lat: (plan.outer.waypoints[i].lat + plan.outer.waypoints[i + 1].lat) / 2,
        lon: (plan.outer.waypoints[i].lon + plan.outer.waypoints[i + 1].lon) / 2,
      }
      const xt = crossTrackNm(mid, points[i], points[i + 1])
      expect(Math.abs(xt - expected[i])).toBeLessThan(0.08)
    }
  })

  it('offsets a lopsided IR-109 E–AO segment 3 NM left and 1 NM right', () => {
    const e = wp('E', 33.8, -106.2, 'E109')
    const aoPos = moveNm(e.lat, e.lon, 80, 25)
    const ao = wp('AO', aoPos.lat, aoPos.lon, 'AO109')
    const plan = buildOffsetRoutes(
      [e, ao],
      [{ leftNm: 3, rightNm: 1 }]
    )
    const leftXt = crossTrackNm(plan.inner.waypoints[0], e, ao)
    const rightXt = crossTrackNm(plan.outer.waypoints[0], e, ao)
    expect(leftXt).toBeLessThan(0)
    expect(Math.abs(leftXt + 1.5)).toBeLessThan(0.05)
    expect(rightXt).toBeGreaterThan(0)
    expect(Math.abs(rightXt - 0.5)).toBeLessThan(0.05)
    expect(plan.inner.waypoints[0].g1000Name).toBe('E001I')
    expect(plan.outer.waypoints[1].g1000Name).toBe('AO002O')
  })
})

describe('offset route sharp turns', () => {
  it('flags a turn past 120° and does not add waypoints', () => {
    const a = wp('A', 35, -106, 'A111')
    const bPos = moveNm(a.lat, a.lon, 0, 8)
    const b = wp('B', bPos.lat, bPos.lon, 'B111')
    const cPos = moveNm(b.lat, b.lon, 150, 8)
    const c = wp('C', cPos.lat, cPos.lon, 'C111')
    expect(Math.abs(courseChangeDeg(a, b, c))).toBeGreaterThan(120)
    const plan = buildOffsetRoutes(
      [a, b, c],
      [
        { leftNm: 8, rightNm: 8 },
        { leftNm: 8, rightNm: 8 },
      ]
    )
    expect(plan.outer.waypoints).toHaveLength(3)
    expect(plan.inner.waypoints).toHaveLength(3)
    const fold = plan.flags.filter((flag) => flag.reason === 'foldBack')
    expect(fold.length).toBeGreaterThan(0)
    expect(fold.some((flag) => flag.ptIdent === 'B')).toBe(true)
  })

  it('keeps a reversal corner on the incoming half-width instead of a distant intersection', () => {
    const a = wp('A', 34.8, -106.5, 'A213')
    const bPos = moveNm(a.lat, a.lon, 180, 10)
    const b = wp('B', bPos.lat, bPos.lon, 'B213')
    const c = wp('C', a.lat, a.lon, 'C213')
    expect(Math.abs(courseChangeDeg(a, b, c))).toBeGreaterThan(170)
    const plan = buildOffsetRoutes(
      [a, b, c],
      [
        { leftNm: 4, rightNm: 6 },
        { leftNm: 4, rightNm: 6 },
      ]
    )
    expect(plan.outer.waypoints).toHaveLength(3)
    expect(plan.inner.waypoints).toHaveLength(3)
    for (const track of [plan.inner, plan.outer]) {
      const corner = track.waypoints[1]
      expect(distanceToSegmentNm(corner, a, b)).toBeLessThan(8)
      expect(distanceToSegmentNm(corner, b, c)).toBeLessThan(8)
    }
    const fold = plan.flags.filter((flag) => flag.reason === 'foldBack' && flag.ptIdent === 'B')
    expect(fold.length).toBeGreaterThan(0)
  })
})

describe('offset route .fpl names', () => {
  it('gives a repeated point its own sequence number', () => {
    const first = { ...wp('XM', 35, -106), originalName: 'IR112-XM' }
    const middle = { ...wp('TN', 35.2, -105.8), originalName: 'IR112-TN' }
    const second = { ...wp('XM', 35.4, -105.5), originalName: 'IR112-XM' }
    const plan = buildOffsetRoutes(
      [first, middle, second],
      [
        { leftNm: 4, rightNm: 4 },
        { leftNm: 4, rightNm: 4 },
      ]
    )
    expect(plan.nameError).toBeNull()
    expect(plan.inner.waypoints.map((point) => point.g1000Name)).toEqual(['XM001I', 'TN002I', 'XM003I'])
    expect(plan.outer.waypoints.map((point) => point.g1000Name)).toEqual(['XM001O', 'TN002O', 'XM003O'])
    expect(new Set(plan.inner.waypoints.map((point) => point.g1000Name)).size).toBe(3)
  })

  it('writes a valid Garmin flight plan for sortie 1 on the outer track', () => {
    const a = wp('A', 34.5, -104, 'A111')
    const b = wp('B', 35.0, -104, 'B111')
    const plan = buildOffsetRoutes([a, b], [{ leftNm: 6, rightNm: 4 }])
    const departure = {
      identifier: 'KABQ',
      name: 'Albuquerque Intl Sunport',
      latitude: 35.04,
      longitude: -106.6,
    }
    const destination = {
      identifier: 'KLRU',
      name: 'Las Cruces Intl',
      latitude: 32.29,
      longitude: -106.92,
    }
    const { xml, filename, routeName } = buildSortieOffsetFpl({
      routeLabel: 'IR-111',
      sortieNumber: 1,
      side: 'outer',
      waypoints: plan.outer.waypoints,
      departure,
      destination,
    })
    expect(filename).toBe('IR111-S1-OUTER.fpl')
    expect(routeName).toBe('IR111 S1 OUTER')
    expect(routeName.length).toBeLessThanOrEqual(22)
    expect(xml).toContain(`<route-name>${routeName}</route-name>`)
    expect(xml).toContain('http://www8.garmin.com/xmlschemas/FlightPlan/v1')
    expect(xml).toContain('<waypoint-table>')
    expect(xml).toContain('<route>')
    expect(xml.toLowerCase()).not.toContain('verify')
    for (const point of plan.outer.waypoints) {
      expect(point.g1000Name.length).toBeLessThanOrEqual(6)
      expect(xml).toContain(`<identifier>${point.g1000Name}</identifier>`)
      expect(xml).toContain(`<waypoint-identifier>${point.g1000Name}</waypoint-identifier>`)
    }
    const identifiers = [...xml.matchAll(/<identifier>([^<]+)<\/identifier>/g)].map((m) => m[1])
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })

  it('keeps the reversed outer track on the same geographic line', () => {
    const a = wp('A', 34.2, -104.4, 'IR112-A')
    const bPos = moveNm(a.lat, a.lon, 40, 30)
    const b = wp('B', bPos.lat, bPos.lon, 'IR112-B')
    const cPos = moveNm(b.lat, b.lon, 10, 25)
    const c = wp('C', cPos.lat, cPos.lon, 'IR112-C')
    const plan = buildOffsetRoutes(
      [a, b, c],
      [
        { leftNm: 5, rightNm: 4 },
        { leftNm: 5, rightNm: 4 },
      ]
    )
    const reversed = reverseOffsetTrack(plan.outer.waypoints)
    const key = (point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`
    expect(reversed.map(key)).toEqual([...plan.outer.waypoints].reverse().map(key))
    expect(reversed.map((point) => point.g1000Name)).toEqual(
      [...plan.outer.waypoints].reverse().map((point) => point.g1000Name)
    )
    expect(reversed.map(key)).not.toEqual([...plan.inner.waypoints].reverse().map(key))
    const outbound = {
      lat: (plan.outer.waypoints[0].lat + plan.outer.waypoints[1].lat) / 2,
      lon: (plan.outer.waypoints[0].lon + plan.outer.waypoints[1].lon) / 2,
    }
    const returnLeg = {
      lat: (reversed[reversed.length - 1].lat + reversed[reversed.length - 2].lat) / 2,
      lon: (reversed[reversed.length - 1].lon + reversed[reversed.length - 2].lon) / 2,
    }
    expect(crossTrackNm(outbound, a, b)).toBeGreaterThan(0)
    expect(Math.abs(crossTrackNm(returnLeg, a, b) - crossTrackNm(outbound, a, b))).toBeLessThan(0.001)
  })
})

describe('published width fallback', () => {
  it('refuses coordinate-style text instead of guessing', () => {
    const texts = [
      '6 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE',
      'IR-133 WIDTH DEFINED BY COORDINATES 33 10N 106 00W TO 33 40N 105 10W',
    ]
    const points = [wp('A', 34, -106), wp('B', 34.5, -106)]
    const resolved = resolvePublishedLegWidths(points, texts)
    expect(resolved.status).toBe('published')
    expect(resolved.legs?.[0]).toMatchObject({ leftNm: 6, rightNm: 6 })
    expect(resolved.unparsed.some((clause) => /COORDINATES/.test(clause))).toBe(true)
  })

  it('asks for a width when a leg is not in the parsed spans', () => {
    const points = [wp('A', 34, -106), wp('B', 34.2, -106), wp('Z', 34.4, -106)]
    const resolved = resolvePublishedLegWidths(points, [
      '5 NM EITHER SIDE OF CENTERLINE FROM A TO B',
    ])
    expect(resolved.status).toBe('partial')
    expect(resolved.reason).toBe('missing')
    expect(resolved.missing.map((leg) => leg.fromPt + leg.toPt)).toContain('BZ')
    expect(resolved.missing.find((leg) => leg.fromPt === 'B')?.reason).toBe('not-covered')
  })
})

describe('inner side follows the route curve', () => {
  const widths = (count) => Array.from({ length: count }, () => ({ leftNm: 4, rightNm: 4 }))

  it('puts inner on the right of a clockwise route', () => {
    const points = [wp('A', 35, -106), wp('B', 36, -106), wp('C', 36, -105), wp('D', 35, -105)]
    const curve = routeCurveSide(points)
    expect(curve.sense).toBe('clockwise')
    expect(curve.innerSide).toBe('right')
    expect(curve.note).toBeNull()
    const plan = buildOffsetRoutes(points, widths(3))
    expect(crossTrackNm(plan.inner.waypoints[0], points[0], points[1])).toBeGreaterThan(0)
    expect(plan.inner.waypoints[0].g1000Name).toBe('A001I')
  })

  it('puts inner on the left of a counter-clockwise route', () => {
    const points = [wp('A', 35, -106), wp('D', 35, -105), wp('C', 36, -105), wp('B', 36, -106)]
    const curve = routeCurveSide(points)
    expect(curve.sense).toBe('counterclockwise')
    expect(curve.innerSide).toBe('left')
    expect(curve.note).toBeNull()
    const plan = buildOffsetRoutes(points, widths(3))
    expect(crossTrackNm(plan.inner.waypoints[0], points[0], points[1])).toBeLessThan(0)
  })

  it('keeps inner on the left and shows the note when the route is nearly straight', () => {
    const a = wp('A', 35, -106)
    const b = wp('B', 36, -106)
    const c = moveNm(b.lat, b.lon, 8, 40)
    const points = [a, b, wp('C', c.lat, c.lon)]
    const curve = routeCurveSide(points)
    expect(Math.abs(curve.netTurnDeg)).toBeLessThan(30)
    expect(curve.sense).toBe('unclear')
    expect(curve.innerSide).toBe('left')
    expect(curve.note).toBe('This route has no clear inside; Inner = left of the route flown from A.')
    const plan = buildOffsetRoutes(points, widths(2))
    expect(plan.curve.note).toBe(curve.note)
    expect(crossTrackNm(plan.inner.waypoints[0], a, b)).toBeLessThan(0)
  })
})
