import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildOffsetRoutes,
  buildOffsetTrack,
  crossTrackNm,
  distanceToSegmentNm,
  routeCurveSide,
} from '../shared/survey-planning/offsetRoutePlan.js'
import { buildSortieOffsetFpl } from '../src/services/offsetRouteFpl.ts'
import { buildTeamSortieFile } from '../src/services/teamPlanRecord.ts'
import { buildSpurPreview, detectReciprocalSpurs, SPUR_ACCEPT_BLOCK } from '../src/services/spurPreview.ts'

const A = 6378137
const F = 1 / 298.257223563
const B = A * (1 - F)
const NM = 1852

function vincentyInverse(p1, p2) {
  const φ1 = (p1.lat * Math.PI) / 180
  const φ2 = (p2.lat * Math.PI) / 180
  const L = ((p2.lon - p1.lon) * Math.PI) / 180
  const U1 = Math.atan((1 - F) * Math.tan(φ1))
  const U2 = Math.atan((1 - F) * Math.tan(φ2))
  let λ = L
  let sinσ = 0
  let cosσ = 0
  let σ = 0
  let cos2α = 0
  let cos2σm = 0
  for (let i = 0; i < 80; i++) {
    const sinλ = Math.sin(λ)
    const cosλ = Math.cos(λ)
    sinσ = Math.hypot(Math.cos(U2) * sinλ, Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * cosλ)
    if (sinσ === 0) return { distanceM: 0, azimuthDeg: 0 }
    cosσ = Math.sin(U1) * Math.sin(U2) + Math.cos(U1) * Math.cos(U2) * cosλ
    σ = Math.atan2(sinσ, cosσ)
    const sinα = (Math.cos(U1) * Math.cos(U2) * sinλ) / sinσ
    cos2α = 1 - sinα * sinα
    cos2σm = cos2α === 0 ? 0 : cosσ - (2 * Math.sin(U1) * Math.sin(U2)) / cos2α
    const C = (F / 16) * cos2α * (2 + F * (4 - 3 * cos2α))
    const next = L + (1 - C) * F * sinα * (σ + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)))
    if (Math.abs(next - λ) < 1e-12) {
      λ = next
      break
    }
    λ = next
  }
  const u2 = (cos2α * (A * A - B * B)) / (B * B)
  const Acoef = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
  const Bcoef = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
  const Δσ =
    Bcoef *
    sinσ *
    (cos2σm +
      (Bcoef / 4) *
        (cosσ * (-1 + 2 * cos2σm * cos2σm) -
          (Bcoef / 6) * cos2σm * (-3 + 4 * sinσ * sinσ) * (-3 + 4 * cos2σm * cos2σm)))
  const azimuth = Math.atan2(Math.cos(U2) * Math.sin(λ), Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * Math.cos(λ))
  return { distanceM: B * Acoef * (σ - Δσ), azimuthDeg: (azimuth * 180) / Math.PI }
}

function vincentyCrossTrackNm(point, a, b) {
  const ab = vincentyInverse(a, b)
  const ap = vincentyInverse(a, point)
  const dθ = ((ap.azimuthDeg - ab.azimuthDeg) * Math.PI) / 180
  const δ = ap.distanceM / A
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(δ) * Math.sin(dθ))))
  return (xt * A) / NM
}

const north = [
  { ptIdent: 'P', originalName: 'VR114-P', lat: 35, lon: -106 },
  { ptIdent: 'Q', originalName: 'VR114-Q', lat: 35.3, lon: -106 },
]
function moveNm(lat, lon, bearingDeg, nm) {
  const radius = 6371000
  const δ = (nm * 1852) / radius
  const θ = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI }
}

const cornerQ = moveNm(35, -106, 0, 12)
const cornerR = moveNm(cornerQ.lat, cornerQ.lon, 90, 12)
const corner = [
  { ptIdent: 'P', originalName: 'VR114-P', lat: 35, lon: -106 },
  { ptIdent: 'Q', originalName: 'VR114-Q', ...cornerQ },
  { ptIdent: 'R', originalName: 'VR114-R', ...cornerR },
]

function mid(track) {
  return {
    lat: (track[0].lat + track[1].lat) / 2,
    lon: (track[0].lon + track[1].lon) / 2,
  }
}

