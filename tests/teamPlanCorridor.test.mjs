/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import {
  FAA_WIDTH_FALLBACK_NOTE,
  savedWidthsForPoints,
  spanWidthsFromRows,
  teamPlanOwnsCorridor,
  teamPlanSpanWidths,
  teamPlanTrackSpacing,
} from '../src/services/teamPlanCorridor.ts'
import { draftTeamPlan } from '../src/services/teamPlanRecord.ts'
import { setTeamDispatchUnsaved, teamDispatchHasUnsaved } from '../src/services/teamDispatchUnsaved.ts'

describe('team plan corridor on Map View', () => {
  it('lets the saved team plan own the corridor and leaves single-aircrew editable', () => {
    expect(teamPlanOwnsCorridor(null)).toBe(false)
    expect(teamPlanOwnsCorridor(undefined)).toBe(false)
    expect(teamPlanOwnsCorridor({ teams: [] })).toBe(false)
    expect(teamPlanOwnsCorridor({ teams: [{ id: 'team1' }], firstOffsetNm: 3, stepNm: 6 })).toBe(true)
    expect(teamPlanTrackSpacing({ teams: [{ id: 'team1' }], firstOffsetNm: 4, stepNm: 8 })).toEqual({
      firstOffsetNm: 4,
      stepNm: 8,
    })
    expect(teamPlanTrackSpacing(null)).toBeNull()
  })

  it('saves span widths and falls back when an older plan has none', () => {
    const rows = [
      { fromPt: 'A', toPt: 'B', leftNm: '4', rightNm: '6' },
      { fromPt: 'B', toPt: 'C', leftNm: '5', rightNm: '5' },
    ]
    const stored = spanWidthsFromRows(rows)
    expect(stored).toEqual([
      { fromPt: 'A', toPt: 'B', leftNm: 4, rightNm: 6 },
      { fromPt: 'B', toPt: 'C', leftNm: 5, rightNm: 5 },
    ])
    expect(spanWidthsFromRows([{ fromPt: 'A', toPt: 'B', leftNm: '0.5', rightNm: '4' }])).toBeNull()
    const plan = draftTeamPlan({
      flightPlanId: 'route',
      savedAt: '2026-11-14T00:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: null }],
      sides: { team1: 'inner' },
      segments: {},
      spanWidths: stored,
    })
    expect(plan.spanWidths).toEqual(stored)
    expect(teamPlanSpanWidths(plan)).toEqual(stored)
    const points = [{ ptIdent: 'A' }, { ptIdent: 'B' }, { ptIdent: 'C' }]
    expect(savedWidthsForPoints(points, stored)).toEqual([
      { leftNm: 4, rightNm: 6 },
      { leftNm: 5, rightNm: 5 },
    ])
    const older = { teams: [{ id: 'team1' }] }
    expect(teamPlanSpanWidths(older)).toBeNull()
    expect(savedWidthsForPoints(points, [])).toBeNull()
    const route = ['A', 'B', 'C', 'D', 'M1'].map((ptIdent) => ({ ptIdent }))
    expect(
      savedWidthsForPoints(route, [
        { fromPt: 'A', toPt: 'B', leftNm: 20, rightNm: 20 },
        { fromPt: 'B', toPt: 'M1', leftNm: 10, rightNm: 20 },
      ])
    ).toEqual([
      { leftNm: 20, rightNm: 20 },
      { leftNm: 10, rightNm: 20 },
      { leftNm: 10, rightNm: 20 },
      { leftNm: 10, rightNm: 20 },
    ])
    expect(
      savedWidthsForPoints(route, [{ fromPt: 'A', toPt: 'B', leftNm: 20, rightNm: 20 }])
    ).toBeNull()
    expect(FAA_WIDTH_FALLBACK_NOTE).toBe('Widths from FAA text; save in Team Dispatch to lock them.')
  })

  it('stores an unsaved Team Dispatch flag the map can read', () => {
    setTeamDispatchUnsaved('plan-a', true)
    expect(teamDispatchHasUnsaved('plan-a')).toBe(true)
    setTeamDispatchUnsaved('plan-a', false)
    expect(teamDispatchHasUnsaved('plan-a')).toBe(false)
  })
})
