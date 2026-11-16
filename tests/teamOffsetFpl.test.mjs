import { describe, expect, it } from 'vitest'
import { crossTrackNm, routeCurveSide } from '../shared/survey-planning/offsetRoutePlan.js'
import { draftTeamPlan, offsetSortieWaypoints, teamSortieOffsetRoute, uniqueSortieFilename } from '../src/services/teamPlanRecord.ts'
import { buildNamedOffsetSortieFile, buildTeamPlanSortieFile } from '../src/services/teamPlanSortieDownload.ts'

const VR114 = ['A', 'B', 'C', 'D', 'E', 'F', 'M1']
const VR114_COORDS = [
  [34.64166666, -102.9],
  [35.7, -102.96666666],
  [35.58333333, -103.63333333],
  [35.53333333, -103.94166666],
  [35.05833333, -104.04166666],
  [34.825, -103.74166666],
  [34.65, -103.78333333],
]
const KABQ = { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.040194, longitude: -106.609139 }
const KSKX = { identifier: 'KSKX', name: 'Taos', latitude: 36.458222, longitude: -105.671667 }
const KTCC = { identifier: 'KTCC', name: 'Tucumcari', latitude: 35.182778, longitude: -103.603194 }

const points = VR114.map((point, index) => ({
  ptIdent: point,
  originalName: `VR114-${point}`,
  lat: VR114_COORDS[index][0],
  lon: VR114_COORDS[index][1],
}))

function widths() {
  return VR114.slice(0, -1).map((_, index) => (index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }))
}

function userTable(xml) {
  const table = xml.slice(xml.indexOf('<waypoint-table>'), xml.indexOf('</waypoint-table>'))
  return table
    .split('<waypoint>')
    .slice(1)
    .map((block) => ({
      id: block.match(/<identifier>([^<]+)/)[1],
      type: block.match(/<type>([^<]+)/)[1],
      lat: Number(block.match(/<lat>([^<]+)/)[1]),
      lon: Number(block.match(/<lon>([^<]+)/)[1]),
    }))
    .filter((row) => row.type.includes('USER'))
}

function routeUsers(xml) {
  const route = xml.slice(xml.indexOf('<route>'), xml.indexOf('</route>'))
  return [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>\s*<waypoint-type>([^<]*)<\/waypoint-type>/g)]
    .filter((match) => match[2].includes('USER'))
    .map((match) => match[1])
}

function offsetFromCenterlineNm(point, ptIdent, from, to) {
  const start = points.findIndex((item) => item.ptIdent === from)
  const end = points.findIndex((item) => item.ptIdent === to)
  const at = points.findIndex((item) => item.ptIdent === ptIdent)
  const legs = []
  if (at > start) legs.push([points[at], points[at - 1]])
  if (at < end) legs.push([points[at], points[at + 1]])
  return Math.min(
    ...legs.map(([a, b]) =>
      Math.abs(
        crossTrackNm(
          { lat: point.lat, lon: point.lon },
          { lat: a.lat, lon: a.lon },
          { lat: b.lat, lon: b.lon }
        )
      )
    )
  )
}

