import { describe, expect, it } from 'vitest'
import { attachPackedSorties, planDispatchSorties } from '../src/services/teamDispatchSorties.ts'
import { buildTeamPlanSortieFile } from '../src/services/teamPlanSortieDownload.ts'
import {
  draftTeamPlan,
  drawSavedTeam,
  formatSortieHeader,
  legacySortieNote,
  LEGACY_SORTIE_NOTE,
  mapSortieButtons,
} from '../src/services/teamPlanRecord.ts'

const POINTS = [
  { ptIdent: 'A', lat: 34.64166666, lon: -102.9 },
  { ptIdent: 'B', lat: 35.7, lon: -102.96666666 },
  { ptIdent: 'C', lat: 35.58333333, lon: -103.63333333 },
  { ptIdent: 'D', lat: 35.53333333, lon: -103.94166666 },
  { ptIdent: 'E', lat: 35.05833333, lon: -104.04166666 },
  { ptIdent: 'F', lat: 34.825, lon: -103.74166666 },
  { ptIdent: 'M1', lat: 34.65, lon: -103.78333333 },
]

const WIDTHS = POINTS.slice(0, -1).map((_, index) =>
  index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }
)

const SPANS = [
  {
    fromPt: 'A',
    toPt: 'B',
    leftNm: '20',
    rightNm: '20',
    leftOffsetsText: '2.5, 7.5, 12.5, 17.5',
    rightOffsetsText: '2.5, 7.5, 12.5, 17.5',
    displayText: 'A to B',
  },
  {
    fromPt: 'B',
    toPt: 'M1',
    leftNm: '10',
    rightNm: '20',
    leftOffsetsText: '2.5, 7.5',
    rightOffsetsText: '2.5, 7.5, 12.5, 17.5',
    displayText: 'B to M1',
  },
]

const KABQ = { identifier: 'KABQ', latitude: 35.0402, longitude: -106.609 }
const KSKX = { identifier: 'KSKX', latitude: 36.458, longitude: -105.673 }
const KLRU = { identifier: 'KLRU', latitude: 32.29, longitude: -106.92 }
const KTCC = { identifier: 'KTCC', latitude: 35.1828, longitude: -103.603 }

function plan(opts) {
  return planDispatchSorties({
    routeType: 'VR',
    routeNumber: '114',
    waypoints: POINTS,
    widthTexts: ['10 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE'],
    spans: SPANS,
    firstOffsetNm: 2.5,
    stepNm: 5,
    sortieBudgetNm: 400,
    ...opts,
  })
}

function savedFrom(dispatch, airports) {
  const drafted = draftTeamPlan({
    flightPlanId: 'packed',
    savedAt: '2026-11-14T12:00:00.000Z',
    firstOffsetNm: 2.5,
    stepNm: 5,
    sortieBudgetNm: 400,
    crews: airports.map((airport, index) => ({
      id: `team${index + 1}`,
      label: `Team ${index + 1}`,
      departure: { ...airport, name: airport.identifier },
      refuelStop: dispatch && optsRefuel(dispatch),
    })),
    sides: { team1: 'inner', team2: 'outer', team3: 'inner' },
    segments: {
      team1: { from: 'A', to: 'M1', start: 'A' },
      team2: { from: 'A', to: 'M1', start: 'A' },
      team3: { from: 'A', to: 'M1', start: 'A' },
    },
  })
  return attachPackedSorties(drafted, dispatch)
}

function optsRefuel() {
  return null
}

