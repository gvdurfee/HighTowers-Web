import { describe, expect, it } from 'vitest'
import {
  assignG1000WaypointNames,
  assignOffsetWaypointNames,
  G1000_ROUTE_NAME_MAX_LEN,
  laneWaypointName,
  sortieFileName,
  sortieRouteName,
} from '../shared/survey-planning/g1000Names.js'
import { buildOffsetRoutes, reverseOffsetTrack } from '../shared/survey-planning/offsetRoutePlan.js'
import {
  buildSortieOffsetFpl,
  missingSortieChoiceNotice,
  otherSortieSide,
  sortie2Explanation,
} from '../src/services/offsetRouteFpl.ts'

const IR112 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'EH', 'I', 'J', 'EK', 'L', 'XM', 'TN', 'AA', 'AB', 'AC', 'AD', 'XM']
const VR1022 = ['A', 'EA', 'E3X', 'C1']

const IR112_CENTERLINE = [
  'A001', 'B002', 'C003', 'D004', 'E005', 'F006', 'G007', 'EH008', 'I009', 'J010',
  'EK011', 'L012', 'XM013', 'TN014', 'AA015', 'AB016', 'AC017', 'AD018', 'XM019',
]
const IR112_INNER = [
  'LA001', 'LB002', 'LC003', 'LD004', 'LE005', 'LF006', 'LG007', 'LEH008', 'LI009', 'LJ010',
  'LEK011', 'LL012', 'LXM013', 'LTN014', 'LAA015', 'LAB016', 'LAC017', 'LAD018', 'LXM019',
]
const IR112_OUTER = [
  'RA001', 'RB002', 'RC003', 'RD004', 'RE005', 'RF006', 'RG007', 'REH008', 'RI009', 'RJ010',
  'REK011', 'RL012', 'RXM013', 'RTN014', 'RAA015', 'RAB016', 'RAC017', 'RAD018', 'RXM019',
]

function named(ids, route, prefix) {
  return assignG1000WaypointNames(
    ids.map((point) => ({ originalName: `${route}-${point}`, prefix }))
  )
}

function routePoints(ids, route) {
  return ids.map((point, index) => ({
    ptIdent: point.replace(/\*$/, ''),
    originalName: `${route}-${point}`,
    lat: 35 + index * 0.05,
    lon: -106,
  }))
}

