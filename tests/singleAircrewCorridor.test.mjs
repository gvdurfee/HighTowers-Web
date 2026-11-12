/** @vitest-environment happy-dom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

const { store } = vi.hoisted(() => ({ store: new Map() }))

vi.mock('../src/db/schema.ts', () => ({
  db: {
    offsetPlans: {
      get: async (id) => store.get(id),
      put: async (record) => {
        store.set(record.flightPlanId, structuredClone(record))
      },
      delete: async (id) => {
        store.delete(id)
      },
    },
  },
}))

import { OffsetRoutePanel, legWidthFromEntry } from '../src/components/OffsetRoutePanel.tsx'
import { buildOffsetRoutes } from '../shared/survey-planning/offsetRoutePlan.js'
import { SINGLE_AIRCREW_TRACK_LINE, visibleOffsetFlags } from '../src/services/singleAircrewMap.ts'

const waypoints = [
  { originalName: 'SR900-A', g1000Name: 'A001', lat: 35, lon: -106.5 },
  { originalName: 'SR900-B', g1000Name: 'B002', lat: 34.7, lon: -106.5 },
  { originalName: 'SR900-C', g1000Name: 'C003', lat: 34.7, lon: -106.2 },
]

const airport = {
  id: 'apt-kabq',
  identifier: 'KABQ',
  name: 'Albuquerque',
  latitude: 35.04,
  longitude: -106.61,
}

function moveNm(lat, lon, bearingDeg, nm) {
  const meters = nm * 1852
  const rad = Math.PI / 180
  const br = bearingDeg * rad
  const d = meters / 6371000
  const lat1 = lat * rad
  const lon1 = lon * rad
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br))
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: lat2 / rad, lon: lon2 / rad }
}

describe('single-aircrew track offset', () => {
  it('keeps a saved corridor and accepts a larger track offset', () => {
    const saved = legWidthFromEntry({ left: '2.5', right: '2.5' }, { left: '4', right: '4' }, true)
    expect(saved).toEqual({ leftNm: 2.5, rightNm: 2.5, trackLeftNm: 4, trackRightNm: 4 })
    const trackOnly = legWidthFromEntry({ left: '', right: '' }, { left: '2.5', right: '3' }, true)
    expect(trackOnly).toEqual({ leftNm: 2.5, rightNm: 3, trackLeftNm: 2.5, trackRightNm: 3 })
    expect(legWidthFromEntry({ left: '', right: '' }, { left: '', right: '' }, true)).toBeNull()
    expect(legWidthFromEntry({ left: '', right: '' }, { left: '', right: '' }, false)).toMatchObject({
      leftNm: 0,
      rightNm: 0,
      trackLeftNm: null,
      trackRightNm: null,
    })
  })

  it('hides corridor warnings and keeps a corner that does not join cleanly', () => {
    const start = { ptIdent: 'A', g1000Name: 'A001', originalName: 'SR900-A', lat: 35, lon: -106 }
    const bend = moveNm(start.lat, start.lon, 0, 12)
    const end = moveNm(bend.lat, bend.lon, 90, 12)
    const corner = buildOffsetRoutes(
      [
        start,
        { ptIdent: 'B', g1000Name: 'B002', originalName: 'SR900-B', ...bend },
        { ptIdent: 'C', g1000Name: 'C003', originalName: 'SR900-C', ...end },
      ],
      [
        { leftNm: 2.5, rightNm: 2.5, trackLeftNm: 4, trackRightNm: 4 },
        { leftNm: 2.5, rightNm: 2.5, trackLeftNm: 4, trackRightNm: 4 },
      ]
    )
    const back = moveNm(start.lat, start.lon, 180, 10)
    const reversal = buildOffsetRoutes(
      [
        start,
        { ptIdent: 'B', g1000Name: 'B002', originalName: 'SR900-B', ...back },
        { ...start, ptIdent: 'C', g1000Name: 'C003', originalName: 'SR900-C' },
      ],
      [
        { leftNm: 2.5, rightNm: 2.5 },
        { leftNm: 2.5, rightNm: 2.5 },
      ]
    )
    const shown = visibleOffsetFlags([...corner.flags, ...reversal.flags], true)
    expect(corner.flags.some((flag) => flag.reason === 'outsideCorridor')).toBe(true)
    expect(shown.some((flag) => flag.reason === 'outsideCorridor')).toBe(false)
    expect(shown.some((flag) => flag.reason === 'foldBack' && flag.message.includes('does not join cleanly'))).toBe(true)
    expect(
      visibleOffsetFlags(
        [{ reason: 'straightWidthChange', message: 'B changes width on a straight segment (2.0 NM to 4.0 NM).' }],
        true
      )
    ).toHaveLength(1)
    expect(visibleOffsetFlags(corner.flags, false)).toEqual(corner.flags)
  })
})

function renderPanel(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(OffsetRoutePanel, {
        flightPlanId: props.flightPlanId,
        waypoints,
        departure: airport,
        destination: { ...airport, id: 'apt-kaeg', identifier: 'KAEG', name: 'Double Eagle' },
        sortie1Side: 'inner',
        creationLoadMethod: props.creationLoadMethod,
        savedTeamPlan: props.savedTeamPlan,
        onGeometry() {},
      })
    )
  })
  return {
    host,
    unmount() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('single-aircrew offset panel', () => {
  it('hides the corridor controls and shows the track helper', async () => {
    const view = renderPanel({
      flightPlanId: 'solo-sr900',
      creationLoadMethod: 'sequence',
      savedTeamPlan: null,
    })
    await settle()
    const text = view.host.textContent
    expect(text).not.toContain('SR routes have no FAA corridor width')
    expect(text).not.toContain('Apply corridor to every segment')
    expect(text).not.toContain('Left NM for every segment')
    expect(text).not.toContain('Corridor left NM')
    expect(text).not.toContain('Corridor right NM')
    expect(text).not.toContain('Reload FAA widths')
    expect(text).not.toContain('white edges')
    expect(text).toContain(SINGLE_AIRCREW_TRACK_LINE)
    expect(text).toContain('Apply track offset to every segment')
    expect(text).toContain('Track offset left NM')
    expect(view.host.querySelector('[aria-label^="Left width"]')).toBeNull()
    const left = view.host.querySelector('[aria-label="Track offset left NM for every segment"]')
    const right = view.host.querySelector('[aria-label="Track offset right NM for every segment"]')
    act(() => {
      setInput(left, '2.5')
      setInput(right, '2.5')
    })
    const apply = [...view.host.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Apply track offset')
    )
    act(() => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await settle()
    const save = [...view.host.querySelectorAll('button')].find((button) => button.textContent === 'Save')
    expect(save.disabled).toBe(false)
    act(() => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await settle()
    const saved = store.get('solo-sr900')
    expect(saved.widths).toEqual([
      { leftNm: 2.5, rightNm: 2.5 },
      { leftNm: 2.5, rightNm: 2.5 },
    ])
    expect(saved.trackOffsets.map((track) => track.leftNm)).toEqual([2.5, 2.5])
    const sortie1 = [...view.host.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Download sortie 1')
    )
    const sortie2 = [...view.host.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Download sortie 2')
    )
    expect(sortie1.disabled).toBe(false)
    expect(sortie2.disabled).toBe(false)
    expect(view.host.textContent).not.toContain('outside the')
    store.delete('solo-sr900')
    view.unmount()
  })

  it('keeps the corridor controls for a coordinator survey and a saved team plan', async () => {
    const coordinator = renderPanel({
      flightPlanId: 'coord-sr900',
      creationLoadMethod: 'coordinatorSurvey',
      savedTeamPlan: null,
    })
    await settle()
    expect(coordinator.host.textContent).toContain('SR routes have no FAA corridor width')
    expect(coordinator.host.textContent).toContain('Apply corridor to every segment')
    expect(coordinator.host.textContent).toContain('Corridor left NM')
    expect(coordinator.host.textContent).toContain('white edges')
    coordinator.unmount()

    const team = renderPanel({
      flightPlanId: 'team-sr900',
      creationLoadMethod: 'sequence',
      savedTeamPlan: { flightPlanId: 'team-sr900' },
    })
    await settle()
    expect(team.host.textContent).toContain('Apply corridor to every segment')
    expect(team.host.textContent).toContain('Corridor right NM')
    expect(team.host.textContent).not.toContain(SINGLE_AIRCREW_TRACK_LINE)
    team.unmount()
  })
})