describe('packed sortie list', () => {
  it('saves, draws, and exports three sorties for one team on a staged-refuel plan', () => {
    const dispatch = plan({
      aircraftCount: 3,
      ferryMode: 'staged-refuel',
      refuel: KTCC,
      airports: [KABQ, KSKX, KLRU],
    })
    expect('error' in dispatch).toBe(false)
    const triple = dispatch.teams.find((team) => team.sortieCount >= 3)
    expect(triple).toBeTruthy()
    expect(dispatch.totalSorties).toBe(dispatch.teams.reduce((sum, team) => sum + team.sortieCount, 0))
    expect(dispatch.totalNm).toBe(
      Math.round(dispatch.teams.reduce((sum, team) => sum + team.totalNm, 0) * 10) / 10
    )
    expect(dispatch.totalLine).toContain('includes ferry')
    for (const crew of dispatch.teams) {
      expect(crew.sorties[0].departureIdent).toBe(crew.ident)
      expect(crew.sorties[crew.sorties.length - 1].landingIdent).toBe(crew.ident)
      for (let index = 1; index < crew.sorties.length; index++) {
        expect(crew.sorties[index].departureIdent).toBe(crew.sorties[index - 1].landingIdent)
      }
    }

    const refuel = { ...KTCC, name: 'KTCC' }
    const drafted = draftTeamPlan({
      flightPlanId: 'packed',
      savedAt: '2026-11-14T12:00:00.000Z',
      firstOffsetNm: 2.5,
      stepNm: 5,
      sortieBudgetNm: 400,
      crews: [KABQ, KSKX, KLRU].map((airport, index) => ({
        id: `team${index + 1}`,
        label: `Team ${index + 1}`,
        departure: { ...airport, name: airport.identifier },
        refuelStop: refuel,
      })),
      sides: { team1: 'inner', team2: 'outer', team3: 'inner' },
      segments: {
        team1: { from: 'A', to: 'M1', start: 'A' },
        team2: { from: 'A', to: 'M1', start: 'A' },
        team3: { from: 'A', to: 'M1', start: 'A' },
      },
    })
    const saved = attachPackedSorties(drafted, dispatch)
    const team = saved.teams.find((item) => item.packedSorties?.length === triple.sortieCount)
    expect(team).toBeTruthy()
    expect(team.packedSorties.length).toBeGreaterThan(2)
    expect(mapSortieButtons(team.packedSorties).map((button) => button.number)).toEqual(
      team.packedSorties.map((sortie) => sortie.number)
    )
    const drawn = drawSavedTeam({
      team,
      points: POINTS,
      legWidths: WIDTHS,
      firstOffsetNm: 2.5,
      stepNm: 5,
    })
    expect(drawn.sorties).toHaveLength(team.packedSorties.length)
    const drawnNm = Math.round(drawn.sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
    expect(drawnNm).toBe(Math.round(team.packedSorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10)
    expect(drawnNm).toBe(dispatch.teams.find((item) => item.ident === team.departure.identifier).totalNm)
    for (const sortie of drawn.sorties) {
      if (sortie.offsetsNm.length === 0) continue
      const header = formatSortieHeader(sortie)
      for (const offset of sortie.offsetsNm) expect(header).toContain(String(offset))
    }
    for (const sortie of team.packedSorties) {
      if (sortie.returnHomeOnly || sortie.offsetsNm.length === 0) continue
      const file = buildTeamPlanSortieFile({
        team,
        points: POINTS,
        legWidths: WIDTHS,
        routeLabel: 'VR114',
        policy: { firstOffsetNm: 2.5, stepNm: 5 },
        sortieNumber: sortie.number,
      })
      expect(file.filename).toBe(`VR114_${team.departure.identifier}_${sortie.fromPt}${sortie.toPt}_S${sortie.number}.fpl`)
      expect(file.xml).toContain(sortie.departureIdent)
      expect(file.xml).toContain(sortie.landingIdent)
    }
  })

  it('matches the review counts and miles for two aircraft that return home', () => {
    const dispatch = plan({
      aircraftCount: 2,
      ferryMode: 'return-home',
      airports: [KABQ, KSKX],
    })
    expect('error' in dispatch).toBe(false)
    const again = plan({
      aircraftCount: 2,
      ferryMode: 'return-home',
      airports: [KABQ, KSKX],
    })
    expect(again.totalSorties).toBe(dispatch.totalSorties)
    expect(again.totalNm).toBe(dispatch.totalNm)
    expect(dispatch.lines.every((line) => line.includes('includes ferry'))).toBe(true)
    const saved = savedFrom(dispatch, [KABQ, KSKX])
    for (const team of saved.teams) {
      const packed = dispatch.teams.find((item) => item.ident === team.departure.identifier)
      const drawn = drawSavedTeam({
        team,
        points: POINTS,
        legWidths: WIDTHS,
        firstOffsetNm: 2.5,
        stepNm: 5,
      })
      expect(drawn.sorties).toHaveLength(packed.sortieCount)
      const drawnNm = Math.round(drawn.sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
      expect(drawnNm).toBe(packed.totalNm)
    }
  })

  it('keeps the two-sortie drawing and the re-run note for an older plan', () => {
    const legacy = draftTeamPlan({
      flightPlanId: 'old',
      savedAt: '2026-10-01T00:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: { ...KABQ, name: 'KABQ' } }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'A', to: 'M1', start: 'A' } },
    })
    expect(legacy.teams[0].packedSorties).toBeUndefined()
    expect(legacySortieNote(legacy.teams[0])).toBe(LEGACY_SORTIE_NOTE)
    expect(legacySortieNote({ packedSorties: [{ number: 1 }] })).toBeNull()
    const drawn = drawSavedTeam({
      team: legacy.teams[0],
      points: POINTS,
      legWidths: WIDTHS,
    })
    expect(drawn.sorties.map((sortie) => sortie.number)).toEqual([1, 2])
    expect(mapSortieButtons(legacy.teams[0].sorties)).toEqual([
      { number: 1, enabled: true },
      { number: 2, enabled: true },
    ])
  })
})
