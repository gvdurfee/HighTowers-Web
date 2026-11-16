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
  planSingleTeamBothSides,
  buildStagedRefuelTeamNote,
} from '../shared/survey-planning/surveySortiePlanner.js'
import { defaultSpanTrackPlanFromWidthTexts } from '../shared/survey-planning/corridorTrackPlan.js'
import {
  buildUniformOffsetSegments,
  packSortiesForTeam,
  bestSortiePlan,
} from '../shared/survey-planning/surveySortiePacker.js'
import {
  compareThreeTeamSplits,
  compareThreeTeamSplitsBeforeBalance,
  listThreeTeamGeographicSplits,
} from '../shared/survey-planning/surveyGeographicSplit.js'

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
  it('keeps 3, 9, 15 on a 20 NM side and drops 21 past the edge', () => {
    expect(parallelOffsetsForHalfWidth(20)).toEqual([3, 9, 15])
  })

  it('follows a changed spacing and never plans past the published width', () => {
    expect(parallelOffsetsForHalfWidth(20, { firstOffsetNm: 3, stepNm: 4 })).toEqual([3, 7, 11, 15, 19])
    expect(parallelOffsetsForHalfWidth(10, { firstOffsetNm: 3, stepNm: 4 })).toEqual([3, 7])
    expect(parallelOffsetsForHalfWidth(20, { firstOffsetNm: 3, stepNm: 8 })).toEqual([3, 11, 19])
    expect(parallelOffsetsForHalfWidth(10, { firstOffsetNm: 3, stepNm: 8 })).toEqual([3])
    for (const offset of parallelOffsetsForHalfWidth(20, { firstOffsetNm: 4, stepNm: 8 })) {
      expect(offset).toBeLessThanOrEqual(20)
    }
  })

  it('plans nothing when the width is missing or the first offset is already past the edge', () => {
    expect(parallelOffsetsForHalfWidth(null)).toEqual([])
    expect(parallelOffsetsForHalfWidth(2)).toEqual([])
    const legs = buildLegWidthSummaries({
      routeType: 'VR',
      routeNumber: '1',
      waypoints: [
        { ptIdent: 'A', lat: 35, lon: -103 },
        { ptIdent: 'B', lat: 35.1, lon: -103.1 },
      ],
      widthTexts: [],
      teams: [],
      sortieBudgetNm: 500,
    })
    expect(legs[0].leftOffsets).toEqual([])
    expect(legs[0].rightOffsets).toEqual([])
    expect(legs[0].leftNote).toBe('No published width for this side.')
    expect(legs[0].rightNote).toBe('No published width for this side.')
  })

  it('uses fewer offsets for 10 NM half-width', () => {
    expect(parallelOffsetsForHalfWidth(10)).toEqual([3, 9])
  })

  it('uses single 3 NM offset for 5 NM half-width', () => {
    expect(parallelOffsetsForHalfWidth(5)).toEqual([3])
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
    expect(segments[0]).toMatchObject({ fromPt: 'A', toPt: 'B', offsets: [3, 9, 15] })
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

  it('splits the inside-edge offsets when they exceed the sortie budget', () => {
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
    expect(sorties[1].offsets).toEqual([15])
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
    expect(bM1.rightOffsets).toEqual([3, 9, 15])
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
    expect(legs.find((l) => l.fromPt === 'F' && l.toPt === 'M1')?.rightOffsets).toEqual([3, 9, 15])
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
    expect(result.teams[1].sortieCount).toBe(3)
    expect(result.totalSorties).toBe(6)
    expect(result.totalWingNm).toBeGreaterThan(2500)

    const rightSorties = result.teams[1].sorties
    expect(rightSorties.every((s) => s.waypointFrom === 'A' && s.waypointTo === 'M1')).toBe(true)
    expect(rightSorties.every((s) => s.offsets.every((offset) => offset <= 20))).toBe(true)
    expect(rightSorties.some((s) => s.offsets.includes(21))).toBe(false)
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
    expect(compare.twoTeams.totalSorties).toBe(6)
    expect(compare.deltaSorties).toBe(-1)
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

    // Sortie indices must be absolute against the full route (export uses full waypoint list).
    const lastIdx = VR114_FULL_WPS.length - 1
    const surveySorties = result.teams.flatMap((t) => t.sorties).filter((s) => !s.returnHomeOnly)
    expect(surveySorties.length).toBeGreaterThan(0)
    for (const s of surveySorties) {
      expect(s.startIdx).toBeGreaterThanOrEqual(0)
      expect(s.endIdx).toBeLessThanOrEqual(lastIdx)
      expect(s.endIdx).toBeGreaterThan(s.startIdx)
      expect(VR114_FULL_WPS[s.startIdx]?.ptIdent).toBe(s.waypointFrom)
      expect(VR114_FULL_WPS[s.endIdx]?.ptIdent).toBe(s.waypointTo)
    }
    // At least one sortie must lie past the first geographic boundary (Team 2/3 chunks).
    const pastFirstSplit = surveySorties.some((s) => s.startIdx >= result.geographicSplits[0].boundaryIdx)
    expect(pastFirstSplit).toBe(true)
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
    expect(compare.twoTeams.totalSorties).toBe(6)
    expect(compare.threeTeams.totalSorties).toBeGreaterThan(0)
    expect(compare.deltaSorties).toBe(compare.threeTeams.totalSorties - compare.twoTeams.totalSorties)
    expect(compare.threeTeams.assignmentModel).toBe('geographic')
  })
})

