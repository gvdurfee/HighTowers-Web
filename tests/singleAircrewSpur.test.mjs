import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildOffsetRoutes, crossTrackNm } from '../shared/survey-planning/offsetRoutePlan.js'
import { assignG1000WaypointNames } from '../shared/survey-planning/g1000Names.js'
import { buildSortieOffsetFpl, orderSortieTrack } from '../src/services/offsetRouteFpl.ts'
import { handledSpurTipIndexes, singleAircrewSortieTrack } from '../src/services/singleAircrewSpur.ts'
import { visibleOffsetFlags } from '../src/services/singleAircrewMap.ts'

const EARTH_NM = 6371000 / 1852

function distanceNm(a, b) {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = ((b.lat - a.lat) * Math.PI) / 180
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function midpoint(a, b) {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
}

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
    ptIdent: row.originalName.replace(/^(?:SR|VR)\d+-?/, ''),
    g1000Name: named.names[index].g1000Name,
  }))
}

function sr213Tracks() {
  const points = routePoints(sr213)
  const widths = points.slice(0, -1).map(() => ({
    leftNm: 2.5,
    rightNm: 2.5,
    trackLeftNm: 2.5,
    trackRightNm: 2.5,
  }))
  return { points, built: buildOffsetRoutes(points, widths) }
}

function fileOf(waypoints, sortieNumber, side) {
  return buildSortieOffsetFpl({
    routeLabel: 'SR213',
    sortieNumber,
    side,
    waypoints: waypoints.map((point) => ({
      g1000Name: point.g1000Name || point.ptIdent,
      lat: point.lat,
      lon: point.lon,
    })),
  })
}

function identifiers(xml) {
  return [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)].map((match) => match[1])
}

function listHash(routeName, ids) {
  return createHash('sha256').update(`${routeName}\n${ids.join(',')}`).digest('hex')
}

const SR213_CENTERLINE = ['G001', 'H002', 'G003', 'A004', 'B005', 'C006', 'D007', 'E008', 'F009', 'G010', 'H011']
const SR213_S1 = ['G001I', 'H002I', 'H003O', 'G004I', 'A005I', 'B006I', 'C007I', 'D008I', 'E009I', 'F010I', 'G011I', 'H012I']
const SR213_S2 = ['H001O', 'G002O', 'F003O', 'E004O', 'D005O', 'C006O', 'B007O', 'A008O', 'G009O']

