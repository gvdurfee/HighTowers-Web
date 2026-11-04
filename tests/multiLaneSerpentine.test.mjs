import { describe, expect, it } from 'vitest'
import { assignG1000WaypointNames } from '../shared/survey-planning/g1000Names.js'
import { parallelOffsetsForHalfWidth } from '../shared/survey-planning/surveyGeometry.js'
import { bestSortiePlan, buildUniformOffsetSegments } from '../shared/survey-planning/surveySortiePacker.js'
import { buildSerpentineRouteSequence } from '../shared/survey-planning/surveySortieFplRoute.js'
import { G1000Service } from '../src/services/g1000.ts'
import { airportsForSortie, buildSerpentineDisplay, passesForSortie } from '../src/services/serpentineDisplay.ts'
import { draftTeamPlan, drawSavedTeam, formatSortieHeader } from '../src/services/teamPlanRecord.ts'
import { buildTeamPlanSortieFile } from '../src/services/teamPlanSortieDownload.ts'

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

function teamPlan(crews) {
  return draftTeamPlan({
    flightPlanId: 'vr114',
    savedAt: '2026-10-23T16:00:00.000Z',
    firstOffsetNm: 3,
    stepNm: 6,
    crews: crews.map((crew) => ({
      id: crew.id,
      label: crew.label,
      departure: crew.departure,
      landing: crew.landing ?? crew.departure,
    })),
    sides: Object.fromEntries(crews.map((crew) => [crew.id, crew.side])),
    segments: Object.fromEntries(crews.map((crew) => [crew.id, { from: crew.from, to: crew.to, start: crew.from }])),
  })
}

function sliceRange(points, widths, from, to) {
  const start = points.findIndex((point) => point.ptIdent === from)
  const end = points.findIndex((point) => point.ptIdent === to)
  return { points: points.slice(start, end + 1), widths: widths.slice(start, end) }
}

/** The Console .fpl for one side, built from the export functions and not from the map. */
function consoleSide(points, widths, side, departure, landing, policy = {}) {
  const wps = points.map((point, index) => ({
    ptIdent: point.ptIdent,
    lat: point.lat,
    lon: point.lon,
    g1000Name: point.g1000Name,
    nextPt: points[index + 1]?.ptIdent,
  }))
  const legs = widths.map((width, index) => ({
    fromPt: wps[index].ptIdent,
    toPt: wps[index + 1].ptIdent,
    leftOffsets: parallelOffsetsForHalfWidth(width.leftNm, policy),
    rightOffsets: parallelOffsetsForHalfWidth(width.rightNm, policy),
  }))
  const segments = buildUniformOffsetSegments(wps, legs, side)
  const team = { label: departure.identifier, depLat: departure.latitude, depLon: departure.longitude, side }
  const pieces = segments.map((segment) => {
    const plan = bestSortiePlan(wps, team, segment.startIdx, segment.endIdx, segment.offsets, {
      ferryInPt: { lat: departure.latitude, lon: departure.longitude, label: departure.identifier },
      ferryOutPt: { lat: landing.latitude, lon: landing.longitude, label: landing.identifier },
    })
    const fragment = wps.slice(segment.startIdx, segment.endIdx + 1)
    const sequence = buildSerpentineRouteSequence(fragment, plan.startAt, plan.offsets)
    return { plan, sequence: sequence.routeSequence, fragment }
  })
  const distanceNm =
    pieces.length === 1
      ? pieces[0].plan.totalNm
      : Math.round(pieces.reduce((sum, piece) => sum + piece.plan.totalNm, 0) * 10) / 10
  return {
    offsetsNm: pieces.length === 1 ? [...pieces[0].plan.offsets] : pieces.flatMap((piece) => piece.plan.offsets),
    routeSequence: pieces.flatMap((piece) => piece.sequence),
    distanceNm,
    pieces,
  }
}

function fplUserNamesFrom(xml) {
  const route = xml.slice(xml.indexOf('<route>'), xml.indexOf('</route>'))
  return [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>\s*<waypoint-type>([^<]*)<\/waypoint-type>/g)]
    .filter((match) => match[2].includes('USER'))
    .map((match) => match[1])
}

