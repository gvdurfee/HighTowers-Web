import { describe, expect, it } from 'vitest'
import { assignG1000WaypointNames } from '../shared/survey-planning/g1000Names.js'
import {
  planTeamSegmentDay,
  suggestTwoTeamSplit,
  validateTeamSegments,
} from '../shared/survey-planning/segmentAssignment.js'
import { buildTeamPlanSortieFile } from '../src/services/teamPlanSortieDownload.ts'
import {
  airportsForSortie,
  buildSerpentineDisplay,
  passesForSortie,
} from '../src/services/serpentineDisplay.ts'
import {
  draftTeamPlan,
  drawSavedTeam,
  formatSortieHeader,
  mapSortieButtons,
  ONE_SORTIE_TOOLTIP,
} from '../src/services/teamPlanRecord.ts'

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

const KLRU = { identifier: 'KLRU', name: 'Las Cruces', latitude: 32.289417, longitude: -106.921972 }
const KABQ = { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.040194, longitude: -106.609139 }
const KSKX = { identifier: 'KSKX', name: 'Taos', latitude: 36.458222, longitude: -105.671667 }
const KTCC = { identifier: 'KTCC', name: 'Tucumcari', latitude: 35.182778, longitude: -103.603194 }

function vr114Points() {
  const points = VR114.map((point, index) => ({
    ptIdent: point,
    originalName: `VR114-${point}`,
    lat: VR114_COORDS[index][0],
    lon: VR114_COORDS[index][1],
  }))
  const named = assignG1000WaypointNames(points.map((point) => ({ originalName: point.originalName })))
  points.forEach((point, index) => {
    point.g1000Name = named.names[index].g1000Name
  })
  return points
}

function vr114Widths() {
  return VR114.slice(0, -1).map((_, index) =>
    index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }
  )
}

function routeAirports(xml) {
  const route = xml.slice(xml.indexOf('<route>'))
  return [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>\s*<waypoint-type>([^<]*)<\/waypoint-type>/g)]
    .filter((match) => match[2].includes('AIRPORT'))
    .map((match) => match[1])
}

function fplUserNames(xml) {
  const route = xml.slice(xml.indexOf('<route>'), xml.indexOf('</route>'))
  return [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>\s*<waypoint-type>([^<]*)<\/waypoint-type>/g)]
    .filter((match) => match[2].includes('USER'))
    .map((match) => match[1])
}

function refuelEnds(home, refuel, sortieNumber) {
  const ends = airportsForSortie(sortieNumber, {
    departure: { identifier: home.identifier, latitude: home.latitude, longitude: home.longitude },
    landing: { identifier: refuel.identifier, latitude: refuel.latitude, longitude: refuel.longitude },
  })
  const mark = (airport) =>
    airport && airport.identifier === refuel.identifier
      ? { ...airport, caption: `${airport.identifier} — refuel` }
      : airport
  return { departure: mark(ends.departure), landing: mark(ends.landing) }
}

function dayFor(home, fromPt, toPt, refuel = null) {
  return planTeamSegmentDay({
    points: vr114Points(),
    legWidths: vr114Widths(),
    fromPt,
    toPt,
    home: { lat: home.latitude, lon: home.longitude, identifier: home.identifier },
    refuel: refuel
      ? { lat: refuel.latitude, lon: refuel.longitude, identifier: refuel.identifier }
      : null,
    sortie1Side: 'left',
  })
}

