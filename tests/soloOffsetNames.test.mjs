import { describe, expect, it } from 'vitest'
import { buildOffsetRoutes, crossTrackNm } from '../shared/survey-planning/offsetRoutePlan.js'
import { laneWaypointName } from '../shared/survey-planning/g1000Names.js'
import { buildCoordinatorCrewOffsetFile } from '../src/services/coordinatorOffsetExport.ts'
import { buildSortieOffsetFpl, orderSortieTrack } from '../src/services/offsetRouteFpl.ts'
import { serpentineFromTracks, sortieWaypointLine } from '../src/services/crewSerpentineOverlay.ts'
import { buildSerpentineDisplay, passesForSortie } from '../src/services/serpentineDisplay.ts'
import { publishedPointLabel } from '../src/utils/mtrWaypointCode.ts'

const LETTERS = ['A', 'B', 'C', 'K', 'S']

function points() {
  return LETTERS.map((point, index) => ({
    ptIdent: point,
    originalName: `IR111-${point}`,
    lat: 34.8 + index * 0.05,
    lon: -105.5 + index * 0.2,
  }))
}

function nmApart(a, b) {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return (2 * 6371000 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))) / 1852
}

function fplUserPoints(xml, airports) {
  const route = xml.split('<route>')[1] ?? ''
  const ids = [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)]
    .map((match) => match[1])
    .filter((id) => !airports.includes(id))
  const table = [...xml.matchAll(/<identifier>([^<]+)<\/identifier>[\s\S]*?<lat>([^<]+)<\/lat>\s*<lon>([^<]+)<\/lon>/g)]
  const byId = new Map(table.map((match) => [match[1], { lat: Number(match[2]), lon: Number(match[3]) }]))
  return ids.map((name) => ({ name, ...byId.get(name) }))
}

function userNames(xml) {
  return [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)]
    .map((match) => match[1])
    .filter((id) => id !== 'KABQ' && id !== 'KLRU')
}