describe('G1000 waypoint names', () => {
  it('names solo offset waypoints with the point, the route position, and I or O last', () => {
    const namedOffsets = assignOffsetWaypointNames(
      IR112.map((point, index) => ({ originalName: `IR112-${point}`, side: 'inner', sequence: index + 1 }))
    )
    expect(namedOffsets.error).toBeNull()
    expect(namedOffsets.names.map((item) => item.g1000Name)).toEqual([
      'A001I', 'B002I', 'C003I', 'D004I', 'E005I', 'F006I', 'G007I', 'EH008I', 'I009I', 'J010I',
      'EK011I', 'L012I', 'XM013I', 'TN014I', 'AA015I', 'AB016I', 'AC017I', 'AD018I', 'XM019I',
    ])
    expect(assignOffsetWaypointNames([{ originalName: 'VR1022-E3X', side: 'outer', sequence: 3 }]).names[0].g1000Name).toBe(
      'E3X03O'
    )
  })

  it('names a team lane with the point, the lane number, and I or O', () => {
    expect(laneWaypointName('VR114-B', 'outer', 1)).toEqual({ name: 'B1O', error: null })
    expect(laneWaypointName('VR114-XM', 'inner', 2)).toEqual({ name: 'XM2I', error: null })
    expect(laneWaypointName('VR114-M1', 'inner', 1)).toEqual({ name: 'M11I', error: null })
    expect(laneWaypointName('VR114-B', 'outer', 3).name).toBe('B3O')
  })

  it('numbers IR112 centerline, inner, and outer from the centerline order', () => {
    expect(named(IR112, 'IR112').names.map((item) => item.g1000Name)).toEqual(IR112_CENTERLINE)
    expect(named(IR112, 'IR112', 'L').names.map((item) => item.g1000Name)).toEqual(IR112_INNER)
    expect(named(IR112, 'IR112', 'R').names.map((item) => item.g1000Name)).toEqual(IR112_OUTER)
    expect(named(IR112, 'IR112').error).toBeNull()
  })

  it('keeps every name unique, six characters or fewer, and letters and digits only', () => {
    for (const prefix of [undefined, 'L', 'R']) {
      const result = named(IR112, 'IR112', prefix)
      expect(result.error).toBeNull()
      expect(new Set(result.names.map((item) => item.g1000Name)).size).toBe(IR112.length)
      for (const item of result.names) {
        expect(item.g1000Name.length).toBeLessThanOrEqual(6)
        expect(item.g1000Name).toMatch(/^[A-Z0-9]+$/)
      }
    }
  })

  it('drops the leading zero when a 3-character point plus a prefix does not fit', () => {
    const atStart = assignG1000WaypointNames([{ originalName: 'VR1022-E3X', prefix: 'L' }])
    expect(atStart.error).toBeNull()
    expect(atStart.names[0].g1000Name).toBe('LE3X01')

    const sample = named(VR1022, 'VR1022')
    expect(sample.names.map((item) => item.g1000Name)).toEqual(['A001', 'EA002', 'E3X003', 'C1004'])
    expect(named(VR1022, 'VR1022', 'L').names.map((item) => item.g1000Name)).toEqual([
      'LA001',
      'LEA002',
      'LE3X03',
      'LC1004',
    ])
    expect(named(VR1022, 'VR1022', 'R').names.map((item) => item.g1000Name)).toEqual([
      'RA001',
      'REA002',
      'RE3X03',
      'RC1004',
    ])
  })

  it('refuses a name that still does not fit, or a 2-digit sequence past 99 points', () => {
    const tooWide = assignG1000WaypointNames([{ originalName: 'VR1022-ABCD', prefix: 'L' }])
    expect(tooWide.names).toEqual([])
    expect(tooWide.error).toMatch(/does not fit/)

    const longRoute = assignG1000WaypointNames([
      ...Array.from({ length: 99 }, (_, index) => ({ originalName: `VR1022-A${index}`, prefix: 'L' })),
      { originalName: 'VR1022-E3X', prefix: 'L' },
    ])
    expect(longRoute.names).toEqual([])
    expect(longRoute.error).toMatch(/stops at 99/)

    const past999 = assignG1000WaypointNames(
      Array.from({ length: 1000 }, () => ({ originalName: 'IR112-A' }))
    )
    expect(past999.names).toEqual([])
    expect(past999.error).toMatch(/stop at 999/)
  })

  it('uses the same offset names on both sorties and does not renumber the return', () => {
    const points = routePoints(IR112, 'IR112')
    const widths = points.slice(0, -1).map(() => ({ leftNm: 5, rightNm: 5 }))
    const plan = buildOffsetRoutes(points, widths)
    const sortie1 = plan.inner.waypoints.map((point) => point.g1000Name)
    const sortie2 = reverseOffsetTrack(plan.outer.waypoints).map((point) => point.g1000Name)
    expect(plan.nameError).toBeNull()
    expect(sortie1).toEqual([
      'A001I', 'B002I', 'C003I', 'D004I', 'E005I', 'F006I', 'G007I', 'EH008I', 'I009I', 'J010I',
      'EK011I', 'L012I', 'XM013I', 'TN014I', 'AA015I', 'AB016I', 'AC017I', 'AD018I', 'XM019I',
    ])
    expect(sortie2).toEqual(
      [
        'A001O', 'B002O', 'C003O', 'D004O', 'E005O', 'F006O', 'G007O', 'EH008O', 'I009O', 'J010O',
        'EK011O', 'L012O', 'XM013O', 'TN014O', 'AA015O', 'AB016O', 'AC017O', 'AD018O', 'XM019O',
      ].reverse()
    )
    expect(sortie2[0]).toBe('XM019O')
    expect(sortie2.at(-1)).toBe('A001O')
    expect(new Set(sortie1).size).toBe(sortie1.length)
    expect(sortie1.every((name) => /[IO]$/.test(name) && !/^[LR][A-Z]/.test(name))).toBe(true)
    expect(sortie2.every((name) => /[IO]$/.test(name) && !/^[LR][A-Z]/.test(name))).toBe(true)
    expect(sortie1.some((name) => sortie2.includes(name))).toBe(false)
  })
})

