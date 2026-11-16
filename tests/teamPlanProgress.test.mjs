import { describe, expect, it } from 'vitest'
import {
  buildTeamSortieFile,
  draftTeamPlan,
  memoryTeamPlanStore,
} from '../src/services/teamPlanRecord.ts'
import {
  coveredSurveyNm,
  progressClearNotice,
  reconcileSortieProgress,
  surveyLaneNm,
  surveyStops,
  surveySummaryLine,
} from '../src/services/teamPlanProgress.ts'

const VR114 = ['A', 'B', 'C', 'D', 'E', 'F', 'M1']
const VR114_COORDS = [
  [34.64166666, -102.9],
  [35.7, -102.96666666],
  [35.58333333, -103.63333333],
  [35.53333333, -103.94166666],
  [35.05833333, -104.04166666],
  [34.825, -103.74166666],
  [34.65, -103.78333333],
]

function vr114Points() {
  return VR114.map((point, index) => ({
    ptIdent: point,
    originalName: `VR114-${point}`,
    lat: VR114_COORDS[index][0],
    lon: VR114_COORDS[index][1],
  }))
}

function vr114Widths() {
  return VR114.slice(0, -1).map((_, index) =>
    index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }
  )
}

function airport(identifier, latitude, longitude) {
  return { identifier, name: identifier, latitude, longitude }
}

describe('team plan progress', () => {
  it('round-trips progress through save and load and leaves the sortie list alone', async () => {
    const store = memoryTeamPlanStore()
    const plan = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-11-16T12:00:00.000Z',
      crews: [
        { id: 'team1', label: 'Team 1', departure: airport('KSKX', 36.45, -105.67) },
        { id: 'team2', label: 'Team 2', departure: airport('KABQ', 35.04, -106.61) },
      ],
      sides: { team1: 'inner', team2: 'outer' },
      segments: {
        team1: { from: 'A', to: 'B', start: 'A' },
        team2: { from: 'B', to: 'E', start: 'B' },
      },
    })
    plan.teams[0].packedSorties = [
      {
        number: 1,
        side: 'inner',
        surveySide: 'left',
        offsetsNm: [2.5, 7.5],
        fromPt: 'A',
        toPt: 'B',
        departureIdent: 'KSKX',
        landingIdent: 'KTCC',
        distanceNm: 380.6,
        returnHomeOnly: false,
        startAt: 'A',
      },
    ]
    const packed = structuredClone(plan.teams[0].packedSorties)
    plan.progress = {
      'team1:1': {
        status: 'stopped',
        stoppedAt: 'XA1I',
        note: 'weather',
        recordedOn: '2026-11-16',
        waypointKey: 'XA1I|XA2I',
      },
    }
    await store.put(plan)
    const loaded = await store.get('vr114')
    expect(loaded.progress).toEqual(plan.progress)
    expect(loaded.teams[0].packedSorties).toEqual(packed)
    expect(loaded.teams[1].packedSorties).toBeUndefined()

    const unmarked = draftTeamPlan({
      flightPlanId: 'old',
      savedAt: '2026-10-01T00:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: airport('KSKX', 36.45, -105.67) }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'A', to: 'B', start: 'A' } },
    })
    await store.put(unmarked)
    const old = await store.get('old')
    expect(old.progress).toBeUndefined()
    expect(coveredSurveyNm([], old.progress?.['team1:1'])).toBe(0)
  })

  it('counts survey miles through the stopped-at waypoint, and completed is the whole survey', () => {
    const stops = [
      { name: 'A1', lat: 35, lon: -106 },
      { name: 'A2', lat: 35.1, lon: -106 },
      { name: 'A3', lat: 35.2, lon: -106 },
    ]
    const filtered = surveyStops(
      [
        { g1000Name: 'KSKX', lat: 36, lon: -105 },
        ...stops.map((stop) => ({ g1000Name: stop.name, lat: stop.lat, lon: stop.lon })),
        { name: 'KTCC', lat: 35.1, lon: -103 },
      ],
      ['KSKX', 'KTCC']
    )
    expect(filtered.map((stop) => stop.name)).toEqual(['A1', 'A2', 'A3'])
    const stopped = coveredSurveyNm(stops, { status: 'stopped', stoppedAt: 'A2' })
    const completed = coveredSurveyNm(stops, { status: 'completed' })
    expect(stopped).toBeCloseTo(6, 0)
    expect(completed).toBeCloseTo(12, 0)
    expect(stopped).toBe(surveyLaneNm(stops, 'A2'))
    expect(completed).toBe(surveyLaneNm(stops))
    expect(coveredSurveyNm(stops, undefined)).toBe(0)
    expect(surveySummaryLine(6, 12)).toBe('Surveyed 6.0 of 12.0 NM (50%)')
  })

  it('clears progress only for the sortie whose waypoints changed', () => {
    const previous = {
      'team1:1': { status: 'stopped', stoppedAt: 'A1', waypointKey: 'A1|A2', recordedOn: '2026-11-16' },
      'team3:1': { status: 'completed', waypointKey: 'E1|E2', recordedOn: '2026-11-16' },
    }
    const result = reconcileSortieProgress(previous, [
      { id: 'team1:1', label: 'KSKX sortie 1', waypointKey: 'A1|A3' },
      { id: 'team3:1', label: 'KLRU sortie 1', waypointKey: 'E1|E2' },
    ])
    expect(result.cleared).toEqual(['KSKX sortie 1'])
    expect(result.progress['team1:1']).toBeUndefined()
    expect(result.progress['team3:1']?.status).toBe('completed')
    expect(progressClearNotice(result.cleared)).toBe(
      'Progress was cleared for KSKX sortie 1 because that sortie changed.'
    )
  })

  it('builds the same flight plan file with and without a progress mark', () => {
    const plan = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-11-16T12:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: airport('KLRU', 32.29, -106.92) }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'A', to: 'B', start: 'A' } },
    })
    const opts = {
      team: plan.teams[0],
      routeLabel: 'VR114',
      points: vr114Points(),
      legWidths: vr114Widths(),
      sortieNumber: 1,
    }
    const plain = buildTeamSortieFile(opts)
    plan.progress = {
      'team1:1': { status: 'completed', recordedOn: '2026-11-16', waypointKey: 'lane' },
    }
    const marked = buildTeamSortieFile({ ...opts, team: plan.teams[0] })
    expect(marked).toEqual(plain)
    expect(plain.xml).toContain('<flight-plan')
    expect(plain.xml).not.toContain('progress')
  })
})
