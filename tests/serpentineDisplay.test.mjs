import { describe, expect, it } from 'vitest'
import { buildOffsetRoutes } from '../shared/survey-planning/offsetRoutePlan.js'
import { buildCoordinatorCrewOffsetFile } from '../src/services/coordinatorOffsetExport.ts'
import { serpentineFromTracks } from '../src/services/crewSerpentineOverlay.ts'
import {
  airportsForSortie,
  bearingDeg,
  buildSerpentineDisplay,
  DEFAULT_MAP_SORTIE,
  NO_DEPARTURE_AIRPORT_NOTE,
  NO_LANDING_AIRPORT_NOTE,
  passesForSortie,
  MAP_ROUTE_BLUE,
  standardRateRadiusNm,
} from '../src/services/serpentineDisplay.ts'

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

function vr114Widths(count) {
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }
  )
}

function angleDiff(a, b) {
  let delta = a - b
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return Math.abs(delta)
}

function distanceNm(a, b) {
  const φ1 = (a[1] * Math.PI) / 180
  const φ2 = (b[1] * Math.PI) / 180
  const dφ = ((b[1] - a[1]) * Math.PI) / 180
  const dλ = ((b[0] - a[0]) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return (2 * 6371000 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))) / 1852
}

function expectTangent(turn, prev, waypoint, next) {
  const inbound = bearingDeg({ lon: prev[0], lat: prev[1] }, { lon: waypoint[0], lat: waypoint[1] })
  const outbound = bearingDeg({ lon: waypoint[0], lat: waypoint[1] }, { lon: next[0], lat: next[1] })
  const toStart = bearingDeg(
    { lon: turn.center[0], lat: turn.center[1] },
    { lon: turn.start[0], lat: turn.start[1] }
  )
  const endCenter = turn.endCenter ?? turn.center
  const toEnd = bearingDeg(
    { lon: endCenter[0], lat: endCenter[1] },
    { lon: turn.end[0], lat: turn.end[1] }
  )
  expect(Math.abs(90 - angleDiff(toStart, inbound))).toBeLessThan(0.5)
  expect(Math.abs(90 - angleDiff(toEnd, outbound))).toBeLessThan(0.5)
  const alongInbound = bearingDeg(
    { lon: turn.start[0], lat: turn.start[1] },
    { lon: waypoint[0], lat: waypoint[1] }
  )
  const alongOutbound = bearingDeg(
    { lon: waypoint[0], lat: waypoint[1] },
    { lon: turn.end[0], lat: turn.end[1] }
  )
  expect(angleDiff(alongInbound, inbound)).toBeLessThan(0.5)
  expect(angleDiff(alongOutbound, outbound)).toBeLessThan(0.5)
  expect(distanceNm(turn.center, turn.waypoint)).toBeGreaterThan(turn.radiusNm * 1.01)
  expect(distanceNm(turn.center, turn.samples[0])).toBeCloseTo(turn.radiusNm, 2)
  expect(distanceNm(endCenter, turn.samples.at(-1))).toBeCloseTo(turn.radiusNm, 2)
}

