import { describe, it, expect } from 'vitest'
import {
  sliceFragmentWaypoints,
  buildSerpentineRouteSequence,
  buildSortieFplExportInput,
  formatSortieFplFilename,
} from '../shared/survey-planning/surveySortieFplRoute.js'

/** VR114-style B→M1 subset with letters C..M1 */
function vr114Fragment() {
  const letters = ['B', 'C', 'D', 'E', 'F', 'M1']
  return letters.map((ptIdent) => ({
    ptIdent,
    g1000Name: `XM114${ptIdent}`,
    lat: 34,
    lon: -106,
  }))
}

describe('sliceFragmentWaypoints', () => {
  const all = vr114Fragment()

  it('slices inclusive range', () => {
    const slice = sliceFragmentWaypoints(all, 1, 5)
    expect(slice.map((w) => w.ptIdent)).toEqual(['C', 'D', 'E', 'F', 'M1'])
  })

  it('rejects single-waypoint fragment', () => {
    expect(() => sliceFragmentWaypoints(all, 2, 2)).toThrow(/Invalid sortie waypoint range/)
  })
})

describe('buildSerpentineRouteSequence', () => {
  it('VR114 C→M1 with 4 offsets alternates direction without consecutive dupes at joins', () => {
    const all = vr114Fragment()
    const fragment = sliceFragmentWaypoints(all, 1, 5) // C..M1
    const { routeSequence } = buildSerpentineRouteSequence(fragment, 'C', [3, 9, 15, 21])

    expect(routeSequence[0]).toBe('XM114C')
    expect(routeSequence[routeSequence.length - 1]).toBe('XM114C')

    for (let i = 1; i < routeSequence.length; i++) {
      expect(routeSequence[i]).not.toBe(routeSequence[i - 1])
    }

    // Outbound then inbound: ends at M1 mid-first leg pair, revisits C after full serpentine
    expect(routeSequence.filter((id) => id === 'XM114M1').length).toBeGreaterThan(1)
    expect(routeSequence.filter((id) => id === 'XM114C').length).toBeGreaterThan(1)
  })

  it('2-offset sortie from M1 start', () => {
    const fragment = vr114Fragment().slice(1) // C..M1
    const { routeSequence } = buildSerpentineRouteSequence(fragment, 'M1', [3, 9])
    expect(routeSequence[0]).toBe('XM114M1')
    expect(routeSequence).toContain('XM114C')
    for (let i = 1; i < routeSequence.length; i++) {
      expect(routeSequence[i]).not.toBe(routeSequence[i - 1])
    }
  })

  it('rejects single-waypoint fragment', () => {
    const one = [{ ptIdent: 'C', g1000Name: 'XM114C', lat: 0, lon: 0 }]
    expect(() => buildSerpentineRouteSequence(one, 'C', [3])).toThrow(/at least two waypoints/)
  })

  it('rejects startAt in middle of fragment', () => {
    const fragment = vr114Fragment().slice(1, 4) // C,D,E
    expect(() => buildSerpentineRouteSequence(fragment, 'D', [3])).toThrow(/first or last/)
  })
})

describe('buildSortieFplExportInput', () => {
  it('packages export payload with team departure', () => {
    const fragment = vr114Fragment().slice(1)
    const input = buildSortieFplExportInput({
      sortie: {
        sortieNumber: 1,
        startIdx: 1,
        endIdx: 5,
        startAt: 'C',
        waypointFrom: 'C',
        waypointTo: 'M1',
        offsets: [3, 9, 15, 21],
      },
      fragmentWaypoints: fragment,
      teamDeparture: { identifier: 'KABQ', lat: 35.04, lon: -106.61 },
      routeLabel: 'VR114',
    })
    expect(input.routeLabel).toBe('VR114')
    expect(input.teamDeparture.identifier).toBe('KABQ')
    expect(input.routeSequence.length).toBeGreaterThan(0)
    expect(input.offsets).toEqual([3, 9, 15, 21])
  })
})

describe('formatSortieFplFilename', () => {
  it('formats predictable download name', () => {
    expect(
      formatSortieFplFilename({
        dep: 'KABQ',
        routeName: 'VR114',
        from: 'C',
        to: 'M1',
        sortieNumber: 1,
      })
    ).toBe('KABQ-VR114-C-M1-sortie1.fpl')
  })
})
