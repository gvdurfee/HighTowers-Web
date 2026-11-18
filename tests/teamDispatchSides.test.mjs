import { describe, expect, it } from 'vitest'
import { buildOffsetTrack, crossTrackNm, segmentCurveSide } from '../shared/survey-planning/offsetRoutePlan.js'
import { nauticalMilesBetween } from '../shared/survey-planning/surveyGeometry.js'
import { planDispatchSorties, attachPackedSorties } from '../src/services/teamDispatchSorties.ts'
import { absoluteLaneNumber, buildTeamSortieFile, draftTeamPlan, packedDownloadLabel, packedSortieFilename, teamSortieOffsetRoute } from '../src/services/teamPlanRecord.ts'
import { saveBlocker } from '../src/services/teamDispatchReview.ts'
import { neighborSideWarning, staffingForPlan } from '../src/services/teamDispatchWizard.ts'
import { applySpacingToRows } from '../src/utils/coordinatorSpanTrackPlan.ts'

const POINTS = [
  { ptIdent: 'A', lat: 34.64166666, lon: -102.9 },
  { ptIdent: 'B', lat: 35.7, lon: -102.96666666 },
  { ptIdent: 'C', lat: 35.58333333, lon: -103.63333333 },
  { ptIdent: 'D', lat: 35.53333333, lon: -103.94166666 },
  { ptIdent: 'E', lat: 35.05833333, lon: -104.04166666 },
  { ptIdent: 'F', lat: 34.825, lon: -103.74166666 },
  { ptIdent: 'M1', lat: 34.65, lon: -103.78333333 },
]

const AIRPORTS = [
  { identifier: 'KLRU', latitude: 32.289417, longitude: -106.921972 },
  { identifier: 'KABQ', latitude: 35.040194, longitude: -106.609139 },
  { identifier: 'KSKX', latitude: 36.458222, longitude: -105.671667 },
]

const REFUEL = { identifier: 'KTCC', latitude: 35.182778, longitude: -103.603194 }

function spans() {
  return applySpacingToRows(
    POINTS.slice(0, -1).map((point, index) => {
      const to = POINTS[index + 1]
      const wide = point.ptIdent === 'A'
      return {
        fromPt: point.ptIdent,
        toPt: to.ptIdent,
        leftNm: wide ? '20' : '10',
        rightNm: '20',
        leftOffsetsText: '',
        rightOffsetsText: '',
        displayText: `${point.ptIdent}→${to.ptIdent}`,
      }
    }),
    { firstOffsetNm: 2.5, stepNm: 5 }
  )
}

function plan(sides) {
  return planDispatchSorties({
    aircraftCount: 3,
    routeType: 'VR',
    routeNumber: '114',
    waypoints: POINTS,
    widthTexts: [],
    spans: spans(),
    firstOffsetNm: 2.5,
    stepNm: 5,
    sortieBudgetNm: 400,
    ferryMode: 'staged-refuel',
    refuel: REFUEL,
    airports: AIRPORTS,
    sides,
  })
}

function pathNm(xml) {
  const table = new Map()
  for (const match of xml.matchAll(/<identifier>([^<]+)<\/identifier>[\s\S]*?<lat>([-0-9.]+)<\/lat>\s*<lon>([-0-9.]+)<\/lon>/g)) {
    table.set(match[1], { lat: Number(match[2]), lon: Number(match[3]) })
  }
  const points = [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)]
    .map((match) => table.get(match[1]))
    .filter(Boolean)
  let total = 0
  for (let index = 1; index < points.length; index += 1) total += nauticalMilesBetween(points[index - 1], points[index])
  return Math.round(total * 10) / 10
}

