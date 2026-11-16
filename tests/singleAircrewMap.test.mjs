/** @vitest-environment happy-dom */
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { MapViewCrewControls } from '../src/components/MapViewCrewControls.tsx'
import {
  isSingleAircrewPlan,
  mapEmptyPathNotice,
  showFullFlightPlanSection,
  singleAircrewSortieButtonLabel,
  singleAircrewSortieHint,
} from '../src/services/singleAircrewMap.ts'
import { missingSortieChoiceNotice } from '../src/services/offsetRouteFpl.ts'

const ASSIGNING =
  'For assigning more than one team to this route. Each team shows Sortie 1 first; switch to Sortie 2 for the next day.'
const NO_TEAM = 'No team plan saved. Set up teams in Team Dispatch.'
const HINT =
  'Fly Sortie 1 out, refuel at destination, then fly Sortie 2 home on the other side. Load both files in the G1000 before departure, and activate each one before its takeoff.'

const crews = [
  { id: 'team1', label: 'Team 1', airport: 'KABQ' },
  { id: 'team2', label: 'Team 2', airport: null },
  { id: 'team3', label: 'Team 3', airport: null },
]

function renderControls(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  function Harness() {
    const [crew, setCrew] = useState('team1')
    const [sortie, setSortie] = useState(1)
    return createElement(MapViewCrewControls, {
      crews,
      selectedCrew: crew,
      onSelectCrew: setCrew,
      sorties: props.sorties === undefined ? [{ number: 1 }, { number: 2 }] : props.sorties,
      selectedSortie: sortie,
      onSelectSortie: setSortie,
      showNoTeamPlan: props.showNoTeamPlan ?? false,
      hint: props.hint ?? null,
      singleAircrew: props.singleAircrew,
      departure: props.departure,
      destination: props.destination,
      sortie1Side: props.sortie1Side ?? null,
    })
  }
  act(() => {
    root.render(createElement(Harness))
  })
  return {
    host,
    buttons() {
      return [...host.querySelectorAll('button')].map((button) => button.textContent)
    },
    sortieButton(label) {
      return [...host.querySelectorAll('[aria-label="Sortie"] button')].find(
        (button) => button.textContent === label
      )
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('single-aircrew map classification', () => {
  it('keeps team wording off a single-aircrew plan that has no sortie side', () => {
    const notice = mapEmptyPathNotice({
      singleAircrew: true,
      teamPlanKnown: true,
      teamDraws: false,
      overlayId: 'team1',
      overlayLabel: 'Sortie 1',
      sortie1Side: null,
      passCount: 0,
    })
    expect(notice).toBeNull()
    const prompt = missingSortieChoiceNotice()
    expect(prompt).toBe('Choose Sortie 1 side in Flight Plans before downloading offset routes.')
    expect(prompt).not.toMatch(/Team/)
  })

  it('still shows the team notice for a team plan with no sortie side', () => {
    expect(
      mapEmptyPathNotice({
        singleAircrew: false,
        teamPlanKnown: true,
        teamDraws: false,
        overlayId: 'team1',
        overlayLabel: 'Team 1',
        sortie1Side: null,
        passCount: 0,
      })
    ).toBe('Team 1 has no airport or Sortie 1 side on this flight plan, so no path is drawn.')
  })

  it('treats a plan with no team plan as single-aircrew unless it is a coordinator survey', () => {
    expect(isSingleAircrewPlan({ creationLoadMethod: 'sequence' }, null)).toBe(true)
    expect(isSingleAircrewPlan({ creationLoadMethod: undefined }, null)).toBe(true)
    expect(isSingleAircrewPlan({ creationLoadMethod: 'coordinatorSurvey' }, null)).toBe(false)
    expect(isSingleAircrewPlan({ creationLoadMethod: 'sequence' }, { flightPlanId: 'saved' })).toBe(false)
    expect(isSingleAircrewPlan({ creationLoadMethod: 'coordinatorSurvey' }, { flightPlanId: 'saved' })).toBe(false)
    expect(isSingleAircrewPlan(null, null)).toBe(false)
  })

  it('hides the full flight plan only after a single-aircrew plan is confirmed', () => {
    expect(showFullFlightPlanSection({ creationLoadMethod: 'sequence' }, null)).toBe(false)
    expect(showFullFlightPlanSection({ creationLoadMethod: 'coordinatorSurvey' }, null)).toBe(true)
    expect(showFullFlightPlanSection({ creationLoadMethod: 'sequence' }, { flightPlanId: 'team' })).toBe(true)
    expect(showFullFlightPlanSection({ creationLoadMethod: 'sequence' }, undefined)).toBe(true)
  })

  it('labels SR213 Demo as KABQ to KAEG on Inner, and another destination the same way', () => {
    expect(
      singleAircrewSortieButtonLabel({
        number: 1,
        departure: 'KABQ',
        destination: 'KAEG',
        sortie1Side: 'inner',
      })
    ).toBe('Sortie 1: KABQ → KAEG (Inner)')
    expect(
      singleAircrewSortieButtonLabel({
        number: 2,
        departure: 'KABQ',
        destination: 'KAEG',
        sortie1Side: 'inner',
      })
    ).toBe('Sortie 2: KAEG → KABQ (Outer)')
    expect(singleAircrewSortieHint()).toBe(HINT)
    expect(HINT).not.toContain('KAEG')
    expect(
      singleAircrewSortieButtonLabel({
        number: 1,
        departure: 'KABQ',
        destination: 'KROW',
        sortie1Side: 'outer',
      })
    ).toBe('Sortie 1: KABQ → KROW (Outer)')
    expect(
      singleAircrewSortieButtonLabel({
        number: 2,
        departure: 'KABQ',
        destination: 'KROW',
        sortie1Side: 'outer',
      })
    ).toBe('Sortie 2: KROW → KABQ (Inner)')
    expect(singleAircrewSortieHint()).toBe(HINT)
    expect(HINT).not.toContain('KROW')
  })

  it('omits the side when none is chosen, and falls back when an airport is missing', () => {
    expect(
      singleAircrewSortieButtonLabel({
        number: 1,
        departure: 'KABQ',
        destination: 'KAEG',
        sortie1Side: null,
      })
    ).toBe('Sortie 1: KABQ → KAEG')
    expect(
      singleAircrewSortieButtonLabel({
        number: 2,
        departure: 'KABQ',
        destination: 'KAEG',
        sortie1Side: null,
      })
    ).toBe('Sortie 2: KAEG → KABQ')
    expect(
      singleAircrewSortieButtonLabel({
        number: 1,
        departure: null,
        destination: 'KAEG',
        sortie1Side: 'inner',
      })
    ).toBe('Sortie 1')
    expect(
      singleAircrewSortieButtonLabel({
        number: 2,
        departure: 'KABQ',
        destination: ' ',
        sortie1Side: 'inner',
      })
    ).toBe('Sortie 2')
    expect(singleAircrewSortieHint()).toBe(HINT)
    expect(HINT).toContain('refuel at destination')
  })
})

describe('map view crew controls', () => {
  it('hides the team buttons and team lines on a single-aircrew plan and shows the KAEG hint', () => {
    const view = renderControls({
      singleAircrew: true,
      departure: 'KABQ',
      destination: 'KAEG',
      sortie1Side: 'inner',
      showNoTeamPlan: true,
      hint: singleAircrewSortieHint(),
    })
    expect(view.host.querySelector('[aria-label="Crew overlay"]')).toBeNull()
    expect(view.buttons()).not.toContain('Team 1 · KABQ')
    expect(view.buttons()).not.toContain('Team 2')
    expect(view.buttons()).not.toContain('Team 3')
    expect(view.host.textContent).not.toContain(ASSIGNING)
    expect(view.host.textContent).not.toContain(NO_TEAM)
    expect(view.buttons()).toContain('Sortie 1: KABQ → KAEG (Inner)')
    expect(view.buttons()).toContain('Sortie 2: KAEG → KABQ (Outer)')
    expect(view.host.textContent).toContain(HINT)
    const sortie2 = view.sortieButton('Sortie 2: KAEG → KABQ (Outer)')
    act(() => {
      sortie2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(sortie2.getAttribute('aria-checked')).toBe('true')
    view.unmount()
  })

  it('keeps airports on the sortie labels and does not put an identifier in the hint', () => {
    const view = renderControls({
      singleAircrew: true,
      departure: 'KABQ',
      destination: 'KROW',
      sortie1Side: 'outer',
      hint: singleAircrewSortieHint(),
    })
    expect(view.buttons()).toContain('Sortie 1: KABQ → KROW (Outer)')
    expect(view.buttons()).toContain('Sortie 2: KROW → KABQ (Inner)')
    expect(view.host.textContent).toContain(HINT)
    expect(view.host.textContent).not.toContain('refuel at KROW')
    view.unmount()
  })

  it('omits the side parentheses until a side is chosen', () => {
    const view = renderControls({
      singleAircrew: true,
      departure: 'KABQ',
      destination: 'KAEG',
      sortie1Side: null,
      hint: singleAircrewSortieHint(),
    })
    expect(view.buttons()).toContain('Sortie 1: KABQ → KAEG')
    expect(view.buttons()).toContain('Sortie 2: KAEG → KABQ')
    expect(view.host.textContent).not.toContain('(Inner)')
    expect(view.host.textContent).not.toContain('(Outer)')
    expect(view.host.textContent).not.toContain('(the other side)')
    view.unmount()
  })

  it('falls back to Sortie 1 and Sortie 2 when an airport is missing', () => {
    const missingDeparture = renderControls({
      singleAircrew: true,
      departure: null,
      destination: 'KAEG',
      sortie1Side: 'inner',
      hint: singleAircrewSortieHint(),
    })
    expect(missingDeparture.buttons()).toEqual(['Sortie 1', 'Sortie 2'])
    expect(missingDeparture.host.textContent).toContain(HINT)
    missingDeparture.unmount()

    const missingDestination = renderControls({
      singleAircrew: true,
      departure: 'KABQ',
      destination: null,
      sortie1Side: 'inner',
      hint: singleAircrewSortieHint(),
    })
    expect(missingDestination.buttons()).toEqual(['Sortie 1', 'Sortie 2'])
    expect(missingDestination.host.textContent).toContain(HINT)
    missingDestination.unmount()
  })

  it('keeps the current team buttons and text for a saved team plan', () => {
    const view = renderControls({
      singleAircrew: false,
      showNoTeamPlan: false,
      departure: 'KABQ',
      destination: 'KAEG',
      sortie1Side: 'inner',
      hint: singleAircrewSortieHint(),
    })
    expect(view.buttons()).toEqual(['Team 1 · KABQ', 'Team 2', 'Team 3', 'Sortie 1', 'Sortie 2'])
    expect(view.host.textContent).toContain(ASSIGNING)
    expect(view.host.textContent).not.toContain(NO_TEAM)
    expect(view.host.textContent).not.toContain(HINT)
    expect(view.host.textContent).not.toContain('KABQ → KAEG')
    view.unmount()
  })

  it('keeps the current team buttons and the no-team note for a coordinator survey with no team plan', () => {
    const view = renderControls({
      singleAircrew: false,
      showNoTeamPlan: true,
      departure: 'KABQ',
      destination: 'KAEG',
      sortie1Side: 'inner',
    })
    expect(view.buttons()).toEqual(['Team 1 · KABQ', 'Team 2', 'Team 3', 'Sortie 1', 'Sortie 2'])
    expect(view.sortieButton('Sortie 2').disabled).toBe(false)
    expect(view.host.textContent).toContain(ASSIGNING)
    expect(view.host.textContent).toContain(NO_TEAM)
    expect(view.host.textContent).not.toContain('refuel at')
    view.unmount()
  })
})
