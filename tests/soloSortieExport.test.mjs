import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildOffsetRoutes, crossTrackNm, routeCurveSide } from '../shared/survey-planning/offsetRoutePlan.js'
import { assignG1000WaypointNames } from '../shared/survey-planning/g1000Names.js'
import { G1000Service } from '../src/services/g1000.ts'
import {
  blankTrackRecord,
  OFFSET_PLAN_VERSION,
  offsetPlanFingerprint,
  offsetSequenceSignature,
  SPUR_PROPOSAL_VERSION,
} from '../src/services/offsetPlanRecord.ts'
import {
  oppositeSideSentence,
  sideOfRouteLabel,
  soloSortieDownload,
} from '../src/services/soloSortieExport.ts'

const clockwise = [
  { lat: 35, lon: -106, ptIdent: 'A' },
  { lat: 36, lon: -106, ptIdent: 'B' },
  { lat: 36, lon: -105, ptIdent: 'C' },
  { lat: 35, lon: -105, ptIdent: 'D' },
]
const counterClockwise = [
  { lat: 35, lon: -106, ptIdent: 'A' },
  { lat: 35, lon: -105, ptIdent: 'D' },
  { lat: 36, lon: -105, ptIdent: 'C' },
  { lat: 36, lon: -106, ptIdent: 'B' },
]

function savedFrom(plan, signature, widths, waypoints) {
  const freshness = {
    waypoints,
    widths,
    trackOffsets: widths.map(() => blankTrackRecord()),
    sortie1Side: 'inner',
    departureIdent: 'KABQ',
    destinationIdent: 'KAEG',
    spurDecision: 'unset',
    spurProposalVersion: SPUR_PROPOSAL_VERSION,
  }
  return {
    flightPlanId: 'plan-1',
    savedAt: '2026-11-01T15:00:00.000Z',
    sequenceSignature: signature,
    widths,
    mode: 'manual',
    manualMessage: null,
    inner: plan.inner.waypoints,
    outer: plan.outer.waypoints,
    corridorLeft: plan.corridorLeft,
    corridorRight: plan.corridorRight,
    flags: plan.flags,
    planVersion: OFFSET_PLAN_VERSION,
    fingerprint: offsetPlanFingerprint(freshness),
    trackOffsets: freshness.trackOffsets,
    sortie1Side: 'inner',
    departureIdent: 'KABQ',
    destinationIdent: 'KAEG',
    spurDecision: 'unset',
    spurProposalVersion: SPUR_PROPOSAL_VERSION,
  }
}

describe('side labels follow the existing curve rule', () => {
  it('calls a clockwise route Inner on the right and Outer on the left', () => {
    const curve = routeCurveSide(clockwise)
    expect(curve.sense).toBe('clockwise')
    expect(sideOfRouteLabel('inner', curve.innerSide)).toBe('Inner, right of the route (inside the curve)')
    expect(sideOfRouteLabel('outer', curve.outerSide)).toBe('Outer, left of the route (outside the curve)')
    expect(oppositeSideSentence('inner', curve)).toBe(
      'Sortie 2 is flown on the opposite side: Outer, left of the route (outside the curve).'
    )
  })

  it('calls a counter-clockwise route Inner on the left and Outer on the right', () => {
    const curve = routeCurveSide(counterClockwise)
    expect(curve.sense).toBe('counterclockwise')
    expect(sideOfRouteLabel('inner', curve.innerSide)).toBe('Inner, left of the route (inside the curve)')
    expect(sideOfRouteLabel('outer', curve.outerSide)).toBe('Outer, right of the route (outside the curve)')
    expect(oppositeSideSentence('outer', curve)).toBe(
      'Sortie 2 is flown on the opposite side: Inner, left of the route (inside the curve).'
    )
  })
})

