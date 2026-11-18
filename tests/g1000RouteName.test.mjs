import { describe, expect, it } from 'vitest'
import {
  g1000RouteNameFromFilename,
  manualRouteName,
  singleAircrewFullRouteFilename,
} from '../shared/survey-planning/g1000Names.js'
import { uniqueSortieFilename } from '../src/services/teamPlanRecord.ts'
import { G1000Service } from '../src/services/g1000.ts'
import { planDispatchSorties, attachPackedSorties } from '../src/services/teamDispatchSorties.ts'
import { buildTeamSortieFile, draftTeamPlan } from '../src/services/teamPlanRecord.ts'
import { buildNamedOffsetSortieFile } from '../src/services/teamPlanSortieDownload.ts'
import { applySpacingToRows } from '../src/utils/coordinatorSpanTrackPlan.ts'

const ROUTE_NAME = /^[A-Z0-9 /]{1,22}$/
const VR114 = [
  { ptIdent: 'A', lat: 34.64166666, lon: -102.9 },
  { ptIdent: 'B', lat: 35.7, lon: -102.96666666 },
  { ptIdent: 'C', lat: 35.58333333, lon: -103.63333333 },
  { ptIdent: 'D', lat: 35.53333333, lon: -103.94166666 },
  { ptIdent: 'E', lat: 35.05833333, lon: -104.04166666 },
  { ptIdent: 'F', lat: 34.825, lon: -103.74166666 },
  { ptIdent: 'M1', lat: 34.65, lon: -103.78333333 },
]
const HOMES = [
  { identifier: 'KSKX', latitude: 36.458222, longitude: -105.671667 },
  { identifier: 'KABQ', latitude: 35.040194, longitude: -106.609139 },
  { identifier: 'KLRU', latitude: 32.289417, longitude: -106.921972 },
]
const KTCC = { identifier: 'KTCC', latitude: 35.182778, longitude: -103.603194 }

function routeNameOf(xml) {
  return xml.match(/<route-name>([^<]*)<\/route-name>/)?.[1] ?? ''
}

function expectGarminFile(filename, xml) {
  expect(filename.endsWith('.fpl')).toBe(true)
  expect(filename.length).toBeLessThanOrEqual(32)
  expect(routeNameOf(xml)).toMatch(ROUTE_NAME)
}

function vrFiles() {
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
  const dispatch = planDispatchSorties({
    aircraftCount: 3,
    routeType: 'VR',
    routeNumber: '114',
    waypoints: VR114,
    widthTexts: [],
    spans,
    firstOffsetNm: 2.5,
    stepNm: 5,
    sortieBudgetNm: 400,
    ferryMode: 'staged-refuel',
    refuel: KTCC,
    airports: HOMES,
    sides: { KSKX: 'inner', KABQ: 'outer', KLRU: 'inner' },
  })
  if ('error' in dispatch) throw new Error(dispatch.error)
  const saved = attachPackedSorties(
    draftTeamPlan({
      flightPlanId: 'VR114',
      savedAt: '2026-11-15T00:00:00.000Z',
      firstOffsetNm: 2.5,
      stepNm: 5,
      crews: dispatch.teams.map((crew, index) => ({
        id: `team${index + 1}`,
        label: crew.ident,
        departure: { identifier: crew.ident, name: crew.ident, latitude: 0, longitude: 0 },
        refuelStop: { identifier: 'KTCC', name: 'KTCC', latitude: KTCC.latitude, longitude: KTCC.longitude },
      })),
      sides: { team1: 'inner', team2: 'outer', team3: 'inner' },
      segments: Object.fromEntries(
        dispatch.teams.map((crew, index) => [`team${index + 1}`, { from: crew.fromPt, to: crew.toPt, start: crew.fromPt }])
      ),
    }),
    dispatch
  )
  const legWidths = spans.map((row) => ({ leftNm: Number(row.leftNm), rightNm: Number(row.rightNm) }))
  const files = []
  for (const team of saved.teams) {
    for (const sortie of team.packedSorties ?? []) {
      const file = buildTeamSortieFile({
        team,
        routeLabel: 'VR114',
        points: VR114,
        legWidths,
        sortieNumber: sortie.number,
        firstOffsetNm: 2.5,
        stepNm: 5,
        homeIdent: team.departure?.identifier,
        homes: HOMES.map((airport) => airport.identifier),
      })
      if ('xml' in file) files.push(file)
    }
  }
  return { saved, files, legWidths }
}