describe('serpentine flyby display', () => {
  const points = vr114Points()
  const widths = vr114Widths(points.length - 1)
  const built = buildOffsetRoutes(points, widths)
  const team1 = serpentineFromTracks({
    id: 'team1',
    label: 'Team 1',
    sortie1Side: 'inner',
    inner: built.inner.waypoints,
    outer: built.outer.waypoints,
  })

  it('keeps each flyby arc tangent to both legs, with the waypoint outside the turn', () => {
    const corner = buildSerpentineDisplay([
      {
        number: 1,
        coordinates: [
          [-106, 35],
          [-106, 35.2],
          [-105.8, 35.2],
        ],
        waypoints: [
          { name: 'LA001', lon: -106, lat: 35 },
          { name: 'LB002', lon: -106, lat: 35.2 },
          { name: 'LC003', lon: -105.8, lat: 35.2 },
        ],
      },
    ])
    expect(corner.turns).toHaveLength(1)
    expect(corner.turns[0].kind).toBe('flyby')
    expect(corner.turns[0].radiusNm).toBeCloseTo(standardRateRadiusNm(), 5)
    expectTangent(corner.turns[0], [-106, 35], [-106, 35.2], [-105.8, 35.2])

    const reversal = buildSerpentineDisplay([
      {
        number: 1,
        coordinates: [
          [-106, 34.5],
          [-106, 35.2],
          [-105.95, 34.6],
        ],
        waypoints: [
          { name: 'LF006', lon: -106, lat: 34.5 },
          { name: 'LM1007', lon: -106, lat: 35.2 },
          { name: 'RM1007', lon: -105.95, lat: 34.6 },
        ],
      },
    ])
    expect(reversal.turns).toHaveLength(1)
    expect(reversal.turns[0].kind).toBe('teardrop')
    expectTangent(reversal.turns[0], [-106, 34.5], [-106, 35.2], [-105.95, 34.6])
  })

  it('does not change the crew .fpl output', () => {
    const strip = (xml) => xml.replace(/<created>[\s\S]*?<\/created>/, '')
    const before = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    const namesBefore = team1.passes.map((pass) => pass.names.slice())
    buildSerpentineDisplay(team1.passes)
    const after = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    expect(strip(after.xml)).toBe(strip(before.xml))
    expect(after.userNames).toEqual(before.userNames)
    expect(team1.passes.map((pass) => pass.names)).toEqual(namesBefore)
  })

  it('uses the crew .fpl waypoint names, in order, with entry and exit only on the ends', () => {
    const sortie1 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    const sortie2 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 2,
    })
    const display = buildSerpentineDisplay(team1.passes)
    const pass1Labels = display.labels.filter((label) => label.pass === 1)
    const pass2Labels = display.labels.filter((label) => label.pass === 2)
    expect(pass1Labels.map((label) => label.name)).toEqual(sortie1.userNames)
    expect(pass2Labels.map((label) => label.name)).toEqual(sortie2.userNames)

    const captions = display.labels.filter((label) => label.role)
    expect(captions.map((label) => label.role)).toEqual(['entry', 'exit'])
    expect(captions[0].name).toBe(team1.passes[0].waypoints[0].name)
    expect(captions[0].name).toBe(sortie1.userNames[0])
    expect(captions[0].lat).toBe(team1.passes[0].waypoints[0].lat)
    expect(captions[0].lon).toBe(team1.passes[0].waypoints[0].lon)
    expect(captions[1].name).toBe(team1.passes[1].waypoints.at(-1).name)
    expect(captions[1].name).toBe(sortie2.userNames.at(-1))
    expect(captions[1].lat).toBe(team1.passes[1].waypoints.at(-1).lat)
    expect(captions[1].lon).toBe(team1.passes[1].waypoints.at(-1).lon)
  })

  it('draws one arrow at the Pass 1 entry and one at the Pass 2 start', () => {
    const display = buildSerpentineDisplay(team1.passes)
    expect(display.arrows).toHaveLength(2)
    expect(display.arrows.map((arrow) => arrow.pass)).toEqual([1, 2])
    expect(display.arrows[0].name).toBe(team1.passes[0].waypoints[0].name)
    expect(display.arrows[1].name).toBe(team1.passes[1].waypoints[0].name)
  })

  it('puts one midpoint arrow on each VR114 leg that is long enough, with no turnaround ring', () => {
    const display = buildSerpentineDisplay(team1.passes)
    expect(display.crossoverLegs.length).toBeGreaterThan(0)
    const fromEnd = team1.passes[0].waypoints.at(-1)
    const toStart = team1.passes[1].waypoints[0]
    const blue = display.crossoverLegs[0]
    const legNm = distanceNm([fromEnd.lon, fromEnd.lat], [toStart.lon, toStart.lat])
    let blueNm = 0
    for (let index = 1; index < blue.length; index++) {
      blueNm += distanceNm(blue[index - 1], blue[index])
    }
    expect(blueNm).toBeGreaterThan(legNm * 0.7)
    expect(distanceNm(blue[0], [fromEnd.lon, fromEnd.lat])).toBeLessThan(2.1)
    expect(distanceNm(blue[blue.length - 1], [toStart.lon, toStart.lat])).toBeLessThan(2.1)
    expect({
      count: display.legArrows.length,
      skipped: display.skippedLegArrows.map((leg) => `${leg.fromName}->${leg.toName}`),
      turnaround: display.legArrows.filter((arrow) => arrow.turnaround).map((arrow) => `${arrow.fromName}->${arrow.toName}`),
    }).toEqual({ count: 13, skipped: [], turnaround: ['M1007I->M1007O'] })
    expect(JSON.stringify(display)).not.toContain('Turn around')

    const legs = []
    for (const pass of team1.passes) {
      for (let index = 0; index < pass.waypoints.length - 1; index++) {
        legs.push({ from: pass.waypoints[index], to: pass.waypoints[index + 1], turnaround: false })
      }
    }
    legs.push({
      from: team1.passes[0].waypoints.at(-1),
      to: team1.passes[1].waypoints[0],
      turnaround: true,
    })

    const placed = new Set(display.legArrows.map((arrow) => `${arrow.fromName}->${arrow.toName}`))
    const skipped = new Set(display.skippedLegArrows.map((arrow) => `${arrow.fromName}->${arrow.toName}`))
    expect(placed.size + skipped.size).toBe(legs.length)
    expect([...placed].filter((key) => skipped.has(key))).toEqual([])

    for (const leg of legs) {
      const key = `${leg.from.name}->${leg.to.name}`
      const arrow = display.legArrows.find((item) => item.fromName === leg.from.name && item.toName === leg.to.name)
      if (!arrow) {
        expect(skipped.has(key)).toBe(true)
        continue
      }
      expect(placed.has(key)).toBe(true)
      const half = distanceNm([leg.from.lon, leg.from.lat], [leg.to.lon, leg.to.lat]) / 2
      expect(distanceNm([leg.from.lon, leg.from.lat], [arrow.lon, arrow.lat])).toBeCloseTo(half, 1)
      expect(distanceNm([arrow.lon, arrow.lat], [leg.to.lon, leg.to.lat])).toBeCloseTo(half, 1)
      const flown = bearingDeg(leg.from, leg.to)
      expect(angleDiff(arrow.bearing, flown)).toBeLessThan(0.5)
      expect(arrow.turnaround).toBe(leg.turnaround)
      expect(arrow.color).toBe(MAP_ROUTE_BLUE)
      expect(MAP_ROUTE_BLUE).toBe('#3F00FF')
    }
  })

  it('draws no airport legs for VR114 when the plan has no airports', () => {
    const display = buildSerpentineDisplay(team1.passes)
    expect(display.airportLegs).toEqual([])
    expect(display.airportNotes).toEqual([NO_DEPARTURE_AIRPORT_NOTE, NO_LANDING_AIRPORT_NOTE])
  })

  it('draws dashed transit legs only for airports saved on the crew', () => {
    const departure = { identifier: 'KTCC', latitude: 35.1828, longitude: -103.603 }
    const landing = { identifier: 'KCVN', latitude: 34.4251, longitude: -103.079 }
    const display = buildSerpentineDisplay(team1.passes, undefined, { departure, landing })
    const entry = team1.passes[0].waypoints[0]
    const exit = team1.passes[1].waypoints.at(-1)
    expect(display.airportNotes).toEqual([])
    expect(display.airportLegs.map((leg) => leg.identifier)).toEqual(['KTCC', 'KCVN'])
    expect(display.airportLegs.map((leg) => leg.role)).toEqual(['departure', 'landing'])

    const outbound = display.airportLegs[0]
    const inbound = display.airportLegs[1]
    expect(outbound.coordinates).toEqual([
      [departure.longitude, departure.latitude],
      [entry.lon, entry.lat],
    ])
    expect(inbound.coordinates).toEqual([
      [exit.lon, exit.lat],
      [landing.longitude, landing.latitude],
    ])
    for (const leg of display.airportLegs) {
      const from = { lon: leg.coordinates[0][0], lat: leg.coordinates[0][1] }
      const to = { lon: leg.coordinates[1][0], lat: leg.coordinates[1][1] }
      const half = distanceNm(leg.coordinates[0], leg.coordinates[1]) / 2
      expect(leg.arrow).not.toBeNull()
      expect(distanceNm(leg.coordinates[0], [leg.arrow.lon, leg.arrow.lat])).toBeCloseTo(half, 1)
      expect(distanceNm([leg.arrow.lon, leg.arrow.lat], leg.coordinates[1])).toBeCloseTo(half, 1)
      expect(angleDiff(leg.arrow.bearing, bearingDeg(from, to))).toBeLessThan(0.5)
      expect(leg.arrow.color).toBe(MAP_ROUTE_BLUE)
    }
    const flowText = JSON.stringify(display.flow)
    expect(flowText).not.toContain(String(departure.longitude))
    expect(flowText).not.toContain(String(landing.longitude))

    const departureOnly = buildSerpentineDisplay(team1.passes, undefined, { departure, landing: null })
    expect(departureOnly.airportLegs.map((leg) => leg.identifier)).toEqual(['KTCC'])
    expect(departureOnly.airportNotes).toEqual([NO_LANDING_AIRPORT_NOTE])
  })

  it('shows Sortie 1 by default and only Sortie 2 after the switch, without changing the .fpl', () => {
    expect(DEFAULT_MAP_SORTIE).toBe(1)
    const sortie1Passes = passesForSortie(team1.passes, DEFAULT_MAP_SORTIE)
    const sortie2Passes = passesForSortie(team1.passes, 2)
    expect(sortie1Passes.map((pass) => pass.number)).toEqual([1])
    expect(sortie2Passes.map((pass) => pass.number)).toEqual([2])
    expect(passesForSortie([team1.passes[0]], 2)).toEqual([team1.passes[0]])

    const file = (sortieNumber) =>
      buildCoordinatorCrewOffsetFile({
        routeLabel: 'VR114',
        points,
        legWidths: widths,
        sortie1Side: 'inner',
        sortieNumber,
      })
    const strip = (xml) => xml.replace(/<created>[\s\S]*?<\/created>/, '')
    const before1 = file(1)
    const before2 = file(2)

    const day1 = buildSerpentineDisplay(sortie1Passes)
    const day2 = buildSerpentineDisplay(sortie2Passes)

    expect(strip(file(1).xml)).toBe(strip(before1.xml))
    expect(strip(file(2).xml)).toBe(strip(before2.xml))
    expect(file(1).userNames).toEqual(before1.userNames)
    expect(file(2).userNames).toEqual(before2.userNames)

    expect(day1.labels.map((label) => label.name)).toEqual(before1.userNames)
    expect(day2.labels.map((label) => label.name)).toEqual(before2.userNames)
    expect(day1.labels.filter((label) => label.role).map((label) => [label.role, label.name])).toEqual([
      ['entry', before1.userNames[0]],
      ['exit', before1.userNames.at(-1)],
    ])
    expect(day2.labels.filter((label) => label.role).map((label) => [label.role, label.name])).toEqual([
      ['entry', before2.userNames[0]],
      ['exit', before2.userNames.at(-1)],
    ])
    expect(day1.crossoverLegs).toEqual([])
    expect(day2.crossoverLegs).toEqual([])
    expect(day1.legArrows.filter((arrow) => arrow.turnaround)).toEqual([])
    expect(day2.legArrows.filter((arrow) => arrow.turnaround)).toEqual([])
    expect(day1.arrows.map((arrow) => arrow.pass)).toEqual([1])
    expect(day2.arrows.map((arrow) => arrow.pass)).toEqual([2])
    expect(day1.legArrows.map((arrow) => `${arrow.fromName}->${arrow.toName}`)).toEqual(
      before1.userNames.slice(0, -1).map((name, index) => `${name}->${before1.userNames[index + 1]}`)
    )
    expect(day2.legArrows.map((arrow) => `${arrow.fromName}->${arrow.toName}`)).toEqual(
      before2.userNames.slice(0, -1).map((name, index) => `${name}->${before2.userNames[index + 1]}`)
    )

    const swapped = airportsForSortie(2, {
      departure: { identifier: 'KTCC', latitude: 35.18, longitude: -103.6 },
      landing: { identifier: 'KCVN', latitude: 34.42, longitude: -103.08 },
    })
    expect(swapped.departure.identifier).toBe('KCVN')
    expect(swapped.landing.identifier).toBe('KTCC')
    const day2Transit = buildSerpentineDisplay(sortie2Passes, undefined, swapped)
    expect(day2Transit.airportLegs.map((leg) => [leg.role, leg.identifier])).toEqual([
      ['departure', 'KCVN'],
      ['landing', 'KTCC'],
    ])
    expect(day2Transit.airportLegs[0].coordinates[1]).toEqual([
      sortie2Passes[0].waypoints[0].lon,
      sortie2Passes[0].waypoints[0].lat,
    ])
    const last = sortie2Passes[0].waypoints.at(-1)
    expect(day2Transit.airportLegs[1].coordinates[0]).toEqual([last.lon, last.lat])
  })
})
