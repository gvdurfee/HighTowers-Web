import { describe, it, expect } from 'vitest'
import { G1000Service } from '../src/services/g1000.ts'

describe('G1000Service.generateSortieFlightPlan', () => {
  const dep = {
    identifier: 'KABQ',
    name: 'Albuquerque Intl Sunport',
    latitude: 35.040222,
    longitude: -106.609194,
  }

  const fragmentWaypoints = [
    { g1000Name: 'XM114C', latitude: 34.1, longitude: -106.2 },
    { g1000Name: 'XM114D', latitude: 34.2, longitude: -106.3 },
    { g1000Name: 'XM114M1', latitude: 34.5, longitude: -106.6 },
  ]

  it('dedupes waypoint-table and allows non-consecutive reuse in route', () => {
    const xml = G1000Service.generateSortieFlightPlan({
      routeLabel: 'VR114',
      sortieNumber: 1,
      departureAirport: dep,
      destinationAirport: dep,
      fragmentWaypoints,
      routeSequence: ['XM114C', 'XM114D', 'XM114M1', 'XM114D', 'XM114C'],
    })

    expect(xml).toContain('<waypoint-table>')
    expect(xml.match(/<identifier>XM114C<\/identifier>/g)?.length).toBe(1)
    expect(xml.match(/<identifier>XM114D<\/identifier>/g)?.length).toBe(1)
    expect(xml.match(/<identifier>XM114M1<\/identifier>/g)?.length).toBe(1)

    const routePoints = [...xml.matchAll(/<route-point>[\s\S]*?<\/route-point>/g)].map((m) => m[0])
    const ids = routePoints.map((block) => {
      const m = block.match(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/)
      return m?.[1]
    })
    expect(ids[0]).toBe('KABQ')
    expect(ids[ids.length - 1]).toBe('KABQ')
    expect(ids.filter((id) => id === 'XM114C').length).toBe(2)
    expect(ids.filter((id) => id === 'XM114M1').length).toBe(1)
  })

  it('round-robin uses one airport row in waypoint-table', () => {
    const xml = G1000Service.generateSortieFlightPlan({
      routeLabel: 'VR114',
      sortieNumber: 2,
      departureAirport: dep,
      destinationAirport: dep,
      fragmentWaypoints,
      routeSequence: ['XM114C', 'XM114D', 'XM114M1'],
    })
    expect(xml.match(/<identifier>KABQ<\/identifier>/g)?.length).toBe(1)
  })
})
