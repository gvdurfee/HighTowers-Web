import { describe, expect, it } from 'vitest'
import { assignG1000WaypointNames } from '../shared/survey-planning/g1000Names.js'
import { planTeamSegmentDay } from '../shared/survey-planning/segmentAssignment.js'
import {
  assignmentEditsForOption,
  compareSurveyPlans,
  PER_SEGMENT_SPACING_NOTE,
} from '../shared/survey-planning/planComparison.js'
import { draftTeamPlan } from '../src/services/teamPlanRecord.ts'
import {
  buildTeamPlanSortieFile,
  publishedSortieWidthReady,
  teamSortieDownloadOffer,
} from '../src/services/teamPlanSortieDownload.ts'

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

function points() {
  const rows = VR114.map((point, index) => ({
    ptIdent: point,
    originalName: `VR114-${point}`,
    lat: VR114_COORDS[index][0],
    lon: VR114_COORDS[index][1],
  }))
  const named = assignG1000WaypointNames(rows.map((point) => ({ originalName: point.originalName })))
  rows.forEach((point, index) => {
    point.g1000Name = named.names[index].g1000Name
  })
  return rows
}

function widths() {
  return VR114.slice(0, -1).map((_, index) => (index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }))
}

function records(routePoints) {
  return routePoints.map((point, index) => ({
    id: `wp-${point.ptIdent}`,
    flightPlanId: 'vr114',
    originalName: point.originalName,
    g1000Name: point.g1000Name,
    latitude: point.lat,
    longitude: point.lon,
    routeType: 'VR',
    sequence: index,
  }))
}

function routeIdents(xml, kind) {
  const route = xml.slice(xml.indexOf('<route>'), xml.indexOf('</route>'))
  return [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>\s*<waypoint-type>([^<]*)<\/waypoint-type>/g)]
    .filter((match) => match[2].includes(kind))
    .map((match) => match[1])
}

function savedPlan() {
  return draftTeamPlan({
    flightPlanId: 'vr114',
    savedAt: '2026-10-23T18:00:00.000Z',
    crews: [
      { id: 'team1', label: 'Team 1', departure: KABQ, refuelStop: KTCC },
      { id: 'team2', label: 'Team 2', departure: KSKX, refuelStop: KTCC },
      { id: 'team3', label: 'Team 3', departure: KLRU, refuelStop: KTCC },
    ],
    sides: { team1: 'inner', team2: 'inner', team3: 'inner' },
    segments: {
      team1: { from: 'B', to: 'E', start: 'B' },
      team2: { from: 'A', to: 'B', start: 'A' },
      team3: { from: 'E', to: 'M1', start: 'E' },
    },
  })
}

describe('VR114 plan comparison', () => {
  const routePoints = points()
  const comparison = compareSurveyPlans({
    points: routePoints,
    legWidths: widths(),
    homes: [KSKX, KABQ, KLRU],
    refuel: KTCC,
    saved: [
      { identifier: 'KSKX', from: 'A', to: 'B', refuel: true },
      { identifier: 'KABQ', from: 'B', to: 'E', refuel: true },
      { identifier: 'KLRU', from: 'E', to: 'M1', refuel: true },
    ],
    budgetNm: 500,
  })

  it('reproduces each option and recommends the fewest refuel stops under 500 NM', () => {
    expect(comparison.perSegmentSpacing).toBe(false)
    expect(comparison.spacingNote).toBe(PER_SEGMENT_SPACING_NOTE)
    expect(comparison.options.map((option) => option.id)).toEqual(['saved', 'klru-refuel', 'kabq-kskx', 'kabq-klru'])

    const saved = comparison.options[0]
    expect(saved.teams.map((team) => [team.identifier, team.from, team.to, team.sorties.map((sortie) => sortie.distanceNm)])).toEqual([
      ['KSKX', 'A', 'B', [377.3, 377.3]],
      ['KABQ', 'B', 'E', [304.1, 402.9]],
      ['KLRU', 'E', 'M1', [304.8, 327.6]],
    ])
    expect(saved.allUnder).toBe(true)
    expect(saved.refuelStops).toBe(3)

    const eligible = comparison.options.filter((option) => option.allUnder)
    eligible.sort((a, b) => a.refuelStops - b.refuelStops || a.wingNm - b.wingNm)
    expect(comparison.options.filter((option) => option.recommended).map((option) => option.id)).toEqual([eligible[0].id])
    expect(eligible[0].id).toBe('klru-refuel')
    expect(eligible[0].refuelStops).toBe(1)

    const nudged = comparison.options.find((option) => option.id === 'kabq-kskx')
    expect(nudged.allUnder).toBe(false)
    expect(nudged.boundaryNote).toContain('503.6')
    expect(nudged.teams[0].sorties.every((sortie) => !sortie.overBudget)).toBe(true)
    expect(nudged.insertedPoint.alongNm).toBeGreaterThan(0)
    expect(nudged.boundaryNote).toContain(PER_SEGMENT_SPACING_NOTE)
  })

  it('loads an option into the assignment form without a saved plan', () => {
    const option = comparison.options.find((item) => item.id === 'klru-refuel')
    const edits = assignmentEditsForOption(option, [
      { id: 'team1', identifier: 'KABQ' },
      { id: 'team2', identifier: 'KSKX' },
      { id: 'team3', identifier: 'KLRU' },
    ])
    expect(edits.segments.team1.from).toBe(option.teams.find((team) => team.identifier === 'KABQ').from)
    expect(edits.segments.team1.to).toBe(option.teams.find((team) => team.identifier === 'KABQ').to)
    expect(edits.refuels.team1).toBeNull()
    expect(edits.refuels.team3?.identifier).toBe('KTCC')
    expect(edits.insertedPoint).toBeNull()
  })
})

