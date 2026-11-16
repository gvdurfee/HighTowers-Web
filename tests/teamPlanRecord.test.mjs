import { describe, expect, it } from 'vitest'
import { buildCoordinatorCrewOffsetFile } from '../src/services/coordinatorOffsetExport.ts'
import { passesForSortie, buildSerpentineDisplay } from '../src/services/serpentineDisplay.ts'
import {
  buildTeamSortieFile,
  draftTeamPlan,
  drawSavedTeam,
  memoryTeamPlanStore,
  sortiesForSide,
  teamSortieOffsetRoute,
} from '../src/services/teamPlanRecord.ts'
import { refuelAirportForCrew, refuelEditsForDraft } from '../src/services/teamDispatchWizard.ts'

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

const IR112 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'EH', 'I', 'J', 'EK', 'L', 'XM', 'TN', 'AA', 'AB', 'AC', 'AD', 'XM']

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

function threeTeamPlan() {
  return draftTeamPlan({
    flightPlanId: 'vr114',
    savedAt: '2026-10-23T14:00:00.000Z',
    crews: [
      { id: 'team1', label: 'Team 1', departure: airport('KLRU', 32.29, -106.92) },
      { id: 'team2', label: 'Team 2', departure: airport('KABQ', 35.04, -106.61) },
      { id: 'team3', label: 'Team 3', departure: airport('KSKX', 35.53, -105.89) },
    ],
    sides: { team1: 'inner', team2: 'outer', team3: 'inner' },
    segments: {
      team1: { from: 'A', to: 'B', start: 'A' },
      team2: { from: 'B', to: 'D', start: 'B' },
      team3: { from: 'D', to: 'M1', start: 'D' },
    },
  })
}

