import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { nauticalMilesBetween } from '../shared/survey-planning/surveyGeometry.js'
import { planDispatchSorties, attachPackedSorties } from '../src/services/teamDispatchSorties.ts'
import { assignmentEditsForOption, compareSurveyPlans } from '../shared/survey-planning/planComparison.js'
import {
  buildTeamSortieFile,
  draftTeamPlan,
  firstFlownLeg,
  lateralCompassSide,
  packedDownloadLabel,
} from '../src/services/teamPlanRecord.ts'
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

const HOMES = [
  { identifier: 'KLRU', latitude: 32.289417, longitude: -106.921972 },
  { identifier: 'KABQ', latitude: 35.040194, longitude: -106.609139 },
  { identifier: 'KSKX', latitude: 36.458222, longitude: -105.671667 },
]

const KTCC = { identifier: 'KTCC', latitude: 35.182778, longitude: -103.603194 }

function vrSpans() {
  return applySpacingToRows(
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
}

function vrPlan(sides) {
  return planDispatchSorties({
    aircraftCount: 3,
    routeType: 'VR',
    routeNumber: '114',
    waypoints: VR114,
    widthTexts: [],
    spans: vrSpans(),
    firstOffsetNm: 2.5,
    stepNm: 5,
    sortieBudgetNm: 400,
    ferryMode: 'staged-refuel',
    refuel: KTCC,
    airports: HOMES,
    sides,
  })
}

function geometryHash(xml) {
  const stable = xml.replace(/<created>[^<]*<\/created>/g, '<created></created>')
  return createHash('sha256').update(stable).digest('hex')
}

function savedFiles(dispatch, routeLabel, points, spans) {
  const sides = Object.fromEntries(
    dispatch.teams.map((crew) => [crew.ident, crew.sorties.find((sortie) => sortie.side)?.side ?? null])
  )
  const saved = attachPackedSorties(
    draftTeamPlan({
      flightPlanId: routeLabel,
      savedAt: '2026-11-15T00:00:00.000Z',
      firstOffsetNm: 2.5,
      stepNm: 5,
      crews: dispatch.teams.map((crew, index) => ({
        id: `team${index + 1}`,
        label: crew.ident,
        departure: {
          identifier: crew.ident,
          name: crew.ident,
          latitude: HOMES.find((airport) => airport.identifier === crew.ident)?.latitude ?? 35.617,
          longitude: HOMES.find((airport) => airport.identifier === crew.ident)?.longitude ?? -106.089,
        },
        refuelStop: { identifier: 'KTCC', name: 'KTCC', latitude: KTCC.latitude, longitude: KTCC.longitude },
      })),
      sides,
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
        routeLabel,
        points,
        legWidths,
        sortieNumber: sortie.number,
        firstOffsetNm: 2.5,
        stepNm: 5,
        homeIdent: team.departure?.identifier,
        homes: saved.teams.map((item) => item.departure?.identifier ?? ''),
      })
      if ('xml' in file) files.push({ filename: file.filename, xml: file.xml, team, sortie })
    }
  }
  return { saved, files }
}