describe('editable team segments', () => {
  const points = vr114Points()
  const widths = vr114Widths()

  it('names gaps, overlaps, reversed ends, and an empty segment', () => {
    const gap = validateTeamSegments(VR114, [
      { label: 'KSKX', from: 'A', to: 'B' },
      { label: 'KABQ', from: 'B', to: 'C' },
      { label: 'KLRU', from: 'D', to: 'M1' },
    ])
    expect(gap.ok).toBe(false)
    expect(gap.messages).toContain('No team covers C–D.')

    const overlap = validateTeamSegments(VR114, [
      { label: 'KSKX', from: 'A', to: 'C' },
      { label: 'KABQ', from: 'B', to: 'D' },
      { label: 'KLRU', from: 'D', to: 'M1' },
    ])
    expect(overlap.ok).toBe(false)
    expect(overlap.messages).toContain('B–C is assigned to KSKX and KABQ.')

    const reversed = validateTeamSegments(VR114, [
      { label: 'KLRU', from: 'D', to: 'B' },
      { label: 'KABQ', from: 'B', to: 'D' },
      { label: 'KSKX', from: 'D', to: 'M1' },
    ])
    expect(reversed.ok).toBe(false)
    expect(reversed.messages).toContain('KLRU: From is after To.')

    const empty = validateTeamSegments(VR114, [
      { label: 'KSKX', from: 'A', to: 'B' },
      { label: 'KABQ', from: '', to: '' },
      { label: 'KLRU', from: 'B', to: 'M1' },
    ])
    expect(empty.ok).toBe(false)
    expect(empty.messages).toContain('KABQ has no segment.')

    const covered = validateTeamSegments(VR114, [
      { label: 'KSKX', from: 'A', to: 'B' },
      { label: 'KABQ', from: 'B', to: 'E' },
      { label: 'KLRU', from: 'E', to: 'M1' },
    ])
    expect(covered).toEqual({ ok: true, messages: [] })
  })

  it('stores the edited segment and matches the map header to that row', () => {
    const shortDay = dayFor(KSKX, 'A', 'B')
    const editedDay = dayFor(KABQ, 'B', 'D')
    expect(editedDay.sorties[0].distanceNm).not.toBe(shortDay.sorties[0].distanceNm)
    expect(editedDay.sorties).toHaveLength(2)

    const saved = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-10-23T18:00:00.000Z',
      crews: [
        { id: 'team1', label: 'Team 1', departure: KSKX },
        { id: 'team2', label: 'Team 2', departure: KABQ },
        { id: 'team3', label: 'Team 3', departure: KLRU },
      ],
      sides: { team1: 'inner', team2: 'inner', team3: 'inner' },
      segments: {
        team1: { from: 'A', to: 'B', start: 'A' },
        team2: { from: 'B', to: 'D', start: 'B' },
        team3: { from: 'D', to: 'M1', start: 'D' },
      },
    })
    expect(saved.teams.map((team) => [team.segmentFrom, team.segmentTo])).toEqual([
      ['A', 'B'],
      ['B', 'D'],
      ['D', 'M1'],
    ])
    expect(saved.teams.every((team) => team.segmentTo !== 'M1' || team.segmentFrom !== 'A')).toBe(true)
    expect(saved.teams[1].refuelStop).toBeNull()

    const drawn = drawSavedTeam({ team: saved.teams[1], points, legWidths: widths })
    expect(drawn.sorties.map((sortie) => sortie.distanceNm)).toEqual(
      editedDay.sorties.map((sortie) => sortie.distanceNm)
    )
    expect(formatSortieHeader(drawn.sorties[0])).toBe(
      `Sortie 1: ${editedDay.sorties[0].lanes} lanes, ${editedDay.sorties[0].waypoints} waypoints, ${editedDay.sorties[0].distanceNm} NM`
    )
    expect(formatSortieHeader(drawn.sorties[1])).toBe(
      `Sortie 2: ${editedDay.sorties[1].lanes} lanes, ${editedDay.sorties[1].waypoints} waypoints, ${editedDay.sorties[1].distanceNm} NM`
    )
  })

  it('lands KLRU sortie 1 at KTCC and brings sortie 2 home', () => {
    const day = dayFor(KLRU, 'A', 'B', KTCC)
    expect(day.sorties[0].departureIdent).toBe('KLRU')
    expect(day.sorties[0].landingIdent).toBe('KTCC')
    expect(day.sorties[1].departureIdent).toBe('KTCC')
    expect(day.sorties[1].landingIdent).toBe('KLRU')
    expect(day.sorties.map((sortie) => sortie.distanceNm)).toEqual([
      day.sorties[0].distanceNm,
      day.sorties[1].distanceNm,
    ])
    for (const sortie of day.sorties) {
      expect(typeof sortie.overBudget).toBe('boolean')
      expect(sortie.overBudget).toBe(sortie.distanceNm > 500)
    }

    const saved = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-10-23T18:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: KLRU, refuelStop: KTCC }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'A', to: 'B', start: 'A' } },
    })
    expect(saved.teams[0].refuelStop.identifier).toBe('KTCC')
    expect(saved.teams[0].landing.identifier).toBe('KTCC')

    const drawn = drawSavedTeam({ team: saved.teams[0], points, legWidths: widths })
    expect(drawn.sorties.map((sortie) => [sortie.lanes, sortie.waypoints, sortie.distanceNm])).toEqual(
      day.sorties.map((sortie) => [sortie.lanes, sortie.waypoints, sortie.distanceNm])
    )
    expect(formatSortieHeader(drawn.sorties[0], 'KTCC')).toBe(
      `Sortie 1: ${day.sorties[0].lanes} lanes, ${day.sorties[0].waypoints} waypoints, ${day.sorties[0].distanceNm} NM (refuel at KTCC)`
    )

    const marked = (sortieNumber) => {
      const ends = airportsForSortie(sortieNumber, {
        departure: { identifier: 'KLRU', latitude: KLRU.latitude, longitude: KLRU.longitude },
        landing: { identifier: 'KTCC', latitude: KTCC.latitude, longitude: KTCC.longitude, caption: 'KTCC — refuel' },
      })
      const passes = passesForSortie(drawn.overlay.passes, sortieNumber)
      return buildSerpentineDisplay(passes, undefined, ends)
    }
    expect(marked(1).airportLegs.map((leg) => [leg.role, leg.identifier, leg.caption])).toEqual([
      ['departure', 'KLRU', 'KLRU'],
      ['landing', 'KTCC', 'KTCC — refuel'],
    ])
    expect(marked(2).airportLegs.map((leg) => [leg.role, leg.identifier, leg.caption])).toEqual([
      ['departure', 'KTCC', 'KTCC — refuel'],
      ['landing', 'KLRU', 'KLRU'],
    ])

    for (const number of [1, 2]) {
      const file = buildTeamPlanSortieFile({
        team: saved.teams[0],
        points,
        legWidths: widths,
        routeLabel: 'VR114',
        sortieNumber: number,
      })
      expect(routeAirports(file.xml)).toEqual(number === 1 ? ['KLRU', 'KTCC'] : ['KTCC', 'KLRU'])
    }
  })

  it('leaves a team with no refuel stop departing and landing at home', () => {
    const day = dayFor(KABQ, 'B', 'D')
    expect(day.sorties.every((sortie) => sortie.departureIdent === 'KABQ' && sortie.landingIdent === 'KABQ')).toBe(
      true
    )
    const saved = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-10-23T18:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: KABQ }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'B', to: 'D', start: 'B' } },
    })
    const drawn = drawSavedTeam({ team: saved.teams[0], points, legWidths: widths })
    const display = buildSerpentineDisplay(passesForSortie(drawn.overlay.passes, 1), undefined, {
      departure: KABQ,
      landing: KABQ,
    })
    expect(display.airportLegs.map((leg) => leg.identifier)).toEqual(['KABQ', 'KABQ'])
    expect(formatSortieHeader(drawn.sorties[0])).not.toContain('refuel')
    expect(drawn.sorties[0].distanceNm).toBe(day.sorties[0].distanceNm)
  })

  it('still draws an older saved team that has no refuel field', () => {
    const saved = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-10-23T18:00:00.000Z',
      crews: [{ id: 'team1', label: 'Team 1', departure: KSKX }],
      sides: { team1: 'inner' },
      segments: { team1: { from: 'D', to: 'M1', start: 'D' } },
    })
    const legacy = { ...saved.teams[0] }
    delete legacy.refuelStop
    delete legacy.firstOffsetNm
    const drawn = drawSavedTeam({ team: legacy, points, legWidths: widths })
    expect(drawn.notes).toEqual([])
    expect(drawn.sorties).toHaveLength(2)
    const home = buildSerpentineDisplay(passesForSortie(drawn.overlay.passes, 2), undefined, {
      departure: KSKX,
      landing: KSKX,
    })
    expect(home.airportLegs.map((leg) => leg.identifier)).toEqual(['KSKX', 'KSKX'])

    const unlabeled = { ...legacy, segmentFrom: null, segmentTo: null }
    const blank = drawSavedTeam({ team: unlabeled, points, legWidths: widths })
    expect(blank.overlay.passes).toEqual([])
    expect(blank.notes).toContain('No segment assigned.')
  })

  it('enables Sortie 2 for each saved VR114 refuel team and matches that .fpl', () => {
    const crews = [
      { id: 'team2', label: 'Team 2', home: KSKX, from: 'A', to: 'B', sortie2Nm: 377.3 },
      { id: 'team1', label: 'Team 1', home: KABQ, from: 'B', to: 'E', sortie2Nm: 402.9 },
      { id: 'team3', label: 'Team 3', home: KLRU, from: 'E', to: 'M1', sortie2Nm: 327.6 },
    ]
    const saved = draftTeamPlan({
      flightPlanId: 'vr114',
      savedAt: '2026-10-23T18:00:00.000Z',
      crews: crews.map((crew) => ({
        id: crew.id,
        label: crew.label,
        departure: crew.home,
        refuelStop: KTCC,
      })),
      sides: Object.fromEntries(crews.map((crew) => [crew.id, 'inner'])),
      segments: Object.fromEntries(crews.map((crew) => [crew.id, { from: crew.from, to: crew.to, start: crew.from }])),
    })

    for (const crew of crews) {
      const team = saved.teams.find((item) => item.id === crew.id)
      expect(mapSortieButtons(team.sorties).find((button) => button.number === 2)).toEqual({
        number: 2,
        enabled: true,
      })
      const day = dayFor(crew.home, crew.from, crew.to, KTCC)
      const drawn = drawSavedTeam({ team, points, legWidths: widths })
      const sortie = drawn.sorties.find((item) => item.number === 2)
      expect(sortie.distanceNm).toBe(crew.sortie2Nm)
      expect(sortie.distanceNm).toBe(day.sorties[1].distanceNm)
      expect(formatSortieHeader(sortie, 'KTCC')).toBe(
        `Sortie 2: ${sortie.lanes} lanes, ${sortie.waypoints} waypoints, ${crew.sortie2Nm} NM (refuel at KTCC)`
      )
      const ends = refuelEnds(crew.home, KTCC, 2)
      const display = buildSerpentineDisplay(passesForSortie(drawn.overlay.passes, 2), undefined, ends)
      const file = buildTeamPlanSortieFile({
        team,
        points,
        legWidths: widths,
        routeLabel: 'VR114',
        sortieNumber: 2,
      })
      const fileNames = fplUserNames(file.xml)
      expect(display.labels.map((label) => label.name)).toEqual(fileNames)
      expect(fileNames.every((name) => /^[A-Z][A-Z0-9]{0,3}[1-9][IO]$/.test(name))).toBe(true)
      expect(display.airportLegs.map((leg) => [leg.role, leg.identifier, leg.caption])).toEqual([
        ['departure', 'KTCC', 'KTCC — refuel'],
        ['landing', crew.home.identifier, crew.home.identifier],
      ])
      expect(display.laneCaptions.length).toBeGreaterThan(0)
      expect(display.laneCaptions.every((caption) => caption.text.endsWith('right'))).toBe(true)
    }
  })

  it('disables Sortie 2 when the saved team has one sortie', () => {
    expect(mapSortieButtons([{ number: 1, side: 'inner', order: 'forward' }])).toEqual([
      { number: 1, enabled: true },
      { number: 2, enabled: false, title: ONE_SORTIE_TOOLTIP },
    ])
  })

  it('suggests a two-team split without a refuel stop', () => {
    const split = suggestTwoTeamSplit({
      points,
      legWidths: widths,
      teams: [
        { label: 'KABQ', lat: KABQ.latitude, lon: KABQ.longitude, identifier: 'KABQ' },
        { label: 'KSKX', lat: KSKX.latitude, lon: KSKX.longitude, identifier: 'KSKX' },
      ],
    })
    expect(split.days).toHaveLength(2)
    expect(split.days.every((item) => item.day.refuel == null)).toBe(true)
    expect(split.days.every((item) => item.day.sorties.length === 2)).toBe(true)
    const covered = validateTeamSegments(
      VR114,
      split.days.map((item) => ({ label: item.label, from: item.fromPt, to: item.toPt }))
    )
    expect(covered.ok).toBe(true)
  })
})