describe('solo offset names and centerline labels', () => {
  const route = points()
  const widths = route.slice(0, -1).map(() => ({ leftNm: 4, rightNm: 4 }))
  const departure = { identifier: 'KABQ', latitude: 35.04, longitude: -106.6 }
  const destination = { identifier: 'KLRU', latitude: 32.29, longitude: -106.92 }

  it('names one lane per side with I or O last, on the file and the map', () => {
    const plan = buildOffsetRoutes(route, widths)
    const overlay = serpentineFromTracks({
      id: 'team1',
      label: 'IR111',
      sortie1Side: 'outer',
      inner: plan.inner.waypoints,
      outer: plan.outer.waypoints,
    })
    const sortie1 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'IR111',
      points: route,
      legWidths: widths,
      sortie1Side: 'outer',
      sortieNumber: 1,
      departure,
      destination,
    })
    const sortie2 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'IR111',
      points: route,
      legWidths: widths,
      sortie1Side: 'outer',
      sortieNumber: 2,
      departure: destination,
      destination: departure,
    })
    const mapNames = overlay.passes.flatMap((pass) => pass.names)
    for (const name of [...userNames(sortie1.xml), ...userNames(sortie2.xml), ...mapNames]) {
      expect(name).toMatch(/^[A-Z][A-Z0-9]{0,4}[IO]$/)
      expect(name.startsWith('L')).toBe(false)
      expect(name.startsWith('R')).toBe(false)
      expect(name.length).toBeLessThanOrEqual(6)
    }
    expect(userNames(sortie1.xml)).toEqual(overlay.passes[0].names)
    expect(userNames(sortie2.xml)).toEqual(overlay.passes[1].names)
    expect(userNames(sortie1.xml)).toEqual(['A001O', 'B002O', 'C003O', 'K004O', 'S005O'])
    expect(userNames(sortie2.xml)).toEqual(['S005I', 'K004I', 'C003I', 'B002I', 'A001I'])
  })

  it('labels a centerline point with its published letters only', () => {
    expect(publishedPointLabel('IR111-A')).toBe('A')
    expect(publishedPointLabel('IR111-K')).toBe('K')
    expect(publishedPointLabel('VR114-M1')).toBe('M1')
    expect(publishedPointLabel('VR114-XM')).toBe('XM')
    expect(publishedPointLabel('A001O')).toBeNull()
  })

  it('draws IR111 Sortie 1 on the outer track using the same points as the file', () => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q']
    const coords = [
      [34.80833333, -105.55],
      [35.45, -105.55],
      [35.68333333, -105.55],
      [35.76666666, -105.55],
      [36.18333333, -105.55],
      [36.25, -105.41666666],
      [36.21666666, -105.31666666],
      [36.1, -105.08333333],
      [35.91666666, -104.66666666],
      [35.83333333, -104.58333333],
      [35.53333333, -104.63333333],
      [35.43333333, -104.71666666],
      [35.23333333, -105.26666666],
      [35.13333333, -105.3],
      [34.75, -105],
      [34.7, -104.88333333],
      [34.88333333, -103.93333333],
    ]
    const route = letters.map((point, index) => ({
      ptIdent: point,
      originalName: `IR111-${point}`,
      lat: coords[index][0],
      lon: coords[index][1],
    }))
    const widths = route.slice(0, -1).map((_, index) =>
      index < 10 ? { leftNm: 4, rightNm: 4 } : { leftNm: 6, rightNm: 6 }
    )
    const plan = buildOffsetRoutes(route, widths)
    const departure = { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.040194, longitude: -106.609139 }
    const destination = { identifier: 'KTCC', name: 'Tucumcari', latitude: 35.182778, longitude: -103.603194 }
    const overlay = serpentineFromTracks({
      id: 'team1',
      label: 'IR111',
      sortie1Side: 'outer',
      inner: plan.inner.waypoints,
      outer: plan.outer.waypoints,
      departure,
      destination,
    })
    for (const sortieNumber of [1, 2]) {
      const ordered = orderSortieTrack({
        inner: plan.inner.waypoints,
        outer: plan.outer.waypoints,
        sortie1Side: 'outer',
        sortieNumber,
      })
      const file = buildSortieOffsetFpl({
        routeLabel: 'IR111',
        sortieNumber,
        side: ordered.side,
        waypoints: ordered.waypoints,
        departure: sortieNumber === 1 ? departure : destination,
        destination: sortieNumber === 1 ? destination : departure,
      })
      const filePoints = fplUserPoints(file.xml, ['KABQ', 'KTCC'])
      const drawn = buildSerpentineDisplay(passesForSortie(overlay.passes, sortieNumber))
      expect(drawn.labels.map((label) => label.name)).toEqual(filePoints.map((point) => point.name))
      drawn.labels.forEach((label, index) => {
        expect(nmApart(label, filePoints[index])).toBeLessThan(0.01)
      })
      expect(overlay.passes[sortieNumber - 1].waypoints.map((point) => point.name)).toEqual(
        filePoints.map((point) => point.name)
      )
    }
    const first = overlay.passes[0].waypoints[0]
    expect(first.name).toBe('A001O')
    expect(first.lon).toBeLessThan(route[0].lon)
    expect(crossTrackNm(first, route[0], route[1])).toBeLessThan(0)
  })

  it('highlights the sortie whose labels are drawn, on that side of the route', () => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q']
    const coords = [
      [34.80833333, -105.55],
      [35.45, -105.55],
      [35.68333333, -105.55],
      [35.76666666, -105.55],
      [36.18333333, -105.55],
      [36.25, -105.41666666],
      [36.21666666, -105.31666666],
      [36.1, -105.08333333],
      [35.91666666, -104.66666666],
      [35.83333333, -104.58333333],
      [35.53333333, -104.63333333],
      [35.43333333, -104.71666666],
      [35.23333333, -105.26666666],
      [35.13333333, -105.3],
      [34.75, -105],
      [34.7, -104.88333333],
      [34.88333333, -103.93333333],
    ]
    const route = letters.map((point, index) => ({
      ptIdent: point,
      originalName: `IR111-${point}`,
      lat: coords[index][0],
      lon: coords[index][1],
    }))
    const widths = route.slice(0, -1).map((_, index) =>
      index < 10 ? { leftNm: 4, rightNm: 4 } : { leftNm: 6, rightNm: 6 }
    )
    const plan = buildOffsetRoutes(route, widths)

    function check(sortie1Side) {
      const overlay = serpentineFromTracks({
        id: 'team1',
        label: 'IR111',
        sortie1Side,
        inner: plan.inner.waypoints,
        outer: plan.outer.waypoints,
      })
      for (const sortieNumber of [1, 2]) {
        const pass = passesForSortie(overlay.passes, sortieNumber)[0]
        const labels = buildSerpentineDisplay([pass]).labels
        const line = sortieWaypointLine(pass.waypoints)
        expect(line).toHaveLength(labels.length)
        const side = sortieNumber === 1 ? sortie1Side : sortie1Side === 'outer' ? 'inner' : 'outer'
        line.forEach((coord, index) => {
          const label = labels[index]
          expect(nmApart({ lon: coord[0], lat: coord[1] }, label)).toBeLessThan(0.01)
          expect(coord[0]).toBeCloseTo(label.lon, 6)
          expect(coord[1]).toBeCloseTo(label.lat, 6)
          const routeIndex = pass.number === 1 ? index : route.length - 1 - index
          const from = routeIndex >= route.length - 1 ? route[route.length - 2] : route[routeIndex]
          const to = routeIndex >= route.length - 1 ? route[route.length - 1] : route[routeIndex + 1]
          const cross = crossTrackNm({ lon: coord[0], lat: coord[1] }, from, to)
          expect(side === 'outer' ? cross < 0 : cross > 0).toBe(true)
        })
      }
    }

    check('outer')
    check('inner')
    expect(route[0].lon).toBe(-105.55)
    expect(route[1].lon).toBe(-105.55)
    const outerA = plan.outer.waypoints[0]
    const outerB = plan.outer.waypoints[1]
    expect(outerA.g1000Name).toBe('A001O')
    expect(outerB.g1000Name).toBe('B002O')
    expect(outerA.lon).toBeLessThan(route[0].lon)
    expect(outerB.lon).toBeLessThan(route[1].lon)
  })

  it('leaves team lane names on the lane number', () => {
    expect(laneWaypointName('VR114-B', 'outer', 1).name).toBe('B1O')
    expect(laneWaypointName('VR114-XM', 'inner', 2).name).toBe('XM2I')
  })
})