function fplUserNames(routeSequence, departure, landing, sortieNumber) {
  const xml = G1000Service.generateSortieFlightPlan({
    routeLabel: 'VR114',
    sortieNumber,
    departureAirport: departure,
    destinationAirport: landing,
    fragmentWaypoints: routeSequence.map((name) => ({ g1000Name: name, latitude: 0, longitude: 0 })),
    routeSequence,
  })
  const route = xml.slice(xml.indexOf('<route>'), xml.indexOf('</route>'))
  return [...route.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>\s*<waypoint-type>([^<]*)<\/waypoint-type>/g)]
    .filter((match) => match[2].includes('USER'))
    .map((match) => match[1])
}

function drawSortie(plan, teamId, sortieNumber, points, widths, policy = {}) {
  const team = plan.teams.find((item) => item.id === teamId)
  const drawn = drawSavedTeam({
    team,
    points,
    legWidths: widths,
    firstOffsetNm: policy.firstOffsetNm,
    stepNm: policy.stepNm,
  })
  const passes = passesForSortie(drawn.overlay.passes, sortieNumber)
  const summary = drawn.sorties.find((sortie) => sortie.number === sortieNumber)
  const ends = airportsForSortie(sortieNumber, { departure: team.departure, landing: team.landing })
  const display = buildSerpentineDisplay(passes, undefined, ends)
  return { drawn, passes, summary, display, ends }
}

