/** @vitest-environment happy-dom */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TeamDispatchWizard } from '../src/components/TeamDispatchWizard.tsx'
import { draftTeamPlan, drawSavedTeam } from '../src/services/teamPlanRecord.ts'
import { routeLoadRequest } from '../src/utils/loadMtrWaypoints.ts'
import {
  blankSpansFromPoints,
  canAdvanceWizard,
  crewSidesComplete,
  keepTypedSpans,
  missingCrewSides,
  prefillTeamDispatchWizard,
  recommendStaffing,
  retainFlyingTeams,
  spanWidthNmReady,
  staffingForPlan,
  refuelAirportForCrew,
  refuelEditsForDraft,
  widthFieldLabels,
  wizardStepIds,
  THREE_AIRCRAFT_SEGMENT_NOTE,
  threeAircraftAllowed,
  twoTeamLandingNote,
} from '../src/services/teamDispatchWizard.ts'

const source = {
  spans: [
    {
      fromPt: 'A',
      toPt: 'B',
      leftNm: '10',
      rightNm: '10',
      leftOffsetsText: '3, 9',
      rightOffsetsText: '3, 9',
      displayText: 'A→B',
    },
  ],
  firstOffsetNm: 3,
  stepNm: 6,
  sortieBudgetNm: 400,
  ferryMode: 'return-home',
  refuel: null,
  aircraftCount: 2,
  teams: {
    team1: { code: 'KABQ', airport: { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.04, longitude: -106.6 } },
    team2: { code: 'KLRU', airport: { identifier: 'KLRU', name: 'Las Cruces', latitude: 32.29, longitude: -106.92 } },
    team3: { code: '', airport: null },
  },
  crewSides: { team1: 'inner' },
}

describe('team dispatch wizard', () => {
  it('keeps the eight questions in order and prefills from the page', () => {
    expect(wizardStepIds()).toEqual(['route', 'width', 'tracks', 'budget', 'landing', 'aircraft', 'depart', 'review'])
    const draft = prefillTeamDispatchWizard(source)
    expect(draft.sortieBudgetNm).toBe(400)
    expect(draft.aircraftCount).toBe(2)
    expect(draft.teams.team1.airport?.identifier).toBe('KABQ')
    expect(draft.crewSides.team1).toBe('inner')
    expect(draft.crewSides.team2).toBeNull()
    expect(draft.spans[0].leftNm).toBe('10')
    expect(source.spans[0].leftNm).toBe('10')
    draft.spans[0].leftNm = '4'
    expect(source.spans[0].leftNm).toBe('10')
  })

  it('requires a side for every crew and blocks three aircraft on a short route', () => {
    const draft = prefillTeamDispatchWizard(source)
    expect(crewSidesComplete(draft)).toBe(false)
    expect(missingCrewSides(draft.crewSides, ['team1', 'team2'])).toEqual(['team2'])
    draft.crewSides.team2 = 'outer'
    expect(crewSidesComplete(draft)).toBe(true)
    expect(canAdvanceWizard('review', draft, { hasPlan: true, waypointCount: 6 })).toBe(true)
    expect(threeAircraftAllowed(3)).toBe(false)
    expect(threeAircraftAllowed(4)).toBe(true)
    expect(THREE_AIRCRAFT_SEGMENT_NOTE).toBe('Three aircraft need at least 3 route segments (4 points).')
  })

  it('builds blank spans when no width is published, and Next waits for 1 NM', () => {
    const points = [{ ptIdent: 'A' }, { ptIdent: 'B' }, { ptIdent: 'C' }]
    const draft = prefillTeamDispatchWizard({ ...source, spans: [] }, points)
    expect(draft.spans.map((row) => [row.fromPt, row.toPt, row.leftNm, row.rightNm])).toEqual([
      ['A', 'B', '', ''],
      ['B', 'C', '', ''],
    ])
    expect(blankSpansFromPoints(points)).toHaveLength(2)
    expect(canAdvanceWizard('width', draft, { hasPlan: true, waypointCount: 3 })).toBe(false)
    draft.spans[0].leftNm = '0.5'
    draft.spans[0].rightNm = '1'
    draft.spans[1].leftNm = '1'
    draft.spans[1].rightNm = '1'
    expect(spanWidthNmReady('0.5')).toBe(false)
    expect(canAdvanceWizard('width', draft, { hasPlan: true, waypointCount: 3 })).toBe(false)
    draft.spans[0].leftNm = '2.5'
    expect(canAdvanceWizard('width', draft, { hasPlan: true, waypointCount: 3 })).toBe(true)
    const typed = keepTypedSpans(draft.spans, blankSpansFromPoints(points))
    expect(typed[0].leftNm).toBe('2.5')
    expect(keepTypedSpans(draft.spans, blankSpansFromPoints([{ ptIdent: 'X' }, { ptIdent: 'Y' }]))[0].fromPt).toBe('X')
  })

  it('ranks help-me-decide by fewest sorties, then fewest miles', () => {
    const best = recommendStaffing([
      { id: '1', label: '1 aircraft', sorties: 4, miles: 900, overBudget: 0 },
      { id: '2', label: '2 aircraft', sorties: 2, miles: 1100, overBudget: 0 },
      { id: '3', label: '3 aircraft', sorties: 2, miles: 800, overBudget: 1 },
    ])
    expect(best?.id).toBe('2')
  })
})