describe('team plan sortie downloads', () => {
  const routePoints = points()
  const plan = savedPlan()
  const created = new Date('2026-10-23T18:00:00Z')

  it('matches the console export for each VR114 team, with KTCC on the refuel end', () => {
    for (const team of plan.teams) {
      for (const number of [1, 2]) {
        const offer = teamSortieDownloadOffer(team, number, true)
        expect(offer.enabled).toBe(true)
        const home = team.departure
        const day = planTeamSegmentDay({
          points: routePoints,
          legWidths: widths(),
          fromPt: team.segmentFrom,
          toPt: team.segmentTo,
          home: { lat: home.latitude, lon: home.longitude, identifier: home.identifier },
          refuel: { lat: KTCC.latitude, lon: KTCC.longitude, identifier: KTCC.identifier },
          sortie1Side: 'left',
          budgetNm: 500,
        })
        const sortie = day.sorties.find((item) => item.number === number)
        const departure = number === 1 ? home : KTCC
        const destination = number === 1 ? KTCC : home
        const mapFile = buildTeamPlanSortieFile({
          team,
          points: routePoints,
          legWidths: widths(),
          waypoints: records(routePoints),
          routeLabel: 'VR114',
          sortieNumber: number,
          created,
        })
        expect(mapFile.filename).toBe(`VR114_${home.identifier}_S${number}.fpl`)
        expect(routeIdents(mapFile.xml, 'AIRPORT')).toEqual([departure.identifier, destination.identifier])
        const users = routeIdents(mapFile.xml, 'USER')
        expect(users.length).toBeGreaterThan(0)
        expect(users.every((name) => /^[A-Z0-9]{1,6}$/.test(name))).toBe(true)
        expect(users).not.toEqual(sortie.routeSequence)
      }
    }
  })

  it('disables a download the team does not fly', () => {
    const one = { ...plan.teams[0], sorties: [plan.teams[0].sorties[0]] }
    const offer = teamSortieDownloadOffer(one, 2, true)
    expect(offer.enabled).toBe(false)
    expect(offer.title).toBe('This team flies one sortie')
  })

  it('treats a blank width box as missing, not as a corridor', () => {
    const team = plan.teams[0]
    const routePoints = points()
    const blank = widths().map(() => ({ leftNm: 0, rightNm: 0 }))
    expect(publishedSortieWidthReady(team, routePoints, blank, 1)).toBe(false)
    expect(publishedSortieWidthReady(team, routePoints, widths(), 1)).toBe(true)
    const offer = teamSortieDownloadOffer(team, 1, false)
    expect(offer.enabled).toBe(false)
    expect(offer.title).toBe('No published width for this segment.')
  })
})
