import { describe, it, expect } from 'vitest'
import {
  dmsFieldSignature,
  formatMinutesFromMap,
  fromDms,
  shouldSkipDmsToMapSync,
  toDms,
} from '../src/utils/surveyMapCoordinates.ts'

describe('surveyMapCoordinates', () => {
  it('MM.mm display round-trip can move a point by several meters', () => {
    // 7.405′ rounds to 7.41′ → ~9 m of latitude error if written back to the map.
    const lat = 35 + 7.405 / 60
    const dLat = toDms(lat, true)
    const snappedLat = fromDms(dLat.deg, Number(formatMinutesFromMap(dLat.min)), dLat.hem)
    const dLatM = Math.abs(lat - snappedLat) * 111_320
    expect(dLatM).toBeGreaterThan(5)
    expect(dLatM).toBeLessThan(15)
  })

  it('skips DMS→map sync when fields still match the last map→form sync', () => {
    const sig = dmsFieldSignature('35', '07.41', 'N', '106', '39.02', 'W')
    expect(shouldSkipDmsToMapSync(sig, sig)).toBe(true)
    expect(shouldSkipDmsToMapSync(sig, dmsFieldSignature('35', '07.42', 'N', '106', '39.02', 'W'))).toBe(
      false
    )
    expect(shouldSkipDmsToMapSync(null, sig)).toBe(false)
  })
})
