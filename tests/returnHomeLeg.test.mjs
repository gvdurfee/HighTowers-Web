import { describe, expect, it } from 'vitest'
import { nauticalMilesBetween } from '../shared/survey-planning/surveyGeometry.js'
import { planDispatchSorties } from '../src/services/teamDispatchSorties.ts'
import { buildTeamSortieFile } from '../src/services/teamPlanRecord.ts'
import { buildSerpentineDisplay } from '../src/services/serpentineDisplay.ts'
import { applySpacingToRows } from '../src/utils/coordinatorSpanTrackPlan.ts'

const VR114 = [
  { ptIdent: 'A', lat: 34.64166666, lon: -102.9 },
  { ptIdent: 'B', lat: 35.7, lon: -102.96666666 },
  { ptIdent: 'C', lat: 35.58333333, lon: -103.63333333 },
  { ptIdent: 'D', lat: 35.53333333, lon: -103.94166666 },
  { ptIdent: 'E', lat: 35.05833333, lon: -104.04166666 },
  { ptIdent: 'F', lat: 34.825, lon: -103.74166666 },
  { ptIdent: 'M1', lat: 34.65, lon: -103.78333333 },
]

const KABQ = { identifier: 'KABQ', latitude: 35.040194, longitude: -106.609139 }
const KSKX = { identifier: 'KSKX', latitude: 36.458222, longitude: -105.671667 }
const KSAF = { identifier: 'KSAF', latitude: 35.617, longitude: -106.089 }
const KTCC = { identifier: 'KTCC', latitude: 35.182778, longitude: -103.603194 }

describe('return-home sortie on the map', () => {
  it('draws KABQ Sortie 3 as a dashed KTCC–KABQ leg, not a yellow pass', () => {
    const spans = applySpacingToRows(
      VR114.slice(0, -1).map((point, index) => {
        const to = VR114[index + 1]
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
    const plan = planDispatchSorties({
      aircraftCount: 3,
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114,
      widthTexts: [],
      spans,
      firstOffsetNm: 2.5,
      stepNm: 5,
      sortieBudgetNm: 450,
      ferryMode: 'staged-refuel',
      refuel: KTCC,
      airports: [KABQ, KSKX, KSAF],
      sides: { KABQ: 'inner', KSKX: 'outer', KSAF: 'inner' },
    })
    if ('error' in plan) throw new Error(plan.error)
    const kabq = plan.teams.find((team) => team.ident === 'KABQ')
    const sortie = kabq.sorties.find((item) => item.number === 3)
    expect(sortie.returnHomeOnly).toBe(true)
    expect(sortie.offsetsNm).toEqual([])
    expect(sortie.departureIdent).toBe('KTCC')
    expect(sortie.landingIdent).toBe('KABQ')
    expect(sortie.distanceNm).toBeCloseTo(147.9, 0)

    const pass = {
      number: 3,
      transitOnly: true,
      coordinates: [
        [KTCC.longitude, KTCC.latitude],
        [KABQ.longitude, KABQ.latitude],
      ],
      waypoints: [
        { lat: KTCC.latitude, lon: KTCC.longitude, name: 'KTCC' },
        { lat: KABQ.latitude, lon: KABQ.longitude, name: 'KABQ' },
      ],
    }
    const display = buildSerpentineDisplay([pass])
    expect(display.flows.filter((line) => line.length >= 2)).toEqual([])
    expect(display.labels).toEqual([])
    expect(display.arrows).toEqual([])
    expect(display.airportLegs).toHaveLength(1)
    const [from, to] = display.airportLegs[0].coordinates
    expect(nauticalMilesBetween({ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] })).toBeCloseTo(147.9, 0)

    const file = buildTeamSortieFile({
      team: { packedSorties: [sortie], departure: KABQ },
      routeLabel: 'VR114',
      points: VR114,
      legWidths: [],
      sortieNumber: 3,
    })
    expect(file).toEqual({ ferryOnly: true })
  })

  it('keeps a two-point solo leg as a yellow pass', () => {
    const pass = {
      number: 1,
      coordinates: [
        [-102.9, 34.64166666],
        [-102.96666666, 35.7],
      ],
      waypoints: [
        { lat: 34.64166666, lon: -102.9, name: 'A001' },
        { lat: 35.7, lon: -102.96666666, name: 'B002' },
      ],
    }
    const display = buildSerpentineDisplay([pass])
    expect(display.flows.filter((line) => line.length >= 2).length).toBeGreaterThan(0)
    expect(display.arrows.map((arrow) => arrow.pass)).toContain(1)
    expect(display.airportLegs).toEqual([])
  })
})