function setControlValue(control, value) {
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set
  setter.call(control, value)
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function labeledInput(host, labelText) {
  const label = [...host.querySelectorAll('label')].find((node) => node.textContent.includes(labelText))
  return label?.querySelector('input')
}

describe('setup dialog step 1', () => {
  it('types into the route fields and shows Back plus the waypoint-loading labels', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(TeamDispatchWizard, {
            open: true,
            savedPlans: [{ id: 'plan-1', name: 'VR114 Survey' }],
            hasPlan: true,
            routeLabel: 'VR114',
            entry: 'A',
            exit: 'M1',
            waypointCount: 7,
            source,
            sourceKey: 'plan-1|1',
            waypoints: [{ ptIdent: 'A', lat: 1, lon: 1 }],
            routeType: 'VR',
            routeNumber: '114',
            widthTexts: [],
            onRouteLoaded: () => {},
            onCancel: () => {},
            onFinish: () => {},
            lookupAirport: async () => ({ error: 'not used' }),
          })
        )
      )
    })

    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.className).toContain('text-gray-900')
    expect(host.textContent).toContain('Loaded VR114: A to M1 (7 points)')
    const back = [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Back')
    expect(back.disabled).toBe(true)
    expect(host.textContent).toContain('Load full route')
    expect(host.textContent).toContain('Waypoint sequence')

    const name = labeledInput(host, 'Name')
    const routeId = labeledInput(host, 'Route ID')
    const entry = labeledInput(host, 'Entry')
    const exit = labeledInput(host, 'Exit')
    const saved = host.querySelector('[aria-label="Saved survey route"]')
    expect(entry.value).toBe('')
    expect(exit.value).toBe('')
    act(() => {
      setControlValue(name, 'VR114 hand entry')
      setControlValue(routeId, 'vr114')
      setControlValue(entry, 'b')
      setControlValue(exit, 'm1')
      setControlValue(saved, 'plan-1')
    })
    expect(name.value).toBe('VR114 hand entry')
    expect(routeId.value).toBe('VR114')
    expect(entry.value).toBe('B')
    expect(exit.value).toBe('M1')
    expect(saved.value).toBe('plan-1')

    act(() => {
      root.unmount()
    })
    host.remove()
  })
})