describe('multi-lane map serpentine', () => {
  const points = vr114Points()
  const widths = vr114Widths()

  it('matches the KABQ B–D sortie .fpl on both sides', () => {
    const plan = teamPlan([
      { id: 'team1', label: 'Team 1', departure: KABQ, landing: KLRU, from: 'B', to: 'D', side: 'outer' },
    ])
    const slice = sliceRange(points, widths, 'B', 'D')

    const day1 = drawSortie(plan, 'team1', 1, points, widths)
    const console1 = consoleSide(slice.points, slice.widths, 'right', KABQ, KLRU)
    expect(day1.summary.offsetsNm).toEqual([3, 9, 15])
    const file1 = buildTeamPlanSortieFile({
      team: plan.teams[0],
      points,
      legWidths: widths,
      routeLabel: 'VR114',
      sortieNumber: 1,
    })
    expect(day1.display.labels.map((label) => label.name)).toEqual(fplUserNamesFrom(file1.xml))
    expect(day1.display.labels.every((label) => /^[A-Z][A-Z0-9]{0,3}[1-9]O$/.test(label.name))).toBe(true)
    expect(day1.display.laneCaptions.map((caption) => caption.text)).toEqual(['3 NM right', '9 NM right', '15 NM right'])
    expect(day1.ends).toEqual({ departure: KABQ, landing: KLRU })

    const day2 = drawSortie(plan, 'team1', 2, points, widths)
    const console2 = consoleSide(slice.points, slice.widths, 'left', KLRU, KABQ)
    expect(day2.summary.offsetsNm).toEqual([3, 9])
    const file2 = buildTeamPlanSortieFile({
      team: plan.teams[0],
      points,
      legWidths: widths,
      routeLabel: 'VR114',
      sortieNumber: 2,
    })
    expect(day2.display.labels.map((label) => label.name)).toEqual(fplUserNamesFrom(file2.xml))
    expect(day2.display.labels.every((label) => /^[A-Z][A-Z0-9]{0,3}[1-9]I$/.test(label.name))).toBe(true)
    expect(day2.display.laneCaptions.map((caption) => caption.text)).toEqual(['3 NM left', '9 NM left'])
    expect(day2.ends.departure.identifier).toBe('KLRU')
    expect(day2.ends.landing.identifier).toBe('KABQ')
  })

  it('updates lanes when the spacing changes', () => {
    const plan = teamPlan([
      { id: 'team1', label: 'Team 1', departure: KABQ, from: 'B', to: 'D', side: 'outer' },
    ])
    const step4 = drawSortie(plan, 'team1', 1, points, widths, { firstOffsetNm: 3, stepNm: 4 })
    const step4Other = drawSortie(plan, 'team1', 2, points, widths, { firstOffsetNm: 3, stepNm: 4 })
    expect(step4.summary.offsetsNm).toEqual([3, 7, 11, 15, 19])
    expect(step4.display.laneCaptions.map((caption) => caption.text)).toEqual([
      '3 NM right',
      '7 NM right',
      '11 NM right',
      '15 NM right',
      '19 NM right',
    ])
    expect(step4Other.summary.offsetsNm).toEqual([3, 7])

    const step8 = drawSortie(plan, 'team1', 1, points, widths, { firstOffsetNm: 3, stepNm: 8 })
    const step8Other = drawSortie(plan, 'team1', 2, points, widths, { firstOffsetNm: 3, stepNm: 8 })
    expect(step8.summary.offsetsNm).toEqual([3, 11, 19])
    expect(step8Other.summary.offsetsNm).toEqual([3])
  })

  it('uses the Console sortie distance for every VR114 team', () => {
    const plan = teamPlan([
      { id: 'team1', label: 'Team 1', departure: KLRU, from: 'A', to: 'B', side: 'inner' },
      { id: 'team2', label: 'Team 2', departure: KABQ, from: 'B', to: 'D', side: 'outer' },
      { id: 'team3', label: 'Team 3', departure: KSKX, from: 'D', to: 'M1', side: 'inner' },
    ])
    const expected = [
      { from: 'A', to: 'B', airport: KLRU, sortie1: 'left', sortie2: 'right' },
      { from: 'B', to: 'D', airport: KABQ, sortie1: 'right', sortie2: 'left' },
      { from: 'D', to: 'M1', airport: KSKX, sortie1: 'left', sortie2: 'right' },
    ]
    plan.teams.forEach((team, index) => {
      const slice = sliceRange(points, widths, expected[index].from, expected[index].to)
      for (const number of [1, 2]) {
        const side = number === 1 ? expected[index].sortie1 : expected[index].sortie2
        const drawn = drawSortie(plan, team.id, number, points, widths)
        const consolePlan = consoleSide(slice.points, slice.widths, side, expected[index].airport, expected[index].airport)
        expect(drawn.summary.distanceNm).toBe(consolePlan.distanceNm)
        expect(drawn.summary.waypoints).toBe(consolePlan.routeSequence.length)
        expect(formatSortieHeader(drawn.summary)).toBe(
          `Sortie ${number}: ${consolePlan.offsetsNm.length} lanes, ${consolePlan.routeSequence.length} waypoints, ${consolePlan.distanceNm} NM`
        )
      }
    })
  })

  it('draws one turnaround between lanes and one midpoint arrow on every leg', () => {
    const plan = teamPlan([
      { id: 'team1', label: 'Team 1', departure: KLRU, from: 'A', to: 'B', side: 'inner' },
      { id: 'team2', label: 'Team 2', departure: KABQ, from: 'B', to: 'D', side: 'outer' },
      { id: 'team3', label: 'Team 3', departure: KSKX, from: 'D', to: 'M1', side: 'inner' },
    ])
    for (const team of plan.teams) {
      for (const number of [1, 2]) {
        const drawn = drawSortie(plan, team.id, number, points, widths)
        const yellow = drawn.passes.reduce((sum, pass) => sum + pass.waypoints.length - 1, 0)
        expect(drawn.display.crossoverLegs).toHaveLength(drawn.passes.length - 1)
        expect(drawn.display.legArrows.filter((arrow) => arrow.turnaround)).toHaveLength(drawn.passes.length - 1)
        expect(drawn.display.legArrows.filter((arrow) => !arrow.turnaround)).toHaveLength(yellow)
        expect(drawn.display.skippedLegArrows).toEqual([])
        expect(drawn.display.laneCaptions).toHaveLength(drawn.passes.length)
      }
    }
  })

  it('stops a lane at the published edge where the width changes', () => {
    const plan = teamPlan([
      { id: 'team1', label: 'Team 1', departure: KABQ, from: 'A', to: 'D', side: 'inner' },
    ])
    const slice = sliceRange(points, widths, 'A', 'D')
    const drawn = drawSortie(plan, 'team1', 1, points, widths)
    const consolePlan = consoleSide(slice.points, slice.widths, 'left', KABQ, KABQ)
    expect(consolePlan.pieces.map((piece) => piece.plan.offsets)).toEqual([
      [3, 9, 15],
      [3, 9],
    ])
    const wide = drawn.passes.filter((pass) => pass.offsetNm === 15)
    expect(wide).toHaveLength(1)
    expect(wide[0].names.every((name) => /^[AB]3I$/.test(name))).toBe(true)
    expect(drawn.display.crossoverLegs).toHaveLength(drawn.passes.length - consolePlan.pieces.length)
  })
})