describe('sortie sides', () => {
  it('does not preselect a side', () => {
    const draft = staffingForPlan({
      count: 3,
      draft: {
        spans: [],
        firstOffsetNm: 2.5,
        stepNm: 5,
        sortieBudgetNm: 400,
        ferryMode: 'staged-refuel',
        refuel: null,
        refuelFuelConfirmed: false,
        aircraftCount: 3,
        teams: {
          team1: { code: 'KLRU', airport: { identifier: 'KLRU', name: 'KLRU', latitude: 0, longitude: 0 } },
          team2: { code: 'KABQ', airport: { identifier: 'KABQ', name: 'KABQ', latitude: 0, longitude: 0 } },
          team3: { code: 'KSKX', airport: { identifier: 'KSKX', name: 'KSKX', latitude: 0, longitude: 0 } },
        },
        crewSides: { team1: null, team2: null, team3: null },
        segments: { team1: null, team2: null, team3: null },
      },
      points: POINTS,
      innerSide: 'left',
      replaceSides: true,
      segmentAssignments: [
        { teamLabel: 'KLRU', waypointFrom: 'A', waypointTo: 'B', startIdx: 0 },
        { teamLabel: 'KABQ', waypointFrom: 'B', waypointTo: 'D', startIdx: 1 },
        { teamLabel: 'KSKX', waypointFrom: 'D', waypointTo: 'M1', startIdx: 3 },
      ],
    })
    expect(draft.crewSides).toEqual({ team1: null, team2: null, team3: null })
  })

  it('saves the side each crew picked on a staged three-aircraft plan', () => {
    const counts = []
    for (const sides of [
      { KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' },
      { KLRU: 'outer', KABQ: 'inner', KSKX: 'outer' },
    ]) {
      const dispatch = plan(sides)
      if ('error' in dispatch) throw new Error(dispatch.error)
      counts.push(dispatch.totalSorties)
      expect('error' in dispatch).toBe(false)
      if ('error' in dispatch) continue
      for (const crew of dispatch.teams) {
        const first = crew.sorties.find((sortie) => sortie.side)
        expect(first?.side).toBe(sides[crew.ident])
        const over = crew.sorties.filter((sortie) => sortie.distanceNm > 400)
        if (over.length) throw new Error(JSON.stringify(over.map((sortie) => ({ n: sortie.number, nm: sortie.distanceNm, from: sortie.fromPt, to: sortie.toPt, side: sortie.side, lanes: sortie.offsetsNm }))))
      }
      const saved = attachPackedSorties(
        draftTeamPlan({
          flightPlanId: 'vr114',
          savedAt: '2026-11-14T00:00:00.000Z',
          crews: AIRPORTS.map((airport, index) => ({
            id: `team${index + 1}`,
            label: `Team ${index + 1}`,
            departure: { identifier: airport.identifier, name: airport.identifier, latitude: airport.latitude, longitude: airport.longitude },
          })),
          sides,
          segments: {},
        }),
        dispatch
      )
      for (const team of saved.teams) {
        const packedSides = (team.packedSorties ?? []).map((sortie) => sortie.side)
        expect(team.sorties.map((sortie) => sortie.side)).toEqual(packedSides)
      }
    }
    expect(counts[0]).toBe(counts[1])
  })

  it('tags the inside of a right-hand turn as right', () => {
    const curve = segmentCurveSide(
      [
        { ptIdent: 'A', lat: 35, lon: -104 },
        { ptIdent: 'B', lat: 35, lon: -103 },
        { ptIdent: 'C', lat: 34, lon: -103 },
      ],
      'A',
      'C'
    )
    expect(curve.innerSide).toBe('right')
    expect(curve.outerSide).toBe('left')
  })

  it('warns only when neighboring crews picked the same side', () => {
    expect(
      neighborSideWarning([
        { label: 'Team 1', side: 'inner' },
        { label: 'Team 2', side: 'outer' },
      ])
    ).toBeNull()
    expect(
      neighborSideWarning([
        { label: 'Team 1', side: 'inner' },
        { label: 'Team 2', side: 'inner' },
      ])
    ).toMatch(/both fly inner/)
    expect(
      neighborSideWarning([
        { label: 'Team 1', ident: 'KABQ', side: 'inner', from: 'A', to: 'Q1' },
        { label: 'Team 2', ident: 'KSAF', side: 'outer', from: 'A', to: 'Q1' },
      ])
    ).toBe('Both aircraft fly the same route, KABQ on the inner side and KSAF on the outer side.')
  })
})

describe('packed sortie files', () => {
  it('matches the saved sortie distance and uses absolute lane numbers', () => {
    const dispatch = plan({ KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' })
    expect('error' in dispatch).toBe(false)
    if ('error' in dispatch) return
    const klru = dispatch.teams.find((crew) => crew.ident === 'KLRU')
    const first = klru.sorties.find((sortie) => sortie.side)
    expect(packedDownloadLabel('KLRU', first, POINTS)).toMatch(/Download KLRU Sortie 1, Inner \([a-z]+ side\) \.fpl/)
    expect(first.side).toBe('inner')
    const saved = attachPackedSorties(
      draftTeamPlan({
        flightPlanId: 'vr114',
        savedAt: '2026-11-14T00:00:00.000Z',
        firstOffsetNm: 2.5,
        stepNm: 5,
        crews: dispatch.teams.map((crew, index) => ({
          id: `team${index + 1}`,
          label: crew.ident,
          departure: {
            identifier: crew.ident,
            name: crew.ident,
            latitude: AIRPORTS.find((airport) => airport.identifier === crew.ident)?.latitude ?? 0,
            longitude: AIRPORTS.find((airport) => airport.identifier === crew.ident)?.longitude ?? 0,
          },
          refuelStop: { identifier: 'KTCC', name: 'KTCC', latitude: REFUEL.latitude, longitude: REFUEL.longitude },
        })),
        sides: { KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' },
        segments: Object.fromEntries(dispatch.teams.map((crew, index) => [`team${index + 1}`, { from: crew.fromPt, to: crew.toPt, start: crew.fromPt }])),
      }),
      dispatch
    )
    const names = []
    for (const team of saved.teams) {
      for (const sortie of team.packedSorties ?? []) {
        const filename = packedSortieFilename('VR114', team.departure?.identifier ?? sortie.departureIdent, sortie.fromPt, sortie.toPt, sortie.number)
        names.push(filename)
        expect(filename).not.toMatch(/__/)
        if (sortie.returnHomeOnly || sortie.offsetsNm.length === 0) {
          const file = buildTeamSortieFile({
            team,
            routeLabel: 'VR114',
            points: POINTS,
            legWidths: spans().map((row) => ({ leftNm: Number(row.leftNm), rightNm: Number(row.rightNm) })),
            sortieNumber: sortie.number,
            firstOffsetNm: 2.5,
            stepNm: 5,
          })
          expect(file).toEqual({ ferryOnly: true })
          continue
        }
        for (const offset of sortie.offsetsNm) {
          expect(absoluteLaneNumber(offset, 2.5, 5)).toBeGreaterThan(0)
          if (offset === 2.5) expect(absoluteLaneNumber(offset, 2.5, 5)).toBe(1)
        }
        const file = buildTeamSortieFile({
          team,
          routeLabel: 'VR114',
          points: POINTS,
          legWidths: spans().map((row) => ({ leftNm: Number(row.leftNm), rightNm: Number(row.rightNm) })),
          sortieNumber: sortie.number,
          firstOffsetNm: 2.5,
          stepNm: 5,
        })
        expect('xml' in file).toBe(true)
        if (!('xml' in file)) continue
        expect(file.filename).toBe(filename)
        expect(file.xml).toContain(filename.replace(/\.fpl$/i, '').replace(/_/g, ' '))
        const flown = pathNm(file.xml)
        if (Math.round(Math.abs(flown - sortie.distanceNm) * 10) / 10 > 0.1) {
          throw new Error(`${file.filename} file ${flown} saved ${sortie.distanceNm} lanes ${sortie.offsetsNm.join('/')}`)
        }
        expect(sortie.distanceNm).toBeLessThanOrEqual(400)
      }
    }
    expect(new Set(names).size).toBe(names.length)
  })

  it('extends the outer lanes until neighboring pieces meet', () => {
    const piece = (start, end, before, after) => {
      const points = POINTS.slice(start, end + 1)
      const widths = points.slice(1).map(() => 17.5)
      return buildOffsetTrack(points, widths, widths.map((nm) => Math.max(nm, 1)), 'right', {
        before: before == null ? null : POINTS[before],
        after: after == null ? null : POINTS[after],
      }).waypoints
    }
    const gap = (start, end, before, after, nextStart, nextEnd, nextBefore, nextAfter) => {
      const left = piece(start, end, before, after)
      const right = piece(nextStart, nextEnd, nextBefore, nextAfter)
      return nauticalMilesBetween(left[left.length - 1], right[0])
    }
    expect(gap(0, 1, null, 2, 1, 2, 0, 3)).toBe(0)
    expect(gap(2, 3, 1, 4, 3, 4, 2, 5)).toBe(0)
  })

  it('says so when one aircraft cannot fit a lane, and fits once a refuel stop is set', () => {
    const one = (ferryMode, refuel) =>
      planDispatchSorties({
        aircraftCount: 1,
        routeType: 'VR',
        routeNumber: '114',
        waypoints: POINTS,
        widthTexts: [],
        spans: spans(),
        firstOffsetNm: 2.5,
        stepNm: 5,
        sortieBudgetNm: 400,
        ferryMode,
        refuel,
        airports: [AIRPORTS[0]],
        sides: { KLRU: 'inner' },
      })
    const home = one('return-home', null)
    if ('error' in home) throw new Error(home.error)
    const over = home.teams[0].sorties.reduce((worst, sortie) =>
      sortie.distanceNm > worst.distanceNm ? sortie : worst
    )
    expect(over.distanceNm).toBe(656.2)
    const blocked = saveBlocker({
      missingSideLabels: [],
      segmentMessages: [],
      overLimit: { ident: 'KLRU', number: over.number, nm: over.distanceNm },
    })
    expect(blocked.reason).toContain('KLRU sortie')
    expect(blocked.reason).toContain('Add a refuel airport or another aircraft.')
    const staged = one('staged-refuel', REFUEL)
    if ('error' in staged) throw new Error(staged.error)
    expect(staged.teams[0].sorties.every((sortie) => sortie.distanceNm <= 400)).toBe(true)
  })
})
