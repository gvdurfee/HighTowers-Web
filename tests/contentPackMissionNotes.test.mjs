import { describe, it, expect } from 'vitest'
import {
  mergeContentPackApplyMissionNotes,
  mergeContentPackRefinementMissionNotes,
  stripContentPackParagraphs,
} from '../shared/content-pack-core/contentPackMissionNotes.js'

describe('mergeContentPackApplyMissionNotes', () => {
  it('appends one paragraph per non-empty outcome group', () => {
    const out = mergeContentPackApplyMissionNotes(undefined, {
      refined: [2, 5],
      unchanged: [1, 3, 4],
      appended: [],
    })
    expect(out).toMatch(/Tower 2 and Tower 5/)
    expect(out).toMatch(/Tower 1, Tower 3, and Tower 4/)
    expect(out).toMatch(/refined ForeFlight user waypoints/)
    expect(out).toMatch(/already match the ForeFlight content pack/)
    expect(out).not.toMatch(/added to the ForeFlight content pack as new user waypoints/)
  })

  it('writes only the appended paragraph when only appends happened', () => {
    const out = mergeContentPackApplyMissionNotes(undefined, {
      refined: [],
      unchanged: [],
      appended: [7],
    })
    expect(out).toMatch(/Tower 7/)
    expect(out).toMatch(/added to the ForeFlight content pack as new user waypoints/)
    expect(out).not.toMatch(/refined ForeFlight user waypoints/)
    expect(out).not.toMatch(/already match the ForeFlight content pack/)
  })

  it('preserves manually-typed notes and replaces older auto-paragraphs idempotently', () => {
    const userTyped = 'Crew note: deferred photo on Tower 4 due to glare; will reshoot in fall.'
    const first = mergeContentPackApplyMissionNotes(userTyped, {
      refined: [1],
      unchanged: [],
      appended: [],
    })
    expect(first.startsWith(userTyped)).toBe(true)
    expect(first).toMatch(/Tower 1/)

    // Re-run with a different outcome bucket; the previous paragraph should be replaced, user note preserved.
    const second = mergeContentPackApplyMissionNotes(first, {
      refined: [],
      unchanged: [1, 2, 3, 4, 5],
      appended: [],
    })
    expect(second.startsWith(userTyped)).toBe(true)
    expect(second).not.toMatch(/refined ForeFlight user waypoints/)
    expect(second).toMatch(/already match the ForeFlight content pack/)
    expect(second).toMatch(/Tower 1, Tower 2, Tower 3, Tower 4, and Tower 5/)
  })

  it('strips any auto-paragraphs when all groups are empty', () => {
    const seeded = mergeContentPackApplyMissionNotes('Crew note: ok.', {
      refined: [1],
      unchanged: [],
      appended: [],
    })
    const cleared = mergeContentPackApplyMissionNotes(seeded, {
      refined: [],
      unchanged: [],
      appended: [],
    })
    expect(cleared).toBe('Crew note: ok.')
  })
})

describe('mergeContentPackRefinementMissionNotes (back-compat)', () => {
  it('matches the all-outcomes function for a refined-only group', () => {
    const a = mergeContentPackRefinementMissionNotes(undefined, [1, 2])
    const b = mergeContentPackApplyMissionNotes(undefined, {
      refined: [1, 2],
      unchanged: [],
      appended: [],
    })
    expect(a).toBe(b)
  })
})

describe('stripContentPackParagraphs', () => {
  it('removes all three auto-marker paragraphs in any order', () => {
    const composite = mergeContentPackApplyMissionNotes('User text.', {
      refined: [1],
      unchanged: [2],
      appended: [3],
    })
    expect(stripContentPackParagraphs(composite)).toBe('User text.')
  })
})
