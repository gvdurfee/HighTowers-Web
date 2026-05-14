import { describe, it, expect } from 'vitest'
import { applyTowerToUserWaypointsCsv } from '../shared/content-pack-core/applyTowerToUserWaypointsCsv.js'
import { parseForeFlightUserWaypointsCsv } from '../shared/content-pack-core/foreflightUserWaypointsCsv.js'
import { primaryRouteNumberFromCsvDoc } from '../shared/content-pack-core/contentPackWaypoints.js'

const sampleCsv =
  'Waypoint name,Waypoint description,Latitude,Longitude,Elevation\n' +
  '112A,"",35.0000,-109.0000,""\n'

describe('applyTowerToUserWaypointsCsv', () => {
  it('refines within 30m and rounds to four decimals', () => {
    // Within ~23 m of CSV point, but 4-decimal rounding differs from 35.0000 / -109.0000.
    const tower = { lat: 35.00015, lon: -109.00015 }
    const r = applyTowerToUserWaypointsCsv({
      csvText: sampleCsv,
      tower,
      routeNumber: '112',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('updated')
    const doc = parseForeFlightUserWaypointsCsv(r.csvText)
    expect(doc.rows[0][2]).toBe('35.0002')
    expect(doc.rows[0][3]).toBe('-109.0001')
  })

  it('appends when far with route number', () => {
    const tower = { lat: 36, lon: -110 }
    const r = applyTowerToUserWaypointsCsv({
      csvText: sampleCsv,
      tower,
      routeNumber: '112',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcome).toBe('appended')
    const doc = parseForeFlightUserWaypointsCsv(r.csvText)
    expect(doc.rows.length).toBe(2)
    expect(r.newWaypointName).toMatch(/^112/)
  })

  it('fails append without route number', () => {
    const tower = { lat: 36, lon: -110 }
    const r = applyTowerToUserWaypointsCsv({
      csvText: sampleCsv,
      tower,
      routeNumber: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('no_route_number')
  })
})

describe('primaryRouteNumberFromCsvDoc', () => {
  it('returns the most common numeric prefix among MTR-style waypoint names', () => {
    const csv =
      'Waypoint name,Waypoint description,Latitude,Longitude,Elevation\n' +
      '112A,"",35.00,-109.00,""\n' +
      '112B,"",35.01,-109.01,""\n' +
      '112C,"",35.02,-109.02,""\n' +
      '073A,"",36.00,-110.00,""\n'
    const doc = parseForeFlightUserWaypointsCsv(csv)
    expect(primaryRouteNumberFromCsvDoc(doc)).toBe('112')
  })

  it('returns null when no rows look like MTR waypoints', () => {
    const csv =
      'Waypoint name,Waypoint description,Latitude,Longitude,Elevation\n' +
      'TOWER1,"",35.00,-109.00,""\n' +
      'PAD,"",35.01,-109.01,""\n'
    const doc = parseForeFlightUserWaypointsCsv(csv)
    expect(primaryRouteNumberFromCsvDoc(doc)).toBeNull()
  })
})