describe('track offset stays separate from corridor width', () => {
  it('keeps the default halfway track and the explicit 2.5 NM track on a straight leg', () => {
    const width = [{ leftNm: 2.5, rightNm: 2.5 }]
    const halfway = buildOffsetRoutes(north, width)
    const explicit = buildOffsetRoutes(north, [{ ...width[0], trackLeftNm: 2.5, trackRightNm: 2.5 }])
    const halfPoint = mid(halfway.inner.waypoints)
    const fullPoint = mid(explicit.inner.waypoints)
    const edge = mid(explicit.corridorLeft)
    expect(Math.abs(crossTrackNm(halfPoint, north[0], north[1]))).toBeGreaterThan(1.2)
    expect(Math.abs(crossTrackNm(halfPoint, north[0], north[1]))).toBeLessThan(1.3)
    expect(Math.abs(vincentyCrossTrackNm(fullPoint, north[0], north[1]))).toBeGreaterThan(2.45)
    expect(Math.abs(vincentyCrossTrackNm(fullPoint, north[0], north[1]))).toBeLessThan(2.55)
    expect(Math.abs(vincentyCrossTrackNm(edge, north[0], north[1]))).toBeGreaterThan(2.45)
    expect(Math.abs(crossTrackNm(fullPoint, north[0], north[1]))).toBeGreaterThan(2.45)
  })

  it('measures a mitered corner separately from the straight midpoint', () => {
    const plan = buildOffsetRoutes(
      corner,
      corner.slice(0, -1).map(() => ({ leftNm: 2.5, rightNm: 2.5, trackLeftNm: 2.5, trackRightNm: 2.5 }))
    )
    const straight = mid([plan.inner.waypoints[0], plan.inner.waypoints[1]])
    expect(Math.abs(crossTrackNm(straight, corner[0], corner[1]))).toBeGreaterThan(2.4)
    expect(Math.abs(crossTrackNm(straight, corner[0], corner[1]))).toBeLessThan(2.6)
    const outside = plan.flags.find((flag) => flag.reason === 'outsideCorridor')
    expect(outside).toBeTruthy()
    const cornerDistance = Math.min(
      distanceToSegmentNm(outside, corner[0], corner[1]),
      distanceToSegmentNm(outside, corner[1], corner[2])
    )
    expect(cornerDistance).toBeGreaterThan(2.6)
  })

  it('does not halve a team lane offset that is already the flown distance', () => {
    const track = buildOffsetTrack(north, [3], [5], 'right')
    const point = mid(track.waypoints)
    expect(crossTrackNm(point, north[0], north[1])).toBeGreaterThan(2.9)
    expect(crossTrackNm(point, north[0], north[1])).toBeLessThan(3.1)
  })

  it('keeps both curve directions on the existing inner side', () => {
    const clockwise = routeCurveSide([
      { lat: 35, lon: -106 },
      { lat: 36, lon: -106 },
      { lat: 36, lon: -105 },
      { lat: 35, lon: -105 },
    ])
    const counter = routeCurveSide([
      { lat: 35, lon: -106 },
      { lat: 35, lon: -105 },
      { lat: 36, lon: -105 },
      { lat: 36, lon: -106 },
    ])
    expect(clockwise.innerSide).toBe('right')
    expect(counter.innerSide).toBe('left')
  })
})