describe('chosen staffing', () => {
  const points = ['A', 'B', 'C', 'D', 'E', 'F', 'M1'].map((ptIdent) => ({ ptIdent }))

  function draftWithThree() {
    const draft = prefillTeamDispatchWizard({
      ...source,
      aircraftCount: 3,
      teams: {
        team1: source.teams.team1,
        team2: source.teams.team2,
        team3: { code: 'KSKX', airport: { identifier: 'KSKX', name: 'Taos', latitude: 36.7, longitude: -105.7 } },
      },
      crewSides: { team1: 'inner', team2: 'inner', team3: 'inner' },
    })
    draft.segments = {
      team1: { from: 'A', to: 'C' },
      team2: { from: 'C', to: 'E' },
      team3: { from: 'E', to: 'M1' },
    }
    return draft
  }

  it('replaces a 3-aircraft choice with opposite sides of the whole route', () => {
    const next = staffingForPlan({
      count: 2,
      draft: draftWithThree(),
      points,
      innerSide: 'left',
      replaceSides: true,
      teams: [
        { label: 'KABQ', side: 'left' },
        { label: 'KLRU', side: 'right' },
      ],
    })
    expect(next.aircraftCount).toBe(2)
    expect(next.teams.team3.airport).toBeNull()
    expect(next.crewSides.team3).toBeNull()
    expect(next.segments.team3).toBeNull()
    expect(next.crewSides.team1).toBe('inner')
    expect(next.crewSides.team2).toBe('inner')
    expect(next.segments.team1).toEqual({ from: 'A', to: 'M1' })
    expect(next.segments.team2).toEqual({ from: 'A', to: 'M1' })
  })

  it('gives three aircraft their own pieces and neighboring sortie sides', () => {
    const next = staffingForPlan({
      count: 3,
      draft: retainFlyingTeams(draftWithThree(), 3),
      points,
      innerSide: 'left',
      replaceSides: true,
      segmentAssignments: [
        { teamLabel: 'KABQ', waypointFrom: 'A', waypointTo: 'C', startIdx: 0 },
        { teamLabel: 'KSKX', waypointFrom: 'C', waypointTo: 'E', startIdx: 2 },
        { teamLabel: 'KLRU', waypointFrom: 'E', waypointTo: 'M1', startIdx: 4 },
      ],
    })
    expect(next.segments).toEqual({
      team1: { from: 'A', to: 'C' },
      team2: { from: 'E', to: 'M1' },
      team3: { from: 'C', to: 'E' },
    })
    expect(next.crewSides).toEqual({ team1: null, team2: null, team3: null })
  })

  it('loads only the entry and exit that were filled in', () => {
    expect(routeLoadRequest('', '')).toEqual({})
    expect(routeLoadRequest('a', 'm1')).toEqual({ entry: 'A', exit: 'M1' })
    expect(routeLoadRequest('A', '')).toEqual({ entry: 'A' })
    expect(routeLoadRequest('', 'M1')).toEqual({ exit: 'M1' })
    expect(widthFieldLabels('left')).toEqual({
      left: 'Left of centerline (NM) (inner)',
      right: 'Right of centerline (NM) (outer)',
    })
    expect(widthFieldLabels('right').left).toBe('Left of centerline (NM) (outer)')
  })
})