describe('two-sortie offset plans', () => {
  const departure = { identifier: 'KABQ', latitude: 35.04, longitude: -106.6 }
  const destination = { identifier: 'KINW', latitude: 35.2, longitude: -110.2 }
  const points = [
    { ptIdent: 'A', originalName: 'IR112-A', g1000Name: 'A112', lat: 35.1, lon: -106.4 },
    { ptIdent: 'B', originalName: 'IR112-B', g1000Name: 'B112', lat: 35.3, lon: -106.1 },
    { ptIdent: 'E', originalName: 'IR112-E', g1000Name: 'E112', lat: 35.5, lon: -105.8 },
  ]

  it('requires a saved sortie side and explains the return', () => {
    expect(sortie2Explanation('KABQ')).toBe(
      'Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own .fpl file.'
    )
    expect(sortie2Explanation('')).toMatch(/its own \.fpl file\.$/)
    expect(missingSortieChoiceNotice()).toMatch(/Flight Plans/)
    expect(otherSortieSide('inner')).toBe('outer')
    expect(otherSortieSide('outer')).toBe('inner')
  })

  it('builds sortie 2 reversed, with airports swapped and the same names', () => {
    const plan = buildOffsetRoutes(points, [
      { leftNm: 5, rightNm: 4 },
      { leftNm: 5, rightNm: 5 },
    ])
    const sortie1 = buildSortieOffsetFpl({
      routeLabel: 'IR112',
      sortieNumber: 1,
      side: 'inner',
      waypoints: plan.inner.waypoints,
      departure,
      destination,
    })
    const sortie2 = buildSortieOffsetFpl({
      routeLabel: 'IR112',
      sortieNumber: 2,
      side: 'outer',
      waypoints: reverseOffsetTrack(plan.outer.waypoints),
      departure: destination,
      destination: departure,
    })
    expect(sortie1.filename).toBe('IR112-S1-INNER.fpl')
    expect(sortie2.filename).toBe('IR112-S2-OUTER.fpl')
    expect(sortie1.routeName).toBe('IR112 S1 INNER')
    expect(sortie2.routeName).toBe('IR112 S2 OUTER')
    expect(sortie1.routeName.length).toBeLessThanOrEqual(G1000_ROUTE_NAME_MAX_LEN)
    expect(sortie2.routeName.length).toBeLessThanOrEqual(G1000_ROUTE_NAME_MAX_LEN)
    expect(sortie1.xml).toContain('<route-name>IR112 S1 INNER</route-name>')
    expect(sortie2.xml.indexOf('<waypoint-identifier>KINW</waypoint-identifier>')).toBeLessThan(
      sortie2.xml.indexOf('<waypoint-identifier>KABQ</waypoint-identifier>')
    )
    const sortie2Names = [...sortie2.xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)]
      .map((match) => match[1])
      .filter((id) => id !== 'KINW' && id !== 'KABQ')
    expect(sortie2Names).toEqual([...plan.outer.waypoints].reverse().map((point) => point.g1000Name))
    expect(sortieFileName('VR1022', 1, 'inner')).toBe('VR1022-S1-INNER.fpl')
    expect(sortieRouteName('VR1022', 2, 'outer')).toBe('VR1022 S2 OUTER')
  })
})