describe('saved team plan', () => {
  const points = vr114Points()
  const widths = vr114Widths()

  it('saves and reloads the team plan without changing the stored teams', async () => {
    const store = memoryTeamPlanStore()
    const plan = threeTeamPlan()
    await store.put(plan)
    const loaded = await store.get('vr114')
    expect(loaded).toEqual(plan)
    expect(loaded.teams.map((team) => [team.label, team.departure.identifier, team.landing.identifier, team.segmentFrom, team.segmentTo, team.startPoint])).toEqual([
      ['Team 1', 'KLRU', 'KLRU', 'A', 'B', 'A'],
      ['Team 2', 'KABQ', 'KABQ', 'B', 'D', 'B'],
      ['Team 3', 'KSKX', 'KSKX', 'D', 'M1', 'D'],
    ])
    expect(loaded.teams[0].sorties).toEqual(sortiesForSide('inner'))
    expect(await store.get('missing')).toBeUndefined()
  })

  it('draws each saved VR114 team from its own segment and leaves a missing side blank', () => {
    const plan = threeTeamPlan()
    const drawn = plan.teams.map((team) => drawSavedTeam({ team, points, legWidths: widths }))
    expect(drawn.map((item) => item.overlay.airport)).toEqual(['KLRU', 'KABQ', 'KSKX'])
    expect(drawn.every((item) => item.notes.length === 0)).toBe(true)

    drawn.forEach((item, index) => {
      const sortie1 = passesForSortie(item.overlay.passes, 1)
      const sortie2 = passesForSortie(item.overlay.passes, 2)
      expect(sortie1.length).toBeGreaterThan(1)
      expect(sortie2.length).toBeGreaterThan(0)
      expect(sortie1.length).toBe(item.sorties[0].lanes)
      const day1 = buildSerpentineDisplay(sortie1, undefined, {
        departure: plan.teams[index].departure,
        landing: plan.teams[index].landing,
      })
      expect(day1.labels.map((label) => label.name)).toEqual(sortie1.flatMap((pass) => pass.waypoints.map((point) => point.name)))
      expect(day1.labels.every((label) => /^[A-Z][A-Z0-9]{0,3}[1-9][IO]$/.test(label.name))).toBe(true)
      expect(day1.labels.filter((label) => label.role).map((label) => label.role)).toEqual(['entry', 'exit'])
      expect(day1.crossoverLegs).toHaveLength(sortie1.length - 1)
      expect(day1.airportLegs.map((leg) => [leg.role, leg.identifier])).toEqual([
        ['departure', plan.teams[index].departure.identifier],
        ['landing', plan.teams[index].landing.identifier],
      ])
      expect(day1.airportLegs[0].coordinates[1]).toEqual([sortie1[0].waypoints[0].lon, sortie1[0].waypoints[0].lat])
      expect(sortie2.length).toBe(item.sorties[1].lanes)
    })

    const blank = drawSavedTeam({
      team: { ...plan.teams[0], sorties: sortiesForSide(null), segmentFrom: null, segmentTo: null },
      points,
      legWidths: widths,
    })
    expect(blank.overlay.passes).toEqual([])
    expect(blank.notes).toContain('No segment assigned.')
    expect(blank.notes).toContain('No Sortie 1 side set.')
  })

  it('draws two aircraft on opposite sides and swaps those sides on sortie 2', () => {
    const plan = draftTeamPlan({
      flightPlanId: 'vr114-two',
      savedAt: '2026-11-14T00:00:00.000Z',
      firstOffsetNm: 2.5,
      stepNm: 5,
      crews: [
        { id: 'team1', label: 'Team 1', departure: airport('KABQ', 35.04, -106.61) },
        { id: 'team2', label: 'Team 2', departure: airport('KLRU', 32.29, -106.92) },
      ],
      sides: { team1: 'inner', team2: 'outer' },
      segments: {
        team1: { from: 'A', to: 'M1', start: 'A' },
        team2: { from: 'A', to: 'M1', start: 'A' },
      },
    })
    const [team1, team2] = plan.teams.map((team) =>
      drawSavedTeam({ team, points, legWidths: widths, firstOffsetNm: 2.5, stepNm: 5 })
    )
    const fix = (draw, number) => draw.overlay.passes.find((pass) => pass.number === number)?.waypoints[0]
    const apart = (a, b) => {
      const dLat = (b.lat - a.lat) * 60
      const dLon = (b.lon - a.lon) * 60 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
      return Math.hypot(dLat, dLon)
    }
    const sortie1 = fix(team1, 1)
    const other = fix(team2, 1)
    const swapped = fix(team1, 2)
    expect(sortie1 && other && swapped).toBeTruthy()
    expect(apart(sortie1, other)).toBeGreaterThan(4)

    const ktcc = airport('KTCC', 35.18, -103.6)
    const edits = refuelEditsForDraft({
      ferryMode: 'staged-refuel',
      refuel: ktcc,
      aircraftCount: 2,
    })
    const refueled = draftTeamPlan({
      flightPlanId: 'vr114-refuel',
      savedAt: '2026-11-14T00:00:00.000Z',
      firstOffsetNm: 2.5,
      stepNm: 5,
      crews: [
        {
          id: 'team1',
          label: 'Team 1',
          departure: airport('KABQ', 35.04, -106.61),
          refuelStop: refuelAirportForCrew('team1', 'staged-refuel', ktcc, edits),
        },
      ],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'A', to: 'M1', start: 'A' } },
    })
    const home = draftTeamPlan({
      flightPlanId: 'vr114-home',
      savedAt: '2026-11-14T00:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: airport('KABQ', 35.04, -106.61) }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'A', to: 'M1', start: 'A' } },
    })
    const first = teamSortieOffsetRoute({
      team: refueled.teams[0],
      points,
      legWidths: widths,
      sortieNumber: 1,
      firstOffsetNm: 2.5,
      stepNm: 5,
    })
    const second = teamSortieOffsetRoute({
      team: refueled.teams[0],
      points,
      legWidths: widths,
      sortieNumber: 2,
      firstOffsetNm: 2.5,
      stepNm: 5,
    })
    const roundTrip = teamSortieOffsetRoute({
      team: home.teams[0],
      points,
      legWidths: widths,
      sortieNumber: 1,
    })
    expect(first.landing.identifier).toBe('KTCC')
    expect(second.departure.identifier).toBe('KTCC')
    expect(second.landing.identifier).toBe('KABQ')
    expect(roundTrip.landing.identifier).toBe('KABQ')
    expect(apart(swapped, other)).toBeLessThan(1)
    expect(team1.sorties[0].surveySide).not.toBe(team2.sorties[0].surveySide)
    expect(team1.sorties[1].surveySide).toBe(team2.sorties[0].surveySide)
    expect(team1.sorties[0].offsetsNm[0]).toBe(2.5)
    expect(team1.overlay.passes[0].coordinates[0]).toEqual([sortie1.lon, sortie1.lat])
  })

  it('keeps each of three aircraft inside its own segment', () => {
    const plan = threeTeamPlan()
    const drawn = plan.teams.map((team) => drawSavedTeam({ team, points, legWidths: widths, firstOffsetNm: 2.5, stepNm: 5 }))
    const names = (draw) => draw.overlay.passes.flatMap((pass) => pass.waypoints.map((point) => point.name))
    const team1 = names(drawn[0])
    const team3 = names(drawn[2])
    expect(team1.length).toBeGreaterThan(0)
    expect(team1.every((name) => name.startsWith('A') || name.startsWith('B'))).toBe(true)
    expect(team3.some((name) => name.startsWith('A') || name.startsWith('B'))).toBe(false)
    expect(team3.some((name) => name.startsWith('M'))).toBe(true)
    expect(drawn[0].overlay.passes[0].coordinates.length).toBeGreaterThan(1)
  })

  it('builds the same .fpl as the shared offset export and leaves a full IR112 file unchanged', () => {
    const strip = (xml) => xml.replace(/<created>[\s\S]*?<\/created>/, '')
    const plan = threeTeamPlan()
    const team = plan.teams[0]
    const slicePoints = points.slice(0, 2)
    const sliceWidths = widths.slice(0, 1)
    const shared = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points: slicePoints,
      legWidths: sliceWidths,
      sortie1Side: 'inner',
      sortieNumber: 1,
      departure: team.departure,
      destination: team.landing,
    })
    const fromPlan = buildTeamSortieFile({
      team,
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortieNumber: 1,
    })
    expect(strip(fromPlan.xml)).toBe(strip(shared.xml))
    expect(fromPlan.userNames).toEqual(shared.userNames)

    const ir112 = IR112.map((point, index) => ({
      ptIdent: point,
      originalName: `IR112-${point}`,
      lat: 35 + index * 0.05,
      lon: -106,
    }))
    const irWidths = ir112.slice(0, -1).map(() => ({ leftNm: 5, rightNm: 5 }))
    const before = buildCoordinatorCrewOffsetFile({
      routeLabel: 'IR112',
      points: ir112,
      legWidths: irWidths,
      sortie1Side: 'inner',
      sortieNumber: 1,
      departure: { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.04, longitude: -106.6 },
      destination: { identifier: 'KINW', name: 'Winslow', latitude: 35.02, longitude: -110.72 },
    })
    buildTeamSortieFile({ team, routeLabel: 'VR114', points, legWidths: widths, sortieNumber: 2 })
    const after = buildCoordinatorCrewOffsetFile({
      routeLabel: 'IR112',
      points: ir112,
      legWidths: irWidths,
      sortie1Side: 'inner',
      sortieNumber: 1,
      departure: { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.04, longitude: -106.6 },
      destination: { identifier: 'KINW', name: 'Winslow', latitude: 35.02, longitude: -110.72 },
    })
    expect(strip(after.xml)).toBe(strip(before.xml))
    expect(after.userNames).toEqual(before.userNames)
  })
})
