import { describe, expect, it } from 'vitest'
import { serpentineFromTracks } from '../src/services/crewSerpentineOverlay.ts'
import {
  buildSerpentineDisplay,
  markerPlacementAway,
  trackAwayBearing,
  travelHeading,
} from '../src/services/serpentineDisplay.ts'

function point(lat, lon, name) {
  return { lat, lon, ptIdent: name, g1000Name: name }
}

function near(actual, expected) {
  const delta = Math.abs((((actual - expected) % 360) + 540) % 360 - 180)
  expect(delta).toBeLessThan(5)
}

const north = [
  { lat: 35, lon: -106 },
  { lat: 35.2, lon: -106 },
  { lat: 35.4, lon: -106 },
]

const corner = [
  { lat: 35, lon: -106 },
  { lat: 35.2, lon: -106 },
  { lat: 35.2, lon: -105.8 },
]

const reversal = [
  { lat: 35, lon: -106 },
  { lat: 35.2, lon: -106 },
  { lat: 35, lon: -106 },
]

describe('offset marker displacement', () => {
  it('moves a straight track away from the centerline, inner west and outer east', () => {
    near(trackAwayBearing(north, 1, 'left'), 270)
    near(trackAwayBearing(north, 1, 'right'), 90)
    const inner = markerPlacementAway(trackAwayBearing(north, 1, 'left'))
    const outer = markerPlacementAway(trackAwayBearing(north, 1, 'right'))
    expect(inner.offset[0]).toBeLessThan(0)
    expect(inner.anchor).toBe('right')
    expect(outer.offset[0]).toBeGreaterThan(0)
    expect(outer.anchor).toBe('left')
  })

  it('uses the corner bisector so the inner side stays northwest and the outer side southeast', () => {
    near(travelHeading(corner, 1), 45)
    near(trackAwayBearing(corner, 1, 'left'), 315)
    near(trackAwayBearing(corner, 1, 'right'), 135)
    const inner = markerPlacementAway(trackAwayBearing(corner, 1, 'left'))
    const outer = markerPlacementAway(trackAwayBearing(corner, 1, 'right'))
    expect(inner.offset[0]).toBeLessThan(0)
    expect(inner.offset[1]).toBeLessThan(0)
    expect(outer.offset[0]).toBeGreaterThan(0)
    expect(outer.offset[1]).toBeGreaterThan(0)
  })

  it('keeps the incoming heading when a corner reverses 180 degrees', () => {
    near(travelHeading(reversal, 1), 0)
    near(trackAwayBearing(reversal, 1, 'left'), 270)
    near(trackAwayBearing(reversal, 1, 'right'), 90)
  })

  it('places the drawn inner labels further inner and the reversed outer labels further outer', () => {
    const centerline = north
    const inner = [
      point(35, -106.03, 'A1I'),
      point(35.2, -106.03, 'B1I'),
      point(35.4, -106.03, 'C1I'),
    ]
    const outer = [
      point(35, -105.97, 'A1O'),
      point(35.2, -105.97, 'B1O'),
      point(35.4, -105.97, 'C1O'),
    ]
    const overlay = serpentineFromTracks({
      id: 'team1',
      label: 'IR111',
      sortie1Side: 'inner',
      inner,
      outer,
      centerline,
    })
    expect(overlay.passes[0].surveySide).toBe('left')
    expect(overlay.passes[1].surveySide).toBe('left')
    const sortie1 = buildSerpentineDisplay([overlay.passes[0]]).labels[1]
    const sortie2 = buildSerpentineDisplay([overlay.passes[1]]).labels[1]
    expect(sortie1.lon).toBeCloseTo(-106.03)
    expect(sortie2.lon).toBeCloseTo(-105.97)
    near(sortie1.awayBearing, 270)
    near(sortie2.awayBearing, 90)
    expect(markerPlacementAway(sortie1.awayBearing).offset[0]).toBeLessThan(0)
    expect(markerPlacementAway(sortie2.awayBearing).offset[0]).toBeGreaterThan(0)
  })
})
