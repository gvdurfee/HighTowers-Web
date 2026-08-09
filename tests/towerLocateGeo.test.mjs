import { describe, it, expect } from 'vitest'
import {
  buildEvalRow,
  haversineMeters,
  pixelOffsetToLatLon,
  squareBboxNm,
} from '../shared/tower-locate/geo.js'

describe('tower-locate geo', () => {
  it('computes haversine distance in meters', () => {
    // ~111.32 km per degree lat
    const d = haversineMeters(35, -106, 35.001, -106)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(120)
  })

  it('maps tile center pixel to prior lat/lon', () => {
    const centerLat = 34.866667
    const centerLon = -106.591667
    const halfSideNm = 0.25
    const width = 640
    const height = 640
    const { lat, lon } = pixelOffsetToLatLon({
      centerLat,
      centerLon,
      halfSideNm,
      pixelX: width / 2 - 0.5,
      pixelY: height / 2 - 0.5,
      widthPx: width,
      heightPx: height,
    })
    expect(Math.abs(lat - centerLat)).toBeLessThan(0.00005)
    expect(Math.abs(lon - centerLon)).toBeLessThan(0.00005)
  })

  it('builds eval row with error meters', () => {
    const row = buildEvalRow({
      id: 't1',
      timestamp: '2026-08-09T00:00:00.000Z',
      priorLat: 35,
      priorLon: -106,
      humanLat: 35,
      humanLon: -106,
      geminiLat: 35.001,
      geminiLon: -106,
      confidence: 80,
      model: 'gemini-2.0-flash',
      imagerySource: 'mapbox',
    })
    expect(row.errorMeters).toBeGreaterThan(100)
    expect(row.errorMeters).toBeLessThan(120)
    expect(row.errorNm).toBeGreaterThan(0.05)
  })

  it('squareBboxNm is symmetric about the center', () => {
    const b = squareBboxNm(35, -106, 0.25)
    expect(b.north - 35).toBeCloseTo(35 - b.south, 6)
    expect(b.east + 106).toBeCloseTo(-(b.west + 106), 5)
  })
})