describe('manual export route names', () => {
  it('gives Inner and Outer different names, neither matching the planner', () => {
    const planner = [
      'VR114 KSKX AB S1',
      'VR114 KSKX AB S2',
      'VR114 KSKX AB S3',
      'VR114 KABQ BE S1',
      'VR114 KABQ BE S2',
      'VR114 KABQ BE S3',
      'VR114 KLRU EM1 S1',
      'VR114 KLRU EM1 S2',
    ]
    const used = new Map()
    const innerFile = uniqueSortieFilename('VR114_KSKX_AB_S1.fpl', used)
    const outerFile = uniqueSortieFilename('VR114_KSKX_AB_S1.fpl', used)
    const innerName = manualRouteName(innerFile, 'inner')
    const outerName = manualRouteName(outerFile, 'outer')
    expect(innerFile).toBe('VR114_KSKX_AB_S1.fpl')
    expect(outerFile).toBe('VR114_KSKX_AB_S1_2.fpl')
    expect(innerName).toBe('VR114 KSKX AB S1 I')
    expect(outerName).toBe('VR114 KSKX AB S1 2')
    for (const name of [innerName, outerName]) expect(name).toMatch(ROUTE_NAME)
    expect(planner).not.toContain(innerName)
    expect(planner).not.toContain(outerName)
    expect(innerName).not.toBe(outerName)
  })

  it('keeps the repeat suffix when the name is cut to 22 characters', () => {
    const used = new Map()
    const base = 'VR114_KSKX_LONGPIECE_S1.fpl'
    const first = manualRouteName(uniqueSortieFilename(base, used), 'inner')
    const second = manualRouteName(uniqueSortieFilename(base, used), 'outer')
    expect(first.length).toBeLessThanOrEqual(22)
    expect(second.length).toBeLessThanOrEqual(22)
    expect(second.endsWith(' 2')).toBe(true)
    expect(first).not.toBe(second)
  })
})

describe('G1000 route names', () => {
  it('names every Team Dispatch file within the Garmin limits, uniquely', () => {
    const { files } = vrFiles()
    expect(files).toHaveLength(8)
    const names = files.map((file) => {
      expectGarminFile(file.filename, file.xml)
      expect(file.routeName).toBe(g1000RouteNameFromFilename(file.filename))
      expect(file.xml).toContain(`<route-name>${file.routeName}</route-name>`)
      expect(file.xml).not.toContain('<route-name>VR114_')
      return file.routeName
    })
    expect(new Set(names).size).toBe(names.length)
    expect(files.find((file) => file.filename === 'VR114_KSKX_AB_S1.fpl')?.routeName).toBe('VR114 KSKX AB S1')
  })

  it('gives a manual export the same crew route name as its file', () => {
    const { saved, legWidths } = vrFiles()
    const names = []
    for (const team of saved.teams) {
      const sortie = team.packedSorties?.find((item) => item.side === 'inner')
      if (!sortie || !team.departure) continue
      const file = buildNamedOffsetSortieFile({
        points: VR114,
        legWidths,
        fromPt: sortie.fromPt,
        toPt: sortie.toPt,
        side: 'inner',
        departure: team.departure,
        landing: team.refuelStop ?? team.departure,
        routeLabel: 'VR114',
        sortieNumber: sortie.number,
        homeIdent: team.departure.identifier,
        policy: { firstOffsetNm: 2.5, stepNm: 5 },
        offsets: sortie.offsetsNm,
        startAt: sortie.startAt,
      })
      expectGarminFile(file.filename, file.xml)
      const name = routeNameOf(file.xml)
      expect(name).toBe(g1000RouteNameFromFilename(file.filename))
      names.push(name)
    }
    expect(names.length).toBeGreaterThan(1)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps a long mixed-case full-route file name legal and leaves the airport route name', () => {
    const filename = singleAircrewFullRouteFilename(
      'kabq',
      'West Side Survey (Long Mixed Case) !! extra words past the card limit',
      'kinw'
    )
    expect(filename.length).toBeLessThanOrEqual(32)
    expect(filename).toMatch(/^[A-Z0-9-]+\.fpl$/)
    expect(filename.startsWith('KABQ-')).toBe(true)
    expect(filename.endsWith('-KINW.fpl')).toBe(true)
    const xml = G1000Service.generateFlightPlan({
      id: 'plan',
      name: 'West Side Survey (Long Mixed Case) !! extra words past the card limit',
      departureAirport: { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.04, longitude: -106.6 },
      destinationAirport: { identifier: 'KINW', name: 'Winslow', latitude: 35.02, longitude: -110.72 },
      waypoints: [],
    })
    expect(routeNameOf(xml)).toBe('KABQ KINW')
    expectGarminFile(filename, xml)
  })
})
