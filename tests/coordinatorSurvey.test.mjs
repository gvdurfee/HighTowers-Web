import { describe, it, expect } from 'vitest'
import {
  parseWidthTextLine,
  parseWidthTexts,
  halfWidthNmForLeg,
} from '../shared/survey-planning/mtrWidthParser.js'
import {
  parallelOffsetsForHalfWidth,
  estimateSortieNm,
} from '../shared/survey-planning/surveyGeometry.js'
import { planSurveyScenario, buildLegWidthSummaries } from '../shared/survey-planning/surveySortiePlanner.js'

const VR114_WIDTH = [
  '20 NM EITHER SIDE OF CENTERLINE FROM A TO B;',
  '10 NM LEFT AND 20 NM RIGHT OF CENTERLINE FROM B TO M1.',
]

describe('mtrWidthParser VR114', () => {
  it('parses symmetric A→B span', () => {
    const span = parseWidthTextLine(VR114_WIDTH[0])
    expect(span).toMatchObject({ fromPt: 'A', toPt: 'B', leftNm: 20, rightNm: 20 })
  })

  it('parses asymmetric B→M1 span', () => {
    const span = parseWidthTextLine(VR114_WIDTH[1])
    expect(span).toMatchObject({ fromPt: 'B', toPt: 'M1', leftNm: 10, rightNm: 20 })
  })

  it('resolves half-width per leg and side', () => {
    const spans = parseWidthTexts(VR114_WIDTH)
    const route = ['A', 'B', 'C', 'D', 'E', 'F', 'M1']
    expect(halfWidthNmForLeg(spans, 'A', 'B', 'left', route)).toBe(20)
    expect(halfWidthNmForLeg(spans, 'B', 'M1', 'left', route)).toBe(10)
    expect(halfWidthNmForLeg(spans, 'B', 'M1', 'right', route)).toBe(20)
    expect(halfWidthNmForLeg(spans, 'B', 'C', 'left', route)).toBe(10)
    expect(halfWidthNmForLeg(spans, 'F', 'M1', 'right', route)).toBe(20)
    expect(halfWidthNmForLeg(spans, 'B', 'C', 'left')).toBeNull()
  })
})

describe('parallelOffsetsForHalfWidth', () => {
  it('matches wing 3/9/15/21 pattern for 20 NM half-width', () => {
    expect(parallelOffsetsForHalfWidth(20)).toEqual([3, 9, 15, 21])
  })

  it('uses fewer offsets for 10 NM half-width', () => {
    expect(parallelOffsetsForHalfWidth(10)).toEqual([3, 9])
  })
})

describe('estimateSortieNm maneuver model', () => {
  it('counts one directed leg per offset on the assigned chain', () => {
    const nm = estimateSortieNm({
      ferryInNm: 80,
      chainNm: 40,
      offsetLegCount: 4,
      ferryOutNm: 85,
    })
    expect(nm).toBe(80 + 4 * 40 + 85)
  })
})

describe('planSurveyScenario scaffold', () => {
  const wps = [
    { ptIdent: 'A', lat: 35.375, lon: -103.28333333 },
    { ptIdent: 'B', lat: 35.6, lon: -103.33333333 },
    { ptIdent: 'M1', lat: 36.5, lon: -104.0 },
  ]

  it('returns leg summaries with different offset counts on B→M1 left vs right', () => {
    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: wps,
      widthTexts: VR114_WIDTH,
      teams: [],
      sortieBudgetNm: 500,
    })
    const bM1 = legs.find((l) => l.fromPt === 'B' && l.toPt === 'M1')
    expect(bM1).toBeDefined()
    expect(bM1.leftOffsets).toEqual([3, 9])
    expect(bM1.rightOffsets).toEqual([3, 9, 15, 21])
  })

  it('applies B→M1 width to intermediate legs in a full VR114 sequence', () => {
    const fullWps = ['A', 'B', 'C', 'D', 'E', 'F', 'M1'].map((ptIdent, i) => ({
      ptIdent,
      lat: 35 + i * 0.1,
      lon: -103 - i * 0.1,
    }))
    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: fullWps,
      widthTexts: VR114_WIDTH,
      teams: [],
      sortieBudgetNm: 500,
    })
    expect(legs.find((l) => l.fromPt === 'A' && l.toPt === 'B')?.leftNm).toBe(20)
    expect(legs.find((l) => l.fromPt === 'B' && l.toPt === 'C')?.leftNm).toBe(10)
    expect(legs.find((l) => l.fromPt === 'B' && l.toPt === 'C')?.rightNm).toBe(20)
    expect(legs.find((l) => l.fromPt === 'F' && l.toPt === 'M1')?.rightOffsets).toEqual([3, 9, 15, 21])
  })

  it('reports scaffold status and entry closest to departure', () => {
    const result = planSurveyScenario({
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
    })
    expect(result.status).toBe('scaffold')
    expect(result.totalSorties).toBeNull()
    expect(result.teams[0].entryWaypoint).toBe('A')
    expect(result.teams[0].sortieCount).toBeNull()
  })
})
