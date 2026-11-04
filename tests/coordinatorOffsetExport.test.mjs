import { describe, expect, it } from 'vitest'
import { buildOffsetRoutes, reverseOffsetTrack } from '../shared/survey-planning/offsetRoutePlan.js'
import { buildSortieOffsetFpl } from '../src/services/offsetRouteFpl.ts'
import {
  buildCoordinatorCrewOffsetFile,
  coordinatorMissingSideNotice,
  coordinatorOffsetDownloadBlock,
  crewOffsetAirports,
} from '../src/services/coordinatorOffsetExport.ts'

const IR112 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'EH', 'I', 'J', 'EK', 'L', 'XM', 'TN', 'AA', 'AB', 'AC', 'AD', 'XM']
const IR112_INNER = [
  'A001I', 'B002I', 'C003I', 'D004I', 'E005I', 'F006I', 'G007I', 'EH008I', 'I009I', 'J010I',
  'EK011I', 'L012I', 'XM013I', 'TN014I', 'AA015I', 'AB016I', 'AC017I', 'AD018I', 'XM019I',
]
const IR112_OUTER = [
  'A001O', 'B002O', 'C003O', 'D004O', 'E005O', 'F006O', 'G007O', 'EH008O', 'I009O', 'J010O',
  'EK011O', 'L012O', 'XM013O', 'TN014O', 'AA015O', 'AB016O', 'AC017O', 'AD018O', 'XM019O',
]

const departure = { identifier: 'KABQ', name: 'Albuquerque Intl Sunport', latitude: 35.04, longitude: -106.6 }
const destination = { identifier: 'KINW', name: 'Winslow-Lindbergh Rgnl', latitude: 35.02, longitude: -110.72 }

function ir112Points() {
  return IR112.map((point, index) => ({
    ptIdent: point,
    originalName: `IR112-${point}`,
    lat: 35 + index * 0.05,
    lon: -106,
  }))
}

function userIds(xml) {
  return [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)]
    .map((match) => match[1])
    .filter((id) => id !== 'KABQ' && id !== 'KINW')
}

describe('coordinator offset exports', () => {
  const points = ir112Points()
  const widths = points.slice(0, -1).map(() => ({ leftNm: 5, rightNm: 5 }))

  it('writes the same IR112 files and names as the single-crew download', () => {
    const plan = buildOffsetRoutes(points, widths)
    const direct1 = buildSortieOffsetFpl({
      routeLabel: 'IR112',
      sortieNumber: 1,
      side: 'inner',
      waypoints: plan.inner.waypoints.map((wp) => ({ g1000Name: wp.g1000Name, lat: wp.lat, lon: wp.lon })),
      departure,
      destination,
    })
    const direct2 = buildSortieOffsetFpl({
      routeLabel: 'IR112',
      sortieNumber: 2,
      side: 'outer',
      waypoints: reverseOffsetTrack(plan.outer.waypoints).map((wp) => ({
        g1000Name: wp.g1000Name,
        lat: wp.lat,
        lon: wp.lon,
      })),
      departure: destination,
      destination: departure,
    })
    const sortie1 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'IR112',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 1,
      departure,
      destination,
    })
    const sortie2 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'IR112',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 2,
      departure,
      destination,
    })
    const withoutCreated = (xml) => xml.replace(/<created>[^<]*<\/created>/, '')
    expect(withoutCreated(sortie1.xml)).toBe(withoutCreated(direct1.xml))
    expect(sortie1.filename).toBe('IR112-S1-INNER.fpl')
    expect(withoutCreated(sortie2.xml)).toBe(withoutCreated(direct2.xml))
    expect(sortie2.filename).toBe('IR112-S2-OUTER.fpl')
    expect(userIds(sortie1.xml)).toEqual(IR112_INNER)
    expect(userIds(sortie2.xml)).toEqual([...IR112_OUTER].reverse())
    expect(sortie1.xml.indexOf('<waypoint-identifier>KABQ</waypoint-identifier>')).toBeLessThan(
      sortie1.xml.indexOf('<waypoint-identifier>KINW</waypoint-identifier>')
    )
    expect(sortie2.xml.indexOf('<waypoint-identifier>KINW</waypoint-identifier>')).toBeLessThan(
      sortie2.xml.indexOf('<waypoint-identifier>KABQ</waypoint-identifier>')
    )
  })

  it('disables downloads when a width or the Sortie 1 side is missing', () => {
    expect(
      coordinatorOffsetDownloadBlock({
        rows: [{ left: '5', right: '' }],
        sortie1Side: 'inner',
        nameError: null,
      })
    ).toBe('Enter a left and right width for every leg before downloading.')
    expect(
      coordinatorOffsetDownloadBlock({
        rows: [],
        sortie1Side: 'outer',
        nameError: null,
      })
    ).toBe('Enter a left and right width for every leg before downloading.')
    expect(
      coordinatorOffsetDownloadBlock({
        rows: [{ left: '5', right: '5' }],
        sortie1Side: null,
        nameError: null,
      })
    ).toBe(coordinatorMissingSideNotice())
    expect(
      coordinatorOffsetDownloadBlock({
        rows: widths.map(() => ({ left: '5', right: '5' })),
        sortie1Side: 'inner',
        nameError: null,
      })
    ).toBeNull()
  })

  it('uses the crew airport as departure and the plan other end as destination', () => {
    expect(
      crewOffsetAirports({
        crewDeparture: null,
        planDeparture: departure,
        planDestination: destination,
      })
    ).toEqual({ departure, destination })
    expect(
      crewOffsetAirports({
        crewDeparture: destination,
        planDeparture: departure,
        planDestination: destination,
      }).departure.identifier
    ).toBe('KINW')
    expect(
      crewOffsetAirports({
        crewDeparture: null,
        planDeparture: null,
        planDestination: destination,
      })
    ).toEqual({ departure: null, destination: null })
  })
})
