import { describe, it, expect } from 'vitest'
import {
  buildRouteSurveyTowerNotes,
  routeSurveyAglField,
  routeSurveyMslField,
} from '../src/utils/routeSurveyTowerRow.ts'

describe('routeSurveyTowerRow', () => {
  const loc = {
    id: 'loc1',
    latitude: 34.481,
    longitude: -104.8622,
    elevation: 5561,
    distanceFromWaypoint: 23.9,
    bearingFromWaypoint: 59,
    nearestWaypointId: 'wp-b',
    towerNotVisibleOnMap: true,
  }

  const wps = [
    {
      id: 'wp-b',
      flightPlanId: 'fp1',
      originalName: 'SR213-B',
      g1000Name: 'B',
      latitude: 34.5,
      longitude: -104.9,
      routeType: 'SR',
      sequence: 1,
    },
  ]

  it('shows estimated heights with See Notes qualifier in height fields', () => {
    expect(routeSurveyAglField(loc, 176)).toBe('176 ft. - See Notes')
    expect(routeSurveyMslField(loc)).toBe('5561 ft. - See Notes')
  })

  it('keeps notes short without repeating AGL/MSL when tower not visible on map', () => {
    const notes = buildRouteSurveyTowerNotes(loc, wps, null)
    expect(notes).toBe(
      'Tower not found on Map, Heights, Distance and bearing estimated. 23.9 nm, 59° True from point B'
    )
    expect(notes).not.toContain('AGL')
    expect(notes).not.toContain('MSL')
  })

  it('merges saved manual notes for tower-not-visible rows', () => {
    const notes = buildRouteSurveyTowerNotes(loc, wps, 'Painted white; strobe out')
    expect(notes).toContain('Tower not found on Map')
    expect(notes).toContain('23.9 nm, 59° True from point B')
    expect(notes).toContain('Painted white; strobe out')
  })

  it('uses See Notes qualifier for noImageGps height fields', () => {
    const noGpsLoc = { ...loc, towerNotVisibleOnMap: undefined, noImageGps: true }
    expect(routeSurveyAglField(noGpsLoc, 88)).toBe('88 ft. - See Notes')
    expect(routeSurveyMslField(noGpsLoc)).toBe('5561 ft. - See Notes')
    const notes = buildRouteSurveyTowerNotes(noGpsLoc, wps, null)
    expect(notes).toBe('No Image GPS. 23.9 nm, 59° True from point B')
  })

  it('merges saved manual notes for noImageGps rows', () => {
    const noGpsLoc = { ...loc, towerNotVisibleOnMap: undefined, noImageGps: true }
    const notes = buildRouteSurveyTowerNotes(noGpsLoc, wps, 'Crew remark')
    expect(notes).toContain('No Image GPS.')
    expect(notes).toContain('Crew remark')
  })
})