describe('fresh fixture sortie files', () => {
  it('writes two opposite-side files and reads them back', () => {
    const points = [
      { ptIdent: 'A', originalName: 'VR114-A', lat: 35, lon: -106 },
      { ptIdent: 'B', originalName: 'VR114-B', lat: 35.4, lon: -105.4 },
      { ptIdent: 'C', originalName: 'VR114-C', lat: 34.8, lon: -105.2 },
      { ptIdent: 'D', originalName: 'VR114-D', lat: 34.7, lon: -106.2 },
    ]
    const widths = points.slice(0, -1).map(() => ({ leftNm: 2.5, rightNm: 2.5, trackLeftNm: 2.5, trackRightNm: 2.5 }))
    const built = buildOffsetRoutes(points, widths)
    const departure = { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.04, longitude: -106.61 }
    const destination = { identifier: 'KAEG', name: 'Double Eagle', latitude: 35.14, longitude: -106.8 }
    const first = buildSortieOffsetFpl({
      routeLabel: 'VR114 fixture',
      sortieNumber: 1,
      side: 'inner',
      waypoints: built.inner.waypoints.map((point) => ({ g1000Name: point.g1000Name, lat: point.lat, lon: point.lon })),
      departure,
      destination,
    })
    const second = buildSortieOffsetFpl({
      routeLabel: 'VR114 fixture',
      sortieNumber: 2,
      side: 'outer',
      waypoints: [...built.outer.waypoints].reverse().map((point) => ({
        g1000Name: point.g1000Name,
        lat: point.lat,
        lon: point.lon,
      })),
      departure: destination,
      destination: departure,
    })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htw-offset-'))
    const firstPath = path.join(dir, first.filename)
    const secondPath = path.join(dir, second.filename)
    fs.writeFileSync(firstPath, first.xml)
    fs.writeFileSync(secondPath, second.xml)
    const readFirst = fs.readFileSync(firstPath, 'utf8')
    const readSecond = fs.readFileSync(secondPath, 'utf8')
    const idents = (xml) => [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)].map((match) => match[1])
    const coords = (xml) =>
      [...xml.matchAll(/<identifier>([^<]+)<\/identifier>[\s\S]*?<lat>([^<]+)<\/lat>\s*<lon>([^<]+)<\/lon>/g)].map(
        (match) => `${match[1]} ${match[2]} ${match[3]}`
      )
    expect(idents(readFirst)[0]).toBe('KABQ')
    expect(idents(readFirst).at(-1)).toBe('KAEG')
    expect(idents(readSecond)[0]).toBe('KAEG')
    expect(idents(readSecond).at(-1)).toBe('KABQ')
    expect(coords(readFirst)).not.toEqual(coords(readSecond))
    expect(coords(readSecond)).not.toEqual([...coords(readFirst)].reverse())
    const scratch = path.join(os.homedir(), 'Movies/HighTowers/Aircrew-Training/_offset-reversal-examination/fixtures')
    try {
      fs.mkdirSync(scratch, { recursive: true })
      fs.writeFileSync(path.join(scratch, first.filename), readFirst)
      fs.writeFileSync(path.join(scratch, second.filename), readSecond)
    } catch {
      // The files read back from the temp directory are the check. Scratch is optional.
    }
  })

  it('keeps a team sortie on the default halfway track when no track offset is stored', () => {
    const points = north.map((point, index) => ({ ...point, ptIdent: index === 0 ? 'A' : 'B' }))
    const file = buildTeamSortieFile({
      team: {
        id: 'team-1',
        label: 'Team 1',
        departure: { identifier: 'KABQ', latitude: 35.04, longitude: -106.6 },
        landing: { identifier: 'KAEG', latitude: 35.14, longitude: -106.8 },
        segmentFrom: 'A',
        segmentTo: 'B',
        startPoint: 'A',
        sorties: [
          { number: 1, side: 'inner', order: 'forward' },
          { number: 2, side: 'outer', order: 'reverse' },
        ],
      },
      routeLabel: 'VR114',
      points,
      legWidths: [{ leftNm: 2.5, rightNm: 2.5 }],
      sortieNumber: 1,
    })
    expect('error' in file).toBe(false)
    const row = [...file.xml.matchAll(/<identifier>([^<]+)<\/identifier>[\s\S]*?<lat>([^<]+)<\/lat>\s*<lon>([^<]+)<\/lon>/g)].find(
      (match) => match[1].endsWith('I')
    )
    expect(row).toBeTruthy()
    const user = { lat: Number(row[2]), lon: Number(row[3]) }
    expect(Math.abs(crossTrackNm(user, points[0], points[1]))).toBeGreaterThan(1.1)
    expect(Math.abs(crossTrackNm(user, points[0], points[1]))).toBeLessThan(1.4)
  })
})

describe('spur preview', () => {
  const spur = [
    { ptIdent: 'G', originalName: 'SAMPLE-G', lat: 35, lon: -106 },
    { ptIdent: 'T', originalName: 'SAMPLE-T', lat: 34, lon: -106 },
    { ptIdent: 'G', originalName: 'SAMPLE-G', lat: 35, lon: -106 },
    { ptIdent: 'A', originalName: 'SAMPLE-A', lat: 35, lon: -105 },
  ]

  it('detects a bounded reciprocal and leaves accept off', () => {
    expect(detectReciprocalSpurs(spur)).toHaveLength(1)
    expect(detectReciprocalSpurs(spur.slice(0, 3))).toHaveLength(0)
    const preview = buildSpurPreview({
      waypoints: spur,
      legWidths: spur.slice(0, -1).map(() => ({ leftNm: 2.5, rightNm: 2.5 })),
      sortie1Side: 'inner',
    })
    expect(preview.detected).toBe(true)
    expect(preview.acceptEnabled).toBe(false)
    expect(preview.acceptBlockedReason).toBe(SPUR_ACCEPT_BLOCK)
    expect(preview.efficiency.savingsClaimed).toBe(false)
    expect(preview.sortie2).toMatch(/keeps the spur/i)
    expect(preview.discrepancy).toMatch(/Inner/)
    expect(preview.legs.some((leg) => leg.geographicSide === 'crosses the centerline')).toBe(true)
    expect(preview.warnings.length).toBeGreaterThan(0)
  })
})
