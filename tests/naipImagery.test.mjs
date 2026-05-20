import { describe, expect, it } from 'vitest'
import { computeSquareBbox } from '../server/imageryBbox.js'
import { lonLatToWebMercator, wgs84BboxToWebMercator } from '../server/naipImagery.js'

describe('NAIP imagery helpers', () => {
  it('computeSquareBbox is symmetric around center', () => {
    const bbox = computeSquareBbox(35.0, -105.0, 0.5)
    expect(bbox.west).toBeLessThan(-105)
    expect(bbox.east).toBeGreaterThan(-105)
    expect(bbox.south).toBeLessThan(35)
    expect(bbox.north).toBeGreaterThan(35)
  })

  it('wgs84BboxToWebMercator expands bbox in Web Mercator', () => {
    const bbox = computeSquareBbox(35.0, -105.0, 0.5)
    const m = wgs84BboxToWebMercator(bbox)
    expect(m.xmax).toBeGreaterThan(m.xmin)
    expect(m.ymax).toBeGreaterThan(m.ymin)
    const center = lonLatToWebMercator(-105, 35)
    expect(center.x).toBeGreaterThan(m.xmin)
    expect(center.x).toBeLessThan(m.xmax)
    expect(center.y).toBeGreaterThan(m.ymin)
    expect(center.y).toBeLessThan(m.ymax)
  })
})