describe('wizard help, finish, and the saved drawing', () => {
  const points = [
    { ptIdent: 'A', lat: 34.64, lon: -102.9 },
    { ptIdent: 'B', lat: 35.7, lon: -102.97 },
    { ptIdent: 'C', lat: 35.58, lon: -103.63 },
    { ptIdent: 'D', lat: 35.53, lon: -103.94 },
    { ptIdent: 'E', lat: 35.06, lon: -104.04 },
    { ptIdent: 'F', lat: 34.83, lon: -103.74 },
    { ptIdent: 'M1', lat: 34.65, lon: -103.78 },
  ]

  it('Help me decide from 3 aircraft to 2, then Finish, saves opposite sides that draw apart', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let finished = null
    const spans = [
      {
        fromPt: 'A',
        toPt: 'B',
        leftNm: '20',
        rightNm: '20',
        leftOffsetsText: '2.5, 7.5, 12.5, 17.5',
        rightOffsetsText: '2.5, 7.5, 12.5, 17.5',
        displayText: 'A→B',
      },
      {
        fromPt: 'B',
        toPt: 'M1',
        leftNm: '10',
        rightNm: '20',
        leftOffsetsText: '2.5, 7.5',
        rightOffsetsText: '2.5, 7.5, 12.5, 17.5',
        displayText: 'B→M1',
      },
    ]
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(TeamDispatchWizard, {
          open: true,
          savedPlans: [],
          hasPlan: true,
          routeLabel: 'VR114',
          entry: 'A',
          exit: 'M1',
          waypointCount: points.length,
          sourceKey: 'plan|2|',
          source: {
            ...source,
            spans,
            firstOffsetNm: 2.5,
            stepNm: 5,
            sortieBudgetNm: 200,
            aircraftCount: 3,
            teams: {
              team1: { code: 'KABQ', airport: { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.0402, longitude: -106.609 } },
              team2: { code: 'KSKX', airport: { identifier: 'KSKX', name: 'Taos', latitude: 36.458, longitude: -105.673 } },
              team3: { code: '', airport: null },
            },
            crewSides: { team1: 'inner', team2: 'inner', team3: 'inner' },
          },
          waypoints: points,
          routeType: 'VR',
          routeNumber: '114',
          widthTexts: ['10 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE'],
          onRouteLoaded: () => {},
          onCancel: () => {},
          onFinish: (draft) => {
            finished = draft
          },
          lookupAirport: async () => ({ error: 'unused' }),
        }))
      )
    })
    const click = (name) => {
      const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === name)
      if (!button || button.disabled) throw new Error(`Cannot press ${name}`)
      act(() => button.click())
    }
    for (let step = 0; step < 5; step += 1) click('Next')
    click('Help me decide')
    expect(host.textContent).toContain('2 aircraft is the better fit')
    click('Next')
    click('Next')
    const teamTwo = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.textContent?.includes('Team 2'))
    const outer = [...teamTwo.querySelectorAll('input')].find((input) => input.parentElement?.textContent?.toLowerCase().includes('outer'))
    act(() => outer.click())
    click('Finish')
    expect(finished?.aircraftCount).toBe(2)
    expect(finished?.crewSides.team1).toBe('inner')
    expect(finished?.crewSides.team2).toBe('outer')
    const plan = draftTeamPlan({
      flightPlanId: 'wizard-two',
      savedAt: '2026-11-14T00:00:00.000Z',
      firstOffsetNm: finished.firstOffsetNm,
      stepNm: finished.stepNm,
      crews: ['team1', 'team2'].map((id) => ({
        id,
        label: id,
        departure: finished.teams[id].airport,
      })),
      sides: finished.crewSides,
      segments: {
        team1: { ...finished.segments.team1, start: finished.segments.team1.from },
        team2: { ...finished.segments.team2, start: finished.segments.team2.from },
      },
    })
    expect(plan.teams.map((team) => team.sorties[0].side)).toEqual(['inner', 'outer'])
    const widths = points.slice(0, -1).map((_, index) => (index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }))
    const [team1, team2] = plan.teams.map((team) =>
      drawSavedTeam({ team, points, legWidths: widths, firstOffsetNm: 2.5, stepNm: 5 })
    )
    const first = (draw) => draw.overlay.passes.find((pass) => pass.number === 1)?.waypoints[0]
    const a = first(team1)
    const b = first(team2)
    const dLat = (b.lat - a.lat) * 60
    const dLon = (b.lon - a.lon) * 60 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
    expect(Math.hypot(dLat, dLon)).toBeGreaterThan(4)
    act(() => root.unmount())
    host.remove()
  })

  it('writes the shared refuel airport onto every flying aircraft', () => {
    const ktcc = { identifier: 'KTCC', name: 'Tucumcari', latitude: 35.18, longitude: -103.6 }
    const edits = refuelEditsForDraft({ ferryMode: 'staged-refuel', refuel: ktcc, aircraftCount: 3 })
    expect(refuelAirportForCrew('team1', 'staged-refuel', ktcc, edits)?.identifier).toBe('KTCC')
    expect(refuelAirportForCrew('team2', 'staged-refuel', ktcc, edits)?.identifier).toBe('KTCC')
    expect(refuelAirportForCrew('team3', 'staged-refuel', ktcc, edits)?.identifier).toBe('KTCC')
    expect(refuelAirportForCrew('team1', 'return-home', ktcc, edits)).toBeNull()
    expect(refuelEditsForDraft({ ferryMode: 'return-home', refuel: ktcc, aircraftCount: 2 })).toBeNull()
  })
})

describe('two-team landing note', () => {
  it('shows the side note for 2 aircraft and hides it for 3', () => {
    expect(twoTeamLandingNote(2)).toMatch(/^With 2 teams, each crew stays on the side/)
    expect(twoTeamLandingNote(3)).toBeNull()
    expect(twoTeamLandingNote(1)).toBeNull()
  })
})
