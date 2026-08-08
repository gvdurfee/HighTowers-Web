import { describe, it, expect } from 'vitest'
import { findRouteWaypoint } from '../src/utils/mtrWaypointLookup.ts'

const sample = [
  {
    originalName: 'SR213-A',
    g1000Name: 'A213',
    latitude: 34.68,
    longitude: -105.77,
    ptIdent: 'A',
  },
  {
    originalName: 'SR213-G',
    g1000Name: 'G213',
    latitude: 34.86,
    longitude: -106.59,
    ptIdent: 'G',
  },
  {
    originalName: 'SR214-H',
    g1000Name: 'H214',
    latitude: 34.7,
    longitude: -106.57,
    ptIdent: 'H',
  },
]

describe('findRouteWaypoint', () => {
  it('matches by PT_IDENT first', () => {
    const hit = findRouteWaypoint(sample, 'G')
    expect(hit?.originalName).toBe('SR213-G')
  })

  it('matches compact blended point letters', () => {
    const hit = findRouteWaypoint(sample, 'H')
    expect(hit?.originalName).toBe('SR214-H')
    expect(hit?.g1000Name).toBe('H214')
  })

  it('does not let letter A match a longer G1000 prefix incorrectly when PT_IDENT exists', () => {
    const withAm = [
      ...sample,
      {
        originalName: 'IR109-AM',
        g1000Name: 'AM109',
        latitude: 1,
        longitude: 2,
        ptIdent: 'AM',
      },
      {
        originalName: 'IR109-A',
        g1000Name: 'A109',
        latitude: 3,
        longitude: 4,
        ptIdent: 'A',
      },
    ]
    expect(findRouteWaypoint(withAm, 'A')?.ptIdent).toBe('A')
    expect(findRouteWaypoint(withAm, 'AM')?.ptIdent).toBe('AM')
  })

  it('returns undefined when the point is missing', () => {
    expect(findRouteWaypoint(sample, 'Z')).toBeUndefined()
  })
})