describe('VR114 geometry pin', () => {
  it('keeps the verified sortie totals and the eight file hashes', () => {
    const inner = vrPlan({ KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' })
    const outer = vrPlan({ KLRU: 'outer', KABQ: 'inner', KSKX: 'outer' })
    const allInner = vrPlan({ KLRU: 'inner', KABQ: 'inner', KSKX: 'inner' })
    for (const plan of [inner, outer, allInner]) {
      if ('error' in plan) throw new Error(plan.error)
    }
    const crew = (plan, ident) => plan.teams.find((team) => team.ident === ident)
    expect(inner.totalSorties).toBe(8)
    expect(inner.totalNm).toBe(2633.9)
    expect(crew(inner, 'KSKX')).toMatchObject({ fromPt: 'A', toPt: 'B', totalNm: 1009.7 })
    expect(crew(inner, 'KABQ')).toMatchObject({ fromPt: 'B', toPt: 'E', totalNm: 969 })
    expect(crew(inner, 'KLRU')).toMatchObject({ fromPt: 'E', toPt: 'M1', totalNm: 655.2 })
    expect(outer.totalSorties).toBe(8)
    expect(outer.totalNm).toBe(2698)
    expect(allInner.totalSorties).toBe(8)
    expect(allInner.totalNm).toBe(2649.7)
    const { files } = savedFiles(inner, 'VR114', VR114, vrSpans())
    expect(files).toHaveLength(8)
    for (const file of files) {
      const leg = firstFlownLeg(VR114, file.sortie.fromPt, file.sortie.toPt, file.sortie.startAt)
      if (!leg || !file.sortie.surveySide) continue
      const reversed = Boolean(file.sortie.startAt && file.sortie.startAt !== file.sortie.fromPt)
      const flownSide = reversed ? (file.sortie.surveySide === 'left' ? 'right' : 'left') : file.sortie.surveySide
      const label = packedDownloadLabel(file.team.departure.identifier, file.sortie, VR114)
      expect(label).toContain(lateralCompassSide(flownSide, leg.from, leg.to))
    }
    const hashes = Object.fromEntries(files.map((file) => [file.filename, geometryHash(file.xml)]))
    expect(hashes).toEqual(VR114_FILE_HASHES)
    const names = files.map((file) => file.filename)
    expect(new Set(names).size).toBe(names.length)
    const downloaded = files.reduce((sum, file) => sum + fileDistance(file.xml), 0)
    expect(Math.abs(downloaded - inner.totalNm)).toBeLessThanOrEqual(0.1)
  })

  it('keeps the refuel airport when the applied card is loaded again', () => {
    const live = vrPlan({ KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' })
    if ('error' in live) throw new Error(live.error)
    const comparison = compareSurveyPlans({
      points: VR114,
      legWidths: vrSpans().map((row) => ({ leftNm: Number(row.leftNm), rightNm: Number(row.rightNm) })),
      homes: HOMES,
      refuel: KTCC,
      budgetNm: 400,
      policy: { firstOffsetNm: 2.5, stepNm: 5 },
      applied: { teams: live.teams, refuelIdent: 'KTCC' },
    })
    const applied = comparison.options.find((option) => option.id === 'applied')
    expect(applied.wingNm).toBe(live.totalNm)
    const edits = assignmentEditsForOption(applied, [
      { id: 'team1', identifier: 'KSKX' },
      { id: 'team2', identifier: 'KABQ' },
      { id: 'team3', identifier: 'KLRU' },
    ])
    for (const id of ['team1', 'team2', 'team3']) expect(edits.refuels[id]?.identifier).toBe('KTCC')
    const reapplied = planDispatchSorties({
      aircraftCount: 3,
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114,
      widthTexts: [],
      spans: vrSpans(),
      firstOffsetNm: 2.5,
      stepNm: 5,
      sortieBudgetNm: 400,
      ferryMode: 'staged-refuel',
      refuel: KTCC,
      airports: HOMES,
      sides: { KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' },
      assignment: live.teams.map((team) => ({
        ident: team.ident,
        fromPt: team.fromPt,
        toPt: team.toPt,
        refuel: true,
      })),
    })
    if ('error' in reapplied) throw new Error(reapplied.error)
    expect(reapplied.totalSorties).toBe(live.totalSorties)
    expect(reapplied.totalNm).toBe(live.totalNm)
    const again = vrPlan({ KLRU: 'inner', KABQ: 'outer', KSKX: 'inner' })
    expect(again.totalSorties).toBe(live.totalSorties)
    expect(again.totalNm).toBe(live.totalNm)
  })

  it('numbers a crew across both sides and downloads each sortie once', () => {
    const dispatch = planDispatchSorties({
      aircraftCount: 1,
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114,
      widthTexts: [],
      spans: vrSpans(),
      firstOffsetNm: 2.5,
      stepNm: 5,
      sortieBudgetNm: 400,
      ferryMode: 'staged-refuel',
      refuel: KTCC,
      airports: [HOMES[0]],
    })
    if ('error' in dispatch) throw new Error(dispatch.error)
    const { files } = savedFiles(dispatch, 'VR114', VR114, vrSpans())
    const crew = dispatch.teams[0]
    const numbers = crew.sorties.map((sortie) => sortie.number)
    expect(new Set(numbers).size).toBe(numbers.length)
    const names = files.map((file) => file.filename)
    expect(new Set(names).size).toBe(names.length)
    const sides = new Set(crew.sorties.map((sortie) => sortie.side))
    expect(sides.has('inner') && sides.has('outer')).toBe(true)
    const survey = crew.sorties.filter((sortie) => sortie.side && sortie.offsetsNm?.length)
    expect(files).toHaveLength(survey.length)
    let downloaded = 0
    for (const sortie of survey) {
      const file = files.find((item) => item.filename.endsWith(`_S${sortie.number}.fpl`))
      expect(file, `sortie ${sortie.number}`).toBeTruthy()
      const miles = fileDistance(file.xml)
      downloaded += miles
      expect(Math.abs(Math.round((miles - sortie.distanceNm) * 10) / 10)).toBeLessThanOrEqual(0.1)
    }
    const ferryOnly = crew.sorties
      .filter((sortie) => !sortie.offsetsNm?.length)
      .reduce((sum, sortie) => sum + sortie.distanceNm, 0)
    expect(Math.abs(Math.round((downloaded + ferryOnly) * 10) / 10 - dispatch.totalNm)).toBeLessThanOrEqual(0.1)
  })

  it('downloads the no-refuel alternative at the card total', () => {
    const comparison = compareSurveyPlans({
      points: VR114,
      legWidths: vrSpans().map((row) => ({ leftNm: Number(row.leftNm), rightNm: Number(row.rightNm) })),
      homes: HOMES,
      refuel: KTCC,
      budgetNm: 400,
      policy: { firstOffsetNm: 2.5, stepNm: 5 },
    })
    const option = comparison.options.find((item) => item.title.includes('no refuel'))
    expect(option).toBeTruthy()
    const dispatch = planDispatchSorties({
      aircraftCount: 3,
      routeType: 'VR',
      routeNumber: '114',
      waypoints: VR114,
      widthTexts: [],
      spans: vrSpans(),
      firstOffsetNm: 2.5,
      stepNm: 5,
      sortieBudgetNm: 400,
      ferryMode: 'staged-refuel',
      refuel: KTCC,
      airports: HOMES,
      sides: { KSKX: 'inner', KABQ: 'outer', KLRU: 'inner' },
      assignment: option.teams.map((team) => ({
        ident: team.identifier,
        fromPt: team.from,
        toPt: team.to,
        refuel: false,
      })),
    })
    if ('error' in dispatch) throw new Error(dispatch.error)
    const { files } = savedFiles(dispatch, 'VR114', VR114, vrSpans())
    const names = files.map((file) => file.filename)
    expect(new Set(names).size).toBe(names.length)
    const downloaded = Math.round(files.reduce((sum, file) => sum + fileDistance(file.xml), 0) * 10) / 10
    const ferryOnly = dispatch.teams.reduce(
      (sum, team) => sum + team.sorties.filter((sortie) => !sortie.offsetsNm?.length).reduce((inner, sortie) => inner + sortie.distanceNm, 0),
      0
    )
    expect(Math.round(Math.abs(downloaded + ferryOnly - dispatch.totalNm) * 10) / 10).toBeLessThanOrEqual(0.1)
  })
})

function fileDistance(xml) {
  const table = new Map()
  for (const block of xml.split('<waypoint>').slice(1)) {
    const identifier = block.match(/<identifier>([^<]+)/)?.[1]
    const lat = Number(block.match(/<lat>([^<]+)/)?.[1])
    const lon = Number(block.match(/<lon>([^<]+)/)?.[1])
    if (identifier) table.set(identifier, { lat, lon })
  }
  const route = xml.slice(xml.indexOf('<route>'), xml.indexOf('</route>'))
  const idents = [...route.matchAll(/<waypoint-identifier>([^<]+)/g)].map((match) => match[1])
  let sum = 0
  for (let index = 1; index < idents.length; index += 1) {
    const from = table.get(idents[index - 1])
    const to = table.get(idents[index])
    if (from && to) sum += nauticalMilesBetween(from, to)
  }
  return Math.round(sum * 10) / 10
}

const VR114_FILE_HASHES = {
  'VR114_KABQ_BE_S1.fpl': '11779ead0130e71eed3e1786354f67950a3e50a7d9c21121d2d3329edb78b9e2',
  'VR114_KABQ_BE_S2.fpl': 'cf7177d451914acc5e6876f5faac89014abc2718a436641e2a6a67ea06012268',
  'VR114_KABQ_BE_S3.fpl': '584611e4d6937ababde0ee4ea800bb860af0fe0820e3e676faa626966edc0e01',
  'VR114_KLRU_EM1_S1.fpl': '9b06dd6b5aa3cee82c0415f4d65ed3fbb6513c659c463afad4010e721d6c94ab',
  'VR114_KLRU_EM1_S2.fpl': '614f069283a04921f333a7897f3f065b5fb5bb067a95ab6fffcda83f437b99ec',
  'VR114_KSKX_AB_S1.fpl': '6ed7f1d63b6c6f082f6cf16ffbd850fc19feceb978c3fb7d5893a8f55143f0c7',
  'VR114_KSKX_AB_S2.fpl': '5c580b0a7d80cb93ac38c3a0d6cae459130bb82b6a5c82448839fe7a944eb3d6',
  'VR114_KSKX_AB_S3.fpl': '1a98e3da72be1ec3dc6b6032d3dd3bb2c189c9c3a6893a338cf39f5718fdcbba',
}