describe('single-aircrew spur once in Sortie 1', () => {
  it('flies SR213 out and back on Sortie 1 and leaves the spur out of Sortie 2', () => {
    const { points, built } = sr213Tracks()
    const sortie1 = singleAircrewSortieTrack({
      centerline: points,
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    const sortie2 = singleAircrewSortieTrack({
      centerline: points,
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side: 'inner',
      sortieNumber: 2,
    })
    expect(sortie1.waypoints.map((point) => point.g1000Name)).toEqual([
      'G001I', 'H002I', 'H003O', 'G004I', 'A005I', 'B006I', 'C007I', 'D008I', 'E009I', 'F010I', 'G011I', 'H012I',
    ])
    const hotels = sortie1.waypoints.filter((point) => point.originalName === 'SR214H')
    expect(hotels).toHaveLength(2)
    expect(hotels.map((point) => point.g1000Name)).toEqual(['H002I', 'H003O'])
    const crossover = distanceNm(hotels[0], hotels[1])
    expect(crossover).toBeGreaterThan(4.9)
    expect(crossover).toBeLessThan(5.1)

    const spur = points[0]
    const tip = points[1]
    const down = [sortie1.waypoints[0], sortie1.waypoints[1]]
    const back = [sortie1.waypoints[2], sortie1.waypoints[3]]
    for (const point of down) {
      expect(Math.abs(Math.abs(crossTrackNm(point, spur, tip)) - 2.5)).toBeLessThan(0.1)
    }
    for (const point of back) {
      expect(Math.abs(Math.abs(crossTrackNm(point, spur, tip)) - 2.5)).toBeLessThan(0.1)
    }
    expect(Math.abs(Math.abs(crossTrackNm(midpoint(down[0], down[1]), spur, tip)) - 2.5)).toBeLessThan(0.1)
    expect(Math.abs(Math.abs(crossTrackNm(midpoint(back[0], back[1]), spur, tip)) - 2.5)).toBeLessThan(0.1)
    expect(crossTrackNm(down[0], spur, tip) * crossTrackNm(back[0], spur, tip)).toBeLessThan(0)

    expect(sortie2.waypoints.map((point) => point.g1000Name)).toEqual([
      'H001O', 'G002O', 'F003O', 'E004O', 'D005O', 'C006O', 'B007O', 'A008O', 'G009O',
    ])
    expect(sortie2.waypoints.some((point) => point.originalName === 'SR214H')).toBe(false)
    expect(sortie2.waypoints.map((point) => point.originalName)).toEqual([
      'SR213-H', 'SR213-G', 'SR213-F', 'SR213-E', 'SR213-D', 'SR213-C', 'SR213-B', 'SR213-A', 'SR213-G',
    ])
  })

  it('leaves the shared sortie order, and a route with no spur, byte for byte as they are', () => {
    const { points, built } = sr213Tracks()
    const shared1 = orderSortieTrack({
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    const shared2 = orderSortieTrack({
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side: 'inner',
      sortieNumber: 2,
    })
    expect(identifiers(fileOf(shared1.waypoints, 1, shared1.side).xml)).toEqual([
      'G001I', 'H002I', 'G003I', 'A004I', 'B005I', 'C006I', 'D007I', 'E008I', 'F009I', 'G010I', 'H011I',
    ])
    expect(shared1.waypoints.filter((point) => point.originalName === 'SR214H')).toHaveLength(1)
    expect(identifiers(fileOf(shared2.waypoints, 2, shared2.side).xml)).toContain('H002O')

    const vr114 = routePoints([
      { originalName: 'VR114-A', lat: 35, lon: -106 },
      { originalName: 'VR114-B', lat: 36, lon: -106 },
      { originalName: 'VR114-C', lat: 36, lon: -105 },
      { originalName: 'VR114-D', lat: 35, lon: -105 },
    ])
    const widths = vr114.slice(0, -1).map(() => ({ leftNm: 6, rightNm: 6 }))
    const builtVr = buildOffsetRoutes(vr114, widths)
    expect(handledSpurTipIndexes(vr114)).toEqual([])
    for (const sortieNumber of [1, 2]) {
      const shared = orderSortieTrack({
        inner: builtVr.inner.waypoints,
        outer: builtVr.outer.waypoints,
        sortie1Side: 'inner',
        sortieNumber,
      })
      const solo = singleAircrewSortieTrack({
        centerline: vr114,
        inner: builtVr.inner.waypoints,
        outer: builtVr.outer.waypoints,
        sortie1Side: 'inner',
        sortieNumber,
      })
      expect(fileOf(solo.waypoints, sortieNumber, solo.side).xml).toBe(
        fileOf(shared.waypoints, sortieNumber, shared.side).xml
      )
    }
  })

  it('hides the fold-back warning for a handled spur and keeps one that is not a spur', () => {
    const { points, built } = sr213Tracks()
    expect(handledSpurTipIndexes(points)).toEqual([1])
    const shown = visibleOffsetFlags(built.flags, true, points)
    expect(shown.some((flag) => flag.reason === 'foldBack')).toBe(false)
    expect(visibleOffsetFlags(built.flags, false, points).some((flag) => flag.reason === 'foldBack')).toBe(true)

    const start = { originalName: 'SR900-A', ptIdent: 'A', lat: 35, lon: -106 }
    const reversal = [start, { originalName: 'SR900-B', ptIdent: 'B', lat: 34.8, lon: -106 }, start]
    expect(handledSpurTipIndexes(reversal)).toEqual([])
    expect(
      visibleOffsetFlags(
        [{ reason: 'foldBack', index: 1, message: 'B on the left track does not join cleanly' }],
        true,
        reversal
      )
    ).toHaveLength(1)
  })

  it('pins the SR213 sortie files and keeps the detail-page centerline names', () => {
    const { points, built } = sr213Tracks()
    expect(points.map((point) => point.g1000Name)).toEqual(SR213_CENTERLINE)
    expect(points.every((point) => !/[IO]$/.test(point.g1000Name))).toBe(true)

    const pinned = [
      { sortieNumber: 1, ids: SR213_S1, routeName: 'SR213 S1 INNER', filename: 'SR213-S1-INNER.fpl', hash: '860393adabb9f9038dcd7338cabfabd68af9525f1fd0f8dddcf021b0c383d8db' },
      { sortieNumber: 2, ids: SR213_S2, routeName: 'SR213 S2 OUTER', filename: 'SR213-S2-OUTER.fpl', hash: '0a61816d4d568a9f33d53247f5d2da763fb64b064c4a6aeb0236e116bf715abb' },
    ]
    for (const pin of pinned) {
      const track = singleAircrewSortieTrack({
        centerline: points,
        inner: built.inner.waypoints,
        outer: built.outer.waypoints,
        sortie1Side: 'inner',
        sortieNumber: pin.sortieNumber,
      })
      const file = fileOf(track.waypoints, pin.sortieNumber, track.side)
      expect(identifiers(file.xml)).toEqual(pin.ids)
      expect(file.routeName).toBe(pin.routeName)
      expect(file.filename).toBe(pin.filename)
      expect(listHash(file.routeName, identifiers(file.xml))).toBe(pin.hash)
      expect(track.waypoints.map((point) => point.g1000Name)).toEqual(pin.ids)
    }
  })

  it('uses the sortie file identifiers for Map View and Show names, spur and non-spur', () => {
    const { points, built } = sr213Tracks()
    const letterCenterline = points.map((point) => ({
      ...point,
      ptIdent: point.originalName.replace(/^(?:SR|VR)\d+-?/, ''),
    }))
    const namedCenterline = points.map((point) => ({ ...point, ptIdent: point.g1000Name }))
    for (const sortieNumber of [1, 2]) {
      const drawn = singleAircrewSortieTrack({
        centerline: letterCenterline,
        inner: built.inner.waypoints,
        outer: built.outer.waypoints,
        sortie1Side: 'inner',
        sortieNumber,
      })
      const fileIds = identifiers(fileOf(drawn.waypoints, sortieNumber, drawn.side).xml)
      const labels = drawn.waypoints.map((point) => point.g1000Name)
      expect(labels).toEqual(fileIds)
      expect(labels).toEqual(sortieNumber === 1 ? SR213_S1 : SR213_S2)
    }
    const skipped = singleAircrewSortieTrack({
      centerline: namedCenterline,
      inner: built.inner.waypoints,
      outer: built.outer.waypoints,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    expect(skipped.waypoints.map((point) => point.g1000Name)).toEqual([
      'G001I', 'H002I', 'G003I', 'A004I', 'B005I', 'C006I', 'D007I', 'E008I', 'F009I', 'G010I', 'H011I',
    ])
    expect(skipped.waypoints.some((point) => point.g1000Name === 'H003O')).toBe(false)

    const vr114 = routePoints([
      { originalName: 'VR114-A', lat: 35, lon: -106 },
      { originalName: 'VR114-B', lat: 36, lon: -106 },
      { originalName: 'VR114-C', lat: 36, lon: -105 },
      { originalName: 'VR114-D', lat: 35, lon: -105 },
    ])
    const widths = vr114.slice(0, -1).map(() => ({ leftNm: 6, rightNm: 6 }))
    const builtVr = buildOffsetRoutes(vr114, widths)
    for (const sortieNumber of [1, 2]) {
      const drawn = singleAircrewSortieTrack({
        centerline: vr114,
        inner: builtVr.inner.waypoints,
        outer: builtVr.outer.waypoints,
        sortie1Side: 'inner',
        sortieNumber,
      })
      const fileIds = identifiers(fileOf(drawn.waypoints, sortieNumber, drawn.side).xml)
      expect(drawn.waypoints.map((point) => point.g1000Name)).toEqual(fileIds)
      expect(fileIds.every((name) => name.endsWith(sortieNumber === 1 ? 'I' : 'O'))).toBe(true)
    }

    const page = readFileSync(new URL('../src/pages/MissionMapPage.tsx', import.meta.url), 'utf8')
    const overlays = page.slice(page.indexOf('const crewOverlays'), page.indexOf('const activeOverlay'))
    expect(overlays).toContain('parseWaypointCode(wp.originalName)?.waypointLetter ?? wp.g1000Name')
    const panel = readFileSync(new URL('../src/components/OffsetRoutePanel.tsx', import.meta.url), 'utf8')
    const names = panel.slice(panel.indexOf('function sortieWaypoints'), panel.indexOf('const exportFreshness'))
    expect(names).toContain('singleAircrewSortieTrack')
    const table = panel.slice(panel.indexOf('<tbody>'), panel.indexOf('</tbody>'))
    expect(table).toContain('singleAircrew')
    expect(table).toContain('sortie2List[index]')
    const detail = readFileSync(new URL('../src/pages/FlightPlanDetailPage.tsx', import.meta.url), 'utf8')
    expect(detail).toContain('assignG1000WaypointNames')
    expect(detail).not.toContain('singleAircrewSortieTrack')
    expect(detail).not.toContain('assignOffsetWaypointNames')
  })
})