describe('saved-plan sortie downloads', () => {
  const points = [
    { ptIdent: 'A', originalName: 'VR114-A', g1000Name: 'A001', lat: 35, lon: -106 },
    { ptIdent: 'B', originalName: 'VR114-B', g1000Name: 'B002', lat: 36, lon: -106 },
    { ptIdent: 'C', originalName: 'VR114-C', g1000Name: 'C003', lat: 36, lon: -105 },
    { ptIdent: 'D', originalName: 'VR114-D', g1000Name: 'D004', lat: 35, lon: -105 },
  ]
  const widths = points.slice(0, -1).map(() => ({ leftNm: 2, rightNm: 2 }))
  const built = buildOffsetRoutes(points, widths)
  const named = points.map((point) => ({ originalName: point.originalName, lat: point.lat, lon: point.lon }))
  const signature = offsetSequenceSignature(named)
  const saved = savedFrom(built, signature, widths, named)

  it('gives Sortie 2 the opposite track in flying order, not a reversal of Sortie 1', () => {
    const first = soloSortieDownload({
      routeLabel: 'VR114 sample',
      sortieNumber: 1,
      sortie1Side: 'inner',
      plan: saved,
      departure: { identifier: 'KABQ', latitude: 35.04, longitude: -106.6 },
      destination: { identifier: 'KAEG', latitude: 35.14, longitude: -106.79 },
    })
    const second = soloSortieDownload({
      routeLabel: 'VR114 sample',
      sortieNumber: 2,
      sortie1Side: 'inner',
      plan: saved,
      departure: { identifier: 'KABQ', latitude: 35.04, longitude: -106.6 },
      destination: { identifier: 'KAEG', latitude: 35.14, longitude: -106.79 },
    })
    const coords = (file) => file.points.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`)
    expect(second.side).toBe('outer')
    expect(coords(second)).toEqual([...built.outer.waypoints].reverse().map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`))
    expect(coords(second)).not.toEqual([...coords(first)].reverse())
    expect(second.xml).toContain('<waypoint-identifier>KAEG</waypoint-identifier>')
    expect(second.xml).toContain('<waypoint-identifier>KABQ</waypoint-identifier>')
    expect(first.xml.indexOf('KABQ')).toBeLessThan(first.xml.indexOf('KAEG'))
    expect(second.xml.indexOf('KAEG')).toBeLessThan(second.xml.indexOf('KABQ'))
  })

  function savedChoosing(side) {
    const record = savedFrom(built, signature, widths, named)
    const stamped = {
      waypoints: named,
      widths,
      trackOffsets: widths.map(() => blankTrackRecord()),
      sortie1Side: side,
      departureIdent: 'KABQ',
      destinationIdent: 'KAEG',
      spurDecision: 'unset',
      spurProposalVersion: SPUR_PROPOSAL_VERSION,
    }
    record.sortie1Side = side
    record.fingerprint = offsetPlanFingerprint(stamped)
    return record
  }

  function fileFor(record, sortieNumber, side) {
    return soloSortieDownload({
      routeLabel: 'VR114 sample',
      sortieNumber,
      sortie1Side: side,
      plan: record,
      departure: { identifier: 'KABQ', latitude: 35.04, longitude: -106.6 },
      destination: { identifier: 'KAEG', latitude: 35.14, longitude: -106.79 },
    })
  }

  const coords = (file) => file.points.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`)

  it('keeps downloads available when a side is chosen after a save that had no side', () => {
    const record = savedChoosing(null)
    const first = fileFor(record, 1, 'inner')
    const second = fileFor(record, 2, 'inner')
    expect(first.side).toBe('inner')
    expect(second.side).toBe('outer')
    expect(coords(first)).toEqual(built.inner.waypoints.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`))
    expect(coords(second)).toEqual([...built.outer.waypoints].reverse().map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`))
  })

  it('swaps the saved tracks when the side changes again', () => {
    const record = savedChoosing(null)
    const first = fileFor(record, 1, 'outer')
    const second = fileFor(record, 2, 'outer')
    expect(first.side).toBe('outer')
    expect(second.side).toBe('inner')
    expect(coords(first)).toEqual(built.outer.waypoints.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`))
    expect(coords(second)).toEqual([...built.inner.waypoints].reverse().map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`))
    expect(coords(first)).not.toEqual(coords(fileFor(record, 1, 'inner')))
  })

})

const sr213 = [
  { originalName: 'SR213-G', lat: 34.866667, lon: -106.591667 },
  { originalName: 'SR214H', lat: 34.698334, lon: -106.568333 },
  { originalName: 'SR213-G', lat: 34.866667, lon: -106.591667 },
  { originalName: 'SR213-A', lat: 34.683334, lon: -105.775 },
  { originalName: 'SR213-B', lat: 34.275, lon: -105.275 },
  { originalName: 'SR213-C', lat: 34.575001, lon: -104.246667 },
  { originalName: 'SR213-D', lat: 34.895, lon: -104.771667 },
  { originalName: 'SR213-E', lat: 35.083332, lon: -105.441667 },
  { originalName: 'SR213-F', lat: 35.083332, lon: -106.001667 },
  { originalName: 'SR213-G', lat: 34.866667, lon: -106.591667 },
  { originalName: 'SR213-H', lat: 34.821667, lon: -106.976667 },
]

function routePoints(rows) {
  const named = assignG1000WaypointNames(rows.map((row) => ({ originalName: row.originalName })))
  return rows.map((row, index) => ({
    ...row,
    ptIdent: row.originalName.replace(/^SR\d+-?/, ''),
    g1000Name: named.names[index].g1000Name,
  }))
}

function routeIdents(xml) {
  return [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)].map((match) => match[1])
}

function tableCoords(xml) {
  return [...xml.matchAll(/<identifier>([^<]+)<\/identifier>[\s\S]*?<lat>([^<]+)<\/lat>\s*<lon>([^<]+)<\/lon>/g)].map(
    (match) => ({ id: match[1], lat: match[2], lon: match[3] })
  )
}

describe('SR213 lead-in uses the existing offset tracks', () => {
  const points = routePoints(sr213)
  const widths = points.slice(0, -1).map(() => ({ leftNm: 2.5, rightNm: 2.5 }))
  const built = buildOffsetRoutes(points, widths)
  const named = points.map((point) => ({ originalName: point.originalName, lat: point.lat, lon: point.lon }))
  const saved = savedFrom(built, offsetSequenceSignature(named), widths, named)
  const departure = { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.038932, longitude: -106.608262 }
  const destination = { identifier: 'KAEG', name: 'Double Eagle', latitude: 35.144909, longitude: -106.795174 }

  it('keeps the two Hotel points distinct and does not reverse Sortie 1 into Sortie 2', () => {
    const full = G1000Service.generateFlightPlan({
      id: 'full',
      name: 'SR213 Training Demo',
      routeName: 'SR213',
      departureAirport: departure,
      destinationAirport: destination,
      waypoints: points.map((point, sequence) => ({
        id: point.g1000Name,
        originalName: point.originalName,
        g1000Name: point.g1000Name,
        latitude: point.lat,
        longitude: point.lon,
        sequence,
      })),
    })
    const fullRows = tableCoords(full)
    const sr214 = fullRows.find((row) => row.id === 'H002')
    const sr213Hotel = fullRows.find((row) => row.id === 'H011')
    expect(sr214).toEqual({ id: 'H002', lat: '34.698334', lon: '-106.568333' })
    expect(sr213Hotel).toEqual({ id: 'H011', lat: '34.821667', lon: '-106.976667' })
    expect(routeIdents(full)).toEqual([
      'KABQ', 'G001', 'H002', 'G003', 'A004', 'B005', 'C006', 'D007', 'E008', 'F009', 'G010', 'H011', 'KAEG',
    ])

    const sortie1 = soloSortieDownload({
      routeLabel: 'SR213 Training Demo',
      sortieNumber: 1,
      sortie1Side: 'inner',
      plan: saved,
      departure,
      destination,
    })
    const sortie2 = soloSortieDownload({
      routeLabel: 'SR213 Training Demo',
      sortieNumber: 2,
      sortie1Side: 'inner',
      plan: saved,
      departure,
      destination,
    })
    expect(sortie1.points.map((point) => point.originalName)).toEqual(points.map((point) => point.originalName))
    expect(sortie2.points.map((point) => point.originalName)).toEqual(
      [...points].reverse().map((point) => point.originalName)
    )
    const samePlace = (a, b) => a.lat === b.lat && a.lon === b.lon
    expect(sortie2.points.every((point, index) => samePlace(point, [...sortie1.points].reverse()[index]))).toBe(false)
    for (const file of [sortie1, sortie2]) {
      const rows = tableCoords(file.xml)
      for (const point of file.points) {
        const row = rows.find((item) => item.id === point.g1000Name)
        expect(row).toEqual({
          id: point.g1000Name,
          lat: point.lat.toFixed(6),
          lon: point.lon.toFixed(6),
        })
      }
    }
    expect(routeIdents(sortie1.xml)[0]).toBe('KABQ')
    expect(routeIdents(sortie1.xml).at(-1)).toBe('KAEG')
    expect(routeIdents(sortie2.xml)[0]).toBe('KAEG')
    expect(routeIdents(sortie2.xml).at(-1)).toBe('KABQ')

    const outbound = crossTrackNm(built.inner.waypoints[0], points[0], points[1])
    const returnStart = crossTrackNm(built.inner.waypoints[1], points[1], points[2])
    const returnEnd = crossTrackNm(built.inner.waypoints[2], points[1], points[2])
    expect(outbound).toBeLessThan(0)
    expect(returnStart).toBeGreaterThan(0)
    expect(returnEnd).toBeLessThan(0)
    expect(built.flags.map((flag) => `${flag.ptIdent} ${flag.side} ${flag.reason}`)).toEqual([
      'H left foldBack',
      'H right foldBack',
      'C right outsideCorridor',
    ])
  })
})

describe('aircrew sortie downloads stay on Map View', () => {
  it('drops the detail-page Offset sortie files section and keeps the Map View buttons', () => {
    const detail = fs.readFileSync(new URL('../src/pages/FlightPlanDetailPage.tsx', import.meta.url), 'utf8')
    const map = fs.readFileSync(new URL('../src/components/OffsetRoutePanel.tsx', import.meta.url), 'utf8')
    expect(detail).not.toContain('Offset sortie files')
    expect(detail).not.toContain('offset-sortie-files')
    expect(detail).toContain('Choose the side flown first')
    expect(detail).toContain('<SpurPlanNotice')
    expect(detail).toContain('Full flight plan')
    expect(detail).toContain('Export full route (.fpl)')
    expect(detail).toContain('showFullFlightPlanSection')
    expect(detail).toContain('Email each sortie')
    expect(detail).not.toContain('Centerline reference')
    expect(map).toContain('Download sortie ${number}')
    expect(map).toContain("number === 1")
    expect(map).toContain("number === 2")
  })
})
