import { describe, it, expect } from 'vitest'
import {
  defaultSpanTrackPlanFromWidthTexts,
  findSpanTrackEntryForLeg,
  parseOffsetsListInput,
  validateSpanTrackPlan,
} from '../shared/survey-planning/corridorTrackPlan.js'
import { buildLegWidthSummaries, planSurveyScenario } from '../shared/survey-planning/surveySortiePlanner.js'

const VR114_WIDTH = [
  '20 NM EITHER SIDE OF CENTERLINE FROM A TO B;',
  '10 NM LEFT AND 20 NM RIGHT OF CENTERLINE FROM B TO M1.',
]

describe('corridorTrackPlan', () => {
  it('builds default span rows from NASR width text', () => {
    const plan = defaultSpanTrackPlanFromWidthTexts(VR114_WIDTH)
    expect(plan).toHaveLength(2)
    expect(plan[0].leftOffsets).toEqual([3, 9, 15, 21])
    expect(plan[1].leftOffsets).toEqual([3, 9])
    expect(plan[1].rightOffsets).toEqual([3, 9, 15, 21])
  })

  it('finds B→M1 span for intermediate leg B→C', () => {
    const plan = defaultSpanTrackPlanFromWidthTexts(VR114_WIDTH)
    const entry = findSpanTrackEntryForLeg(plan, 'B', 'C', ['A', 'B', 'C', 'D', 'E', 'F', 'M1'])
    expect(entry?.fromPt).toBe('B')
    expect(entry?.toPt).toBe('M1')
  })

  it('rejects non-increasing offsets', () => {
    expect(() => parseOffsetsListInput('9, 3')).toThrow(/increase/)
  })

  it('applies custom span track plan to leg summaries', () => {
    const wps = ['A', 'B', 'C', 'M1'].map((ptIdent, i) => ({
      ptIdent,
      lat: 35 + i * 0.1,
      lon: -103 - i * 0.1,
    }))
    const spanTrackPlan = defaultSpanTrackPlanFromWidthTexts(VR114_WIDTH)
    spanTrackPlan[0].leftOffsets = [5, 11]
    spanTrackPlan[0].rightOffsets = [5, 11]

    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: wps,
      widthTexts: VR114_WIDTH,
      teams: [],
      spanTrackPlan,
    })
    const ab = legs.find((l) => l.fromPt === 'A' && l.toPt === 'B')
    expect(ab?.leftOffsets).toEqual([5, 11])
    expect(ab?.rightOffsets).toEqual([5, 11])
  })

  it('reduces sortie count when coordinator uses fewer offsets on wide span', () => {
    const wps = [
      { ptIdent: 'A', lat: 35.375, lon: -103.28333333 },
      { ptIdent: 'B', lat: 35.6, lon: -103.33333333 },
      { ptIdent: 'M1', lat: 36.5, lon: -104.0 },
    ]
    const defaultPlan = defaultSpanTrackPlanFromWidthTexts(VR114_WIDTH)
    const customPlan = defaultSpanTrackPlanFromWidthTexts(VR114_WIDTH)
    customPlan[0].leftOffsets = [3, 9]
    customPlan[0].rightOffsets = [3, 9]

    const base = {
      routeType: 'VR',
      routeNumber: '114',
      waypoints: wps,
      widthTexts: VR114_WIDTH,
      teams: [
        {
          label: 'Team 1',
          depLat: 35.38,
          depLon: -103.29,
          side: 'left',
        },
      ],
      sortieBudgetNm: 500,
    }

    const defaultResult = planSurveyScenario({ ...base, spanTrackPlan: defaultPlan })
    const customResult = planSurveyScenario({ ...base, spanTrackPlan: customPlan })
    expect(customResult.totalSorties).toBeLessThanOrEqual(defaultResult.totalSorties ?? Infinity)
    expect(customResult.totalWingNm).toBeLessThan(defaultResult.totalWingNm ?? Infinity)
  })

  it('validateSpanTrackPlan catches empty offset lists', () => {
    const err = validateSpanTrackPlan([
      {
        fromPt: 'A',
        toPt: 'B',
        leftNm: 20,
        rightNm: 20,
        leftOffsets: [],
        rightOffsets: [3, 9],
      },
    ])
    expect(err).toMatch(/Inner offsets/)
  })
})
