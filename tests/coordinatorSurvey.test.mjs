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
import {
  planSurveyScenario,
  buildLegWidthSummaries,
  compareOneVsTwoTeamStaffing,
  compareTwoVsThreeTeamStaffing,
  planThreeTeamGeographicScenario,
} from '../shared/survey-planning/surveySortiePlanner.js'
import {
  buildUniformOffsetSegments,
  packSortiesForTeam,
  bestSortiePlan,
} from '../shared/survey-planning/surveySortiePacker.js'

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

const KABQ = { lat: 35.040194, lon: -106.609139 }

/** NASR MTR_PT coordinates for VR114 A→M1 (28-day cycle fixture). */
const VR114_FULL_WPS = [
  { ptIdent: 'A', lat: 34.64166666, lon: -102.9 },
  { ptIdent: 'B', lat: 35.7, lon: -102.96666666 },
  { ptIdent: 'C', lat: 35.58333333, lon: -103.63333333 },
  { ptIdent: 'D', lat: 35.53333333, lon: -103.94166666 },
  { ptIdent: 'E', lat: 35.05833333, lon: -104.04166666 },
  { ptIdent: 'F', lat: 34.825, lon: -103.74166666 },
  { ptIdent: 'M1', lat: 34.65, lon: -103.78333333 },
]

describe('surveySortiePacker', () => {
  it('splits at width boundaries (A→B vs B→M1)', () => {
    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114_FULL_WPS,
      widthTexts: VR114_WIDTH,
      teams: [],
      sortieBudgetNm: 500,
    })
    const segments = buildUniformOffsetSegments(VR114_FULL_WPS, legs, 'left')
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ fromPt: 'A', toPt: 'B', offsets: [3, 9, 15, 21] })
    expect(segments[1]).toMatchObject({ fromPt: 'B', toPt: 'M1', offsets: [3, 9] })
  })

  it('packs both offsets on a 10 NM corridor in one sortie', () => {
    const wps = [
      { ptIdent: 'A', lat: 35.0, lon: -103.0 },
      { ptIdent: 'B', lat: 35.05, lon: -103.05 },
      { ptIdent: 'C', lat: 35.1, lon: -103.1 },
    ]
    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '99',
      waypoints: wps,
      widthTexts: ['10 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE'],
      teams: [],
      sortieBudgetNm: 500,
    })
    const team = { label: 'Team 1', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const sorties = packSortiesForTeam(wps, legs, team, 500)
    expect(sorties).toHaveLength(1)
    expect(sorties[0].offsets).toEqual([3, 9])
    expect(sorties[0].totalNm).toBeLessThanOrEqual(500)
  })

  it('splits offset passes when four offsets on A→B exceed budget', () => {
    const wps = VR114_FULL_WPS.slice(0, 2)
    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: wps,
      widthTexts: VR114_WIDTH,
      teams: [],
      sortieBudgetNm: 500,
    })
    const team = { label: 'Team 1', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const plan = bestSortiePlan(wps, team, 0, 1, [3, 9, 15, 21])
    expect(plan.totalNm).toBeGreaterThan(500)

    const sorties = packSortiesForTeam(wps, legs, team, 500)
    expect(sorties.length).toBe(2)
    expect(sorties[0].offsets).toEqual([3, 9])
    expect(sorties[1].offsets).toEqual([15, 21])
    for (const s of sorties) {
      expect(s.totalNm).toBeLessThanOrEqual(500)
    }
  })
})

