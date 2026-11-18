import { describe, expect, it } from 'vitest'
import { laneTurnSentence } from '../src/services/teamPlanRecord.ts'
import { sortieNumberAfterCrewChange } from '../src/services/serpentineDisplay.ts'
import { nasrCycleDate, newestCachedCycle } from '../server/nasrCycle.js'

describe('Map View turn sentence', () => {
  it('shows the sortie max turn as a whole degree', () => {
    expect(laneTurnSentence(139.5)).toContain('140°')
    expect(laneTurnSentence(140)).toContain('about 140°')
  })

  it('drops the number when no real turn is available', () => {
    for (const missing of [undefined, null, 0, Number.NaN]) {
      const sentence = laneTurnSentence(missing)
      expect(sentence).not.toContain('155')
      expect(sentence).not.toMatch(/\d+°/)
      expect(sentence).toContain('Expect turns at lane entry and exit')
    }
  })
})

describe('Map View crew change', () => {
  it('selects Sortie 1 when the crew changes and keeps the sortie for the same crew', () => {
    expect(sortieNumberAfterCrewChange('team1', 'team2', 2)).toBe(1)
    expect(sortieNumberAfterCrewChange('team1', 'team1', 2)).toBe(2)
  })
})

describe('NASR cycle date', () => {
  it('steps 28 days from the 2026-10-29 anchor', () => {
    expect(nasrCycleDate('2026-11-18')).toBe('2026-10-29')
    expect(nasrCycleDate('2026-11-26')).toBe('2026-11-26')
    expect(nasrCycleDate('2026-12-23')).toBe('2026-11-26')
  })

  it('uses the newest cached cycle on or before today', () => {
    expect(newestCachedCycle(['2026-10-01', '2026-10-29', '2026-11-26'], '2026-11-18')).toBe('2026-10-29')
    expect(newestCachedCycle(['2026-11-26'], '2026-11-18')).toBe(null)
  })
})
