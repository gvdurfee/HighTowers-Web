import { describe, it, expect } from 'vitest'
import { detailLabelCenterPx } from '../src/components/TowerLeaderMarker.tsx'

describe('detailLabelCenterPx', () => {
  it('places the label at the waypoint end when the leader is long enough', () => {
    const widthPx = 120
    // nearTower = 23, nearWaypoint = 107
    expect(detailLabelCenterPx(widthPx)).toBe(107)
  })

  it('does not use Math.min-style placement (that would hug the tower)', () => {
    const widthPx = 120
    const nearTower = 23
    const nearWaypoint = 107
    expect(Math.min(nearTower, nearWaypoint)).toBe(nearTower)
    expect(detailLabelCenterPx(widthPx)).toBe(nearWaypoint)
    expect(detailLabelCenterPx(widthPx)).not.toBe(Math.min(nearTower, nearWaypoint))
  })

  it('falls back toward the tower when the leader is too short for the waypoint slot', () => {
    const widthPx = 30
    expect(detailLabelCenterPx(widthPx)).toBe(23)
  })
})