const IR107_WIDTH = ['7.5 NM EITHER SIDE OF CENTERLINE FOR ENTIRE ROUTE']
const KCAO = { lat: 36.446111, lon: -103.154722, label: 'KCAO' }
const IR107_WPS = ['N', 'M', 'L', 'K', 'J', 'I', 'H', 'G', 'F', 'E', 'D'].map((letter, i) => ({
  ptIdent: `${letter}107`,
  lat: 36.85 - i * 0.1,
  lon: -104.0 + i * 0.2,
}))

describe('staged refuel between corridor sides', () => {
  it('fits IR107-like distant home in two sorties when recovering at KCAO', () => {
    const team1 = { label: 'KABQ', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const base = {
      routeType: 'IR',
      routeNumber: '107',
      waypoints: IR107_WPS,
      widthTexts: IR107_WIDTH,
      teams: [team1],
      sortieBudgetNm: 500,
    }

    const returnHome = planSingleTeamBothSides(base)
    const staged = planSingleTeamBothSides({
      ...base,
      ferryMode: 'staged-refuel',
      recoveryAirport: KCAO,
    })

    expect(returnHome.totalSorties).toBe(4)
    expect(staged.totalSorties).toBe(2)
    expect(staged.ferryMode).toBe('staged-refuel')
    expect(staged.teams[0].sorties).toHaveLength(1)
    expect(staged.teams[1].sorties).toHaveLength(1)
    expect(staged.teams[0].sorties[0].offsets).toEqual([3])
    expect(staged.teams[0].sorties[0].ferryInLabel).toBe('KABQ')
    expect(staged.teams[0].sorties[0].ferryOutLabel).toBe('KCAO')
    expect(staged.teams[1].sorties[0].ferryInLabel).toBe('KCAO')
    expect(staged.teams[1].sorties[0].ferryOutLabel).toBe('KABQ')
    for (const s of [...staged.teams[0].sorties, ...staged.teams[1].sorties]) {
      expect(s.totalNm).toBeLessThanOrEqual(500 + 1e-6)
    }
  })
})

describe('staged refuel opposite-side staffing', () => {
  it('adds return-home sortie 2 per team after survey sortie 1', () => {
    const team1 = { label: 'KABQ', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const OE0 = { lat: 36.991944, lon: -106.911111 }
    const team2 = { label: '0E0', depLat: OE0.lat, depLon: OE0.lon, side: 'right' }
    const result = planSurveyScenario({
      routeType: 'IR',
      routeNumber: '107',
      waypoints: IR107_WPS,
      widthTexts: IR107_WIDTH,
      teams: [team1, team2],
      sortieBudgetNm: 500,
      assignmentModel: 'opposite-side',
      ferryMode: 'staged-refuel',
      recoveryAirport: KCAO,
    })

    expect(result.totalSorties).toBeGreaterThan(0)
    for (const team of result.teams) {
      const last = team.sorties[team.sorties.length - 1]
      expect(last.ferryOutLabel).toBe(team.label)
      if (team.sorties.length > 1 && last.returnHomeOnly) {
        expect(last.ferryInLabel).toBe('KCAO')
        expect(last.offsets).toEqual([])
      }
    }
  })

  it('merges return home into the last survey sortie when combined NM fits budget', () => {
    const spanTrackPlan = defaultSpanTrackPlanFromWidthTexts(VR114_WIDTH)
    spanTrackPlan[0].leftOffsets = [7, 14]
    spanTrackPlan[0].rightOffsets = [7, 14]
    spanTrackPlan[1].leftOffsets = [5]
    spanTrackPlan[1].rightOffsets = [7, 14]

    const team1 = { label: 'KABQ', depLat: KABQ.lat, depLon: KABQ.lon, side: 'left' }
    const result = planSurveyScenario({
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114_FULL_WPS,
      widthTexts: VR114_WIDTH,
      spanTrackPlan,
      teams: [team1],
      sortieBudgetNm: 500,
      assignmentModel: 'opposite-side',
      ferryMode: 'staged-refuel',
      recoveryAirport: KCAO,
    })

    const team = result.teams[0]
    expect(team.sortieCount).toBe(2)
    expect(team.sorties.some((s) => s.returnHomeOnly)).toBe(false)
    expect(team.sorties[1].ferryOutLabel).toBe('KABQ')
    expect(team.sorties[1].totalNm).toBeLessThanOrEqual(500)
    expect(team.note).toMatch(/sortie 2 completes remaining survey work and returns home/)
  })

  it('buildStagedRefuelTeamNote uses correct return sortie number', () => {
    const note = buildStagedRefuelTeamNote([
      { sortieNumber: 1, returnHomeOnly: false },
      { sortieNumber: 2, returnHomeOnly: false },
      { sortieNumber: 3, returnHomeOnly: true },
    ])
    expect(note).toMatch(/sortie 3 is return to home/)
  })
})

function laneCoverageGaps(legs, sorties) {
  const counts = new Map()
  for (let index = 0; index < legs.length; index++) {
    for (const side of ['left', 'right']) {
      const offsets = side === 'left' ? legs[index].leftOffsets : legs[index].rightOffsets
      for (const offset of offsets) counts.set(`${side}:${index}:${offset}`, 0)
    }
  }
  const extras = []
  for (const sortie of sorties) {
    if (sortie.returnHomeOnly || (sortie.side !== 'left' && sortie.side !== 'right')) continue
    for (let leg = sortie.startIdx; leg < sortie.endIdx; leg++) {
      for (const offset of sortie.offsets) {
        const key = `${sortie.side}:${leg}:${offset}`
        if (!counts.has(key)) extras.push(key)
        else counts.set(key, counts.get(key) + 1)
      }
    }
  }
  const gaps = []
  for (const [key, count] of counts) {
    if (count !== 1) gaps.push(`${key} flown ${count}`)
  }
  return { gaps, extras }
}

function assertContinuousChain(sorties, home) {
  expect(sorties.length).toBeGreaterThan(0)
  expect(sorties[0].ferryInLabel).toBe(home)
  expect(sorties[sorties.length - 1].ferryOutLabel).toBe(home)
  for (let index = 1; index < sorties.length; index++) {
    expect(sorties[index].ferryInLabel).toBe(sorties[index - 1].ferryOutLabel)
  }
}

describe('VR114 lane coverage and refuel chain', () => {
  const policy = { firstOffsetNm: 2.5, stepNm: 5 }
  const spanTrackPlan = [
    {
      fromPt: 'A',
      toPt: 'B',
      leftNm: 20,
      rightNm: 20,
      leftOffsets: parallelOffsetsForHalfWidth(20, policy),
      rightOffsets: parallelOffsetsForHalfWidth(20, policy),
    },
    {
      fromPt: 'B',
      toPt: 'M1',
      leftNm: 10,
      rightNm: 20,
      leftOffsets: parallelOffsetsForHalfWidth(10, policy),
      rightOffsets: parallelOffsetsForHalfWidth(20, policy),
    },
  ]
  const airports = [
    { label: 'KABQ', side: 'left', depLat: KABQ.lat, depLon: KABQ.lon },
    { label: 'KSKX', side: 'right', depLat: 36.458, depLon: -105.673 },
    { label: 'KLRU', side: 'left', depLat: 32.29, depLon: -106.92 },
  ]
  const stagedInput = {
    routeType: 'VR',
    routeNumber: '114',
    waypoints: VR114_FULL_WPS,
    widthTexts: VR114_WIDTH,
    teams: airports,
    spanTrackPlan,
    sortieBudgetNm: 400,
    trackPolicy: policy,
    ferryMode: 'staged-refuel',
    recoveryAirport: { lat: 35.1828, lon: -103.603, label: 'KTCC' },
  }

  it('flies every lane once on the three-aircraft refuel plan', () => {
    const result = planThreeTeamGeographicScenario(stagedInput, airports)
    const coverage = laneCoverageGaps(result.legs, result.teams.flatMap((team) => team.sorties))
    expect(coverage.extras).toEqual([])
    expect(coverage.gaps).toEqual([])
    for (const [index, team] of result.teams.entries()) {
      assertContinuousChain(team.sorties, result.segmentAssignments[index].teamLabel)
      for (const sortie of team.sorties) {
        if (!sortie.returnHomeOnly) expect(sortie.totalNm).toBeLessThanOrEqual(400 + 1e-6)
      }
    }
  })

  it('keeps a one-aircraft return-home chain on the same lanes', () => {
    const result = planSingleTeamBothSides({
      ...stagedInput,
      teams: [airports[0]],
      ferryMode: 'return-home',
      recoveryAirport: undefined,
    })
    const sorties = result.teams.flatMap((team) => team.sorties)
    const coverage = laneCoverageGaps(result.legs, sorties)
    expect(coverage.extras).toEqual([])
    expect(coverage.gaps).toEqual([])
    assertContinuousChain(sorties, 'KABQ')
    expect(sorties.every((sortie) => sortie.ferryInLabel === 'KABQ' && sortie.ferryOutLabel === 'KABQ')).toBe(true)
  })

  it('uses balance only when sortie count and miles already match', () => {
    const uneven = {
      totalSorties: 9,
      totalWingNm: 2500,
      overBudget: 0,
      s1: 3,
      s2: 4,
      segmentTeams: [
        { sortieCount: 5, totalNm: 1400 },
        { sortieCount: 2, totalNm: 400 },
        { sortieCount: 2, totalNm: 700 },
      ],
    }
    const even = {
      ...uneven,
      s1: 2,
      segmentTeams: [
        { sortieCount: 3, totalNm: 900 },
        { sortieCount: 3, totalNm: 800 },
        { sortieCount: 3, totalNm: 800 },
      ],
    }
    expect(compareThreeTeamSplits(even, uneven)).toBeLessThan(0)
    expect(compareThreeTeamSplits({ ...even, totalWingNm: 2600 }, uneven)).toBeGreaterThan(0)
    expect(compareThreeTeamSplits({ ...even, totalSorties: 10 }, uneven)).toBeGreaterThan(0)

    const splits = listThreeTeamGeographicSplits(stagedInput, airports)
    const balanced = [...splits].sort(compareThreeTeamSplits)[0]
    const beforeBalance = [...splits].sort(compareThreeTeamSplitsBeforeBalance)[0]
    const winner = planThreeTeamGeographicScenario(stagedInput, airports)
    expect(winner.totalSorties).toBe(balanced.totalSorties)
    expect(winner.totalWingNm).toBe(balanced.totalWingNm)
    expect(winner.geographicSplits.map((split) => split.boundaryIdx)).toEqual([balanced.s1, balanced.s2])
    const cheaper = splits.filter(
      (split) =>
        split.totalSorties < winner.totalSorties ||
        (split.totalSorties === winner.totalSorties && split.totalWingNm < winner.totalWingNm)
    )
    expect(cheaper).toEqual([])
    expect(beforeBalance.totalSorties).toBe(balanced.totalSorties)
    expect(beforeBalance.totalWingNm).toBe(balanced.totalWingNm)
  })
})