describe('planSurveyScenario', () => {
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

  it('reports entry closest to departure', () => {
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
    expect(result.status).toBe('planned')
    expect(result.teams[0].entryWaypoint).toBe('A')
    expect(result.teams[0].sortieCount).toBeGreaterThan(0)
  })

  it('packs VR114 left side from KABQ into three sorties under 500 NM', () => {
    const result = planSurveyScenario({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114_FULL_WPS,
      widthTexts: VR114_WIDTH,
      teams: [
        {
          label: 'Team 1',
          depLat: KABQ.lat,
          depLon: KABQ.lon,
          side: 'left',
        },
      ],
      sortieBudgetNm: 500,
    })
    expect(result.status).toBe('planned')
    expect(result.totalCenterlineNm).toBe(172.3)
    expect(result.teams[0].entryWaypoint).toBe('E')
    expect(result.teams[0].ferryInNm).toBe(126.2)
    expect(result.totalSorties).toBe(3)

    const sorties = result.teams[0].sorties
    expect(sorties.filter((s) => s.waypointFrom === 'A' && s.waypointTo === 'B')).toHaveLength(2)
    expect(sorties.filter((s) => s.waypointFrom === 'B' && s.waypointTo === 'M1')).toHaveLength(1)
    expect(sorties[2].offsets).toEqual([3, 9])

    for (const s of sorties) {
      expect(s.totalNm).toBeLessThanOrEqual(500)
      expect(s.ferryInNm + s.alongRouteNm + s.ferryOutNm).toBeCloseTo(s.totalNm, 1)
    }
  })

  it('packs VR114 opposite-side two-team scenario with wing totals', () => {
    const KROW = { lat: 33.2998, lon: -104.542 }
    const result = planSurveyScenario({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114_FULL_WPS,
      widthTexts: VR114_WIDTH,
      teams: [
        { label: 'Team 1', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' },
        { label: 'Team 2', depLat: KROW.lat, depLon: KROW.lon, side: 'right' },
      ],
      sortieBudgetNm: 500,
      assignmentModel: 'opposite-side',
    })
    expect(result.assignmentModel).toBe('opposite-side')
    expect(result.teams).toHaveLength(2)
    expect(result.teams[0].side).toBe('left')
    expect(result.teams[1].side).toBe('right')
    expect(result.teams[0].sortieCount).toBe(3)
    expect(result.teams[1].sortieCount).toBe(4)
    expect(result.totalSorties).toBe(7)
    expect(result.totalWingNm).toBeGreaterThan(2500)

    const rightSorties = result.teams[1].sorties
    expect(rightSorties.every((s) => s.waypointFrom === 'A' && s.waypointTo === 'M1')).toBe(true)
    expect(rightSorties.map((s) => s.offsets[0])).toEqual([3, 9, 15, 21])
    for (const s of rightSorties) {
      expect(s.totalNm).toBeLessThanOrEqual(500)
    }
  })

  it('compareOneVsTwoTeamStaffing contrasts VR114 KABQ both sides sequential vs KABQ+KROW opposite-side', () => {
    const KROW = { lat: 33.2998, lon: -104.542 }
    const team1 = { label: 'Team 1', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const team2 = { label: 'Team 2', depLat: KROW.lat, depLon: KROW.lon, side: 'right' }
    const compare = compareOneVsTwoTeamStaffing(
      {
        routeType: 'VR',
        routeNumber: '114',
        waypoints: VR114_FULL_WPS,
        widthTexts: VR114_WIDTH,
        teams: [team1],
        sortieBudgetNm: 500,
      },
      team2,
      { team1DepLabel: 'KABQ', team2DepLabel: 'KROW' }
    )
    expect(compare.oneTeam.teams).toHaveLength(2)
    expect(compare.oneTeam.assignmentModel).toBe('single-sequential')
    expect(compare.twoTeams.teams).toHaveLength(2)
    expect(compare.oneTeam.totalSorties).toBe(7)
    expect(compare.twoTeams.totalSorties).toBe(7)
    expect(compare.deltaSorties).toBe(0)
    expect(compare.oneTeam.teams[0].sortieCount).toBe(3)
    expect(compare.oneTeam.teams[1].sortieCount).toBe(4)
    expect(compare.oneTeamOverBudgetSorties).toBe(0)
    expect(compare.twoTeamsOverBudgetSorties).toBe(0)
    expect(compare.team1DepLabel).toBe('KABQ')
    expect(compare.team2DepLabel).toBe('KROW')
  })

  it('planThreeTeamGeographicScenario optimizes VR114 splits for three departures', () => {
    const KROW = { lat: 33.2998, lon: -104.542 }
    const KCVN = { lat: 34.425194, lon: -103.079278 }
    const teams = [
      { label: 'KABQ', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' },
      { label: 'KCVN', depLat: KCVN.lat, depLon: KCVN.lon, side: 'left' },
      { label: 'KROW', depLat: KROW.lat, depLon: KROW.lon, side: 'left' },
    ]
    const result = planThreeTeamGeographicScenario(
      {
        routeType: 'VR',
        routeNumber: '114',
        waypoints: VR114_FULL_WPS,
        widthTexts: VR114_WIDTH,
        teams,
        sortieBudgetNm: 500,
      },
      teams
    )
    expect(result.status).toBe('planned')
    expect(result.assignmentModel).toBe('geographic')
    expect(result.teams).toHaveLength(3)
    expect(result.geographicSplits).toHaveLength(2)
    expect(result.segmentAssignments).toHaveLength(3)

    const covered = result.segmentAssignments
      .map((a) => `${a.waypointFrom}→${a.waypointTo}`)
      .join('|')
    expect(covered).toMatch(/A→/)
    expect(covered).toMatch(/M1/)

    const totalAssignedSorties = result.segmentAssignments.reduce(
      (sum, a) => sum + a.sortieCount,
      0
    )
    expect(result.totalSorties).toBe(totalAssignedSorties)
    expect(result.totalSorties).toBeGreaterThan(0)
    expect(result.totalWingNm).toBeGreaterThan(0)

    for (const team of result.teams) {
      expect(team.side).toBe('both')
      expect(team.sortieCount).toBeGreaterThan(0)
      for (const s of team.sorties) {
        expect(s.totalNm).toBeLessThanOrEqual(500 + 1e-6)
      }
    }
  })

  it('compareTwoVsThreeTeamStaffing contrasts VR114 opposite-side vs geographic split', () => {
    const KROW = { lat: 33.2998, lon: -104.542 }
    const KCVN = { lat: 34.425194, lon: -103.079278 }
    const team1 = { label: 'KABQ', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const team2 = { label: 'KROW', depLat: KROW.lat, depLon: KROW.lon, side: 'right' }
    const team3 = { label: 'KCVN', depLat: KCVN.lat, depLon: KCVN.lon, side: 'left' }
    const compare = compareTwoVsThreeTeamStaffing(
      {
        routeType: 'VR',
        routeNumber: '114',
        waypoints: VR114_FULL_WPS,
        widthTexts: VR114_WIDTH,
        teams: [team1],
        sortieBudgetNm: 500,
      },
      team2,
      team3
    )
    expect(compare.twoTeams.totalSorties).toBe(7)
    expect(compare.threeTeams.totalSorties).toBe(6)
    expect(compare.deltaSorties).toBe(-1)
    expect(compare.threeTeams.assignmentModel).toBe('geographic')
  })
})