describe('team sortie files use offset coordinates', () => {
  const plan = draftTeamPlan({
    flightPlanId: 'vr114',
    savedAt: '2026-10-23T18:00:00.000Z',
    crews: [
      { id: 'team1', label: 'Team 1', departure: KABQ, refuelStop: KTCC },
      { id: 'team2', label: 'Team 2', departure: KSKX, refuelStop: KTCC },
    ],
    sides: { team1: 'outer', team2: 'inner' },
    segments: {
      team1: { from: 'B', to: 'E', start: 'B' },
      team2: { from: 'A', to: 'B', start: 'A' },
    },
  })

  it('places every user waypoint on its lane and never reuses a name', () => {
    for (const team of plan.teams) {
      for (const number of [1, 2]) {
        const built = teamSortieOffsetRoute({
          team,
          points,
          legWidths: widths(),
          sortieNumber: number,
        })
        expect('error' in built).toBe(false)
        const file = buildTeamPlanSortieFile({
          team,
          points,
          legWidths: widths(),
          routeLabel: 'VR114',
          sortieNumber: number,
        })
        const table = userTable(file.xml)
        const byName = new Map()
        for (const waypoint of built.waypoints) {
          expect(waypoint.g1000Name).toMatch(/^[A-Z][A-Z0-9]{0,3}[1-9][IO]$/)
          expect(waypoint.g1000Name.length).toBeLessThanOrEqual(6)
          const prior = byName.get(waypoint.g1000Name)
          if (prior) {
            expect(prior.lat).toBeCloseTo(waypoint.lat, 6)
            expect(prior.lon).toBeCloseTo(waypoint.lon, 6)
          } else {
            byName.set(waypoint.g1000Name, waypoint)
          }
        }
        expect(routeUsers(file.xml)).toEqual(built.waypoints.map((waypoint) => waypoint.g1000Name))
        expect(table.map((row) => row.id).sort()).toEqual([...byName.keys()].sort())
        for (const row of table) {
          const lane = byName.get(row.id)
          expect(row.lat).toBeCloseTo(lane.lat, 5)
          expect(row.lon).toBeCloseTo(lane.lon, 5)
          const offset = offsetFromCenterlineNm(row, lane.ptIdent, team.segmentFrom, team.segmentTo)
          expect(Math.abs(offset - lane.offsetNm)).toBeLessThan(0.1)
          const onCenterline = points.some(
            (point) => Math.abs(point.lat - row.lat) < 0.0001 && Math.abs(point.lon - row.lon) < 0.0001
          )
          expect(onCenterline).toBe(false)
        }
        const airports = file.xml.match(/<type>AIRPORT<\/type>[\s\S]*?<identifier>([^<]+)/g)
        expect(file.xml).toContain(number === 1 ? team.departure.identifier : 'KTCC')
        expect(file.xml).toContain(number === 1 ? 'KTCC' : team.departure.identifier)
        expect(airports).not.toBeNull()
        const shared = buildNamedOffsetSortieFile({
          points,
          legWidths: widths(),
          fromPt: team.segmentFrom,
          toPt: team.segmentTo,
          side: built.side,
          departure: built.departure,
          landing: built.landing,
          routeLabel: 'VR114',
          sortieNumber: number,
          homeIdent: team.departure.identifier,
        })
        const explicit = buildNamedOffsetSortieFile({
          points,
          legWidths: widths(),
          fromPt: team.segmentFrom,
          toPt: team.segmentTo,
          side: built.side,
          departure: built.departure,
          landing: built.landing,
          routeLabel: 'VR114',
          sortieNumber: number,
          homeIdent: team.departure.identifier,
          offsets: [...new Set(built.waypoints.map((waypoint) => waypoint.offsetNm))].sort((a, b) => a - b),
        })
        const body = (xml) => xml.replace(/<created>[^<]*<\/created>/, '')
        expect(body(shared.xml)).toBe(body(file.xml))
        expect(body(explicit.xml)).toBe(body(file.xml))
        expect(shared.filename).toBe(
          `VR114_${team.departure.identifier}_${team.segmentFrom}${team.segmentTo}_S${number}.fpl`
        )
      }
    }
    const outer = plan.teams[0]
    const sortie1 = teamSortieOffsetRoute({ team: outer, points, legWidths: widths(), sortieNumber: 1 })
    const bLanes = sortie1.waypoints.filter((waypoint) => waypoint.ptIdent === 'B')
    expect(bLanes.map((waypoint) => waypoint.g1000Name)).toEqual(['B1O', 'B2O', 'B3O'])
    const curve = routeCurveSide(points)
    const bIndex = points.findIndex((point) => point.ptIdent === 'B')
    const cross = crossTrackNm(bLanes[0], points[bIndex], points[bIndex + 1])
    expect(curve.outerSide === 'right' ? cross > 0 : cross < 0).toBe(true)
  })

  it('names a clockwise outer lane on the left of the course', () => {
    const square = [
      { ptIdent: 'A', originalName: 'VR900-A', lat: 35, lon: -106 },
      { ptIdent: 'B', originalName: 'VR900-B', lat: 36, lon: -106 },
      { ptIdent: 'C', originalName: 'VR900-C', lat: 36, lon: -105 },
      { ptIdent: 'D', originalName: 'VR900-D', lat: 35, lon: -105 },
    ]
    expect(routeCurveSide(square).sense).toBe('clockwise')
    const named = offsetSortieWaypoints({
      points: square,
      legWidths: square.slice(0, -1).map(() => ({ leftNm: 20, rightNm: 20 })),
      fromPt: 'A',
      toPt: 'B',
      side: 'outer',
      departure: KABQ,
      landing: KABQ,
      offsets: [3],
    })
    expect('error' in named).toBe(false)
    if ('error' in named) return
    expect(named.waypoints[0].g1000Name).toBe('B1O')
    expect(crossTrackNm(named.waypoints[0], square[0], square[1])).toBeLessThan(0)
  })

  it('starts the same lanes at the other end when startAt is the far point', () => {
    const shared = {
      points,
      legWidths: widths(),
      fromPt: 'A',
      toPt: 'B',
      side: 'inner',
      departure: KSKX,
      landing: KSKX,
      routeLabel: 'VR114',
      sortieNumber: 1,
      homeIdent: 'KLRU',
      offsets: [2.5],
      namePrefix: 'U',
    }
    const fromA = buildNamedOffsetSortieFile(shared)
    const fromB = buildNamedOffsetSortieFile({ ...shared, startAt: 'B' })
    const place = (file) =>
      userTable(file.xml)
        .map((row) => `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`)
        .sort()
    expect(routeUsers(fromA.xml)).not.toEqual(routeUsers(fromB.xml))
    expect(place(fromA)).toEqual(place(fromB))
    expect(fromA.filename).toBe('VR114_KLRU_AB_S1.fpl')
    const used = new Map()
    expect(uniqueSortieFilename(fromA.filename, used)).toBe('VR114_KLRU_AB_S1.fpl')
    expect(uniqueSortieFilename(fromA.filename, used)).toBe('VR114_KLRU_AB_S1_2.fpl')
    expect(fromA.xml).toContain('>UA')
  })
})
