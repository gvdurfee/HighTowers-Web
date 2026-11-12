/** @vitest-environment happy-dom */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoordinatorOffsetPlans } from '../src/components/CoordinatorOffsetPlans.tsx'
import { SAVED_SIDE_CHANGED_NOTICE, sortieButtonLabel } from '../src/services/coordinatorOffsetExport.ts'
import { buildTeamSortieFile } from '../src/services/teamPlanRecord.ts'
import { routeCurveSide } from '../shared/survey-planning/offsetRoutePlan.js'

const downloads = vi.hoisted(() => [])

vi.mock('@/services/sortieFplExport', async () => {
  const actual = await vi.importActual('@/services/sortieFplExport')
  return {
    ...actual,
    downloadSortieFpl: (xml, filename) => {
      downloads.push({ xml, filename })
    },
  }
})

const square = [
  { ptIdent: 'A', originalName: 'VR900-A', lat: 35, lon: -106 },
  { ptIdent: 'B', originalName: 'VR900-B', lat: 36, lon: -106 },
  { ptIdent: 'C', originalName: 'VR900-C', lat: 36, lon: -105 },
  { ptIdent: 'D', originalName: 'VR900-D', lat: 35, lon: -105 },
]
const widths = square.slice(0, -1).map(() => ({ leftNm: 10, rightNm: 10 }))
const airport = { identifier: 'KABQ', name: 'Albuquerque', latitude: 35.04, longitude: -106.6, elevation: 5355 }

function savedTeam(segment) {
  return {
    id: 'team1',
    label: 'Team 1',
    departure: airport,
    landing: airport,
    segmentFrom: segment ? 'A' : null,
    segmentTo: segment ? 'D' : null,
    startPoint: segment ? 'A' : null,
    sorties: [
      { number: 1, side: 'inner', order: 'forward' },
      { number: 2, side: 'outer', order: 'reverse' },
    ],
  }
}

function userIds(xml) {
  return [...xml.matchAll(/<waypoint-identifier>([^<]+)<\/waypoint-identifier>/g)]
    .map((match) => match[1])
    .filter((id) => id !== 'KABQ')
}

function mount(saved) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(CoordinatorOffsetPlans, {
        routeLabel: 'VR900',
        waypoints: square.map((point) => ({
          originalName: point.originalName,
          latitude: point.lat,
          longitude: point.lon,
        })),
        widthTexts: [],
        widthBusy: false,
        widthError: null,
        routeKind: 'other',
        onReloadWidths: () => {},
        crews: [{ id: 'team1', label: 'Team 1', departure: airport, destination: airport }],
        savedTeams: [saved],
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

function fillWidths(host) {
  const inputs = [...host.querySelectorAll('input[aria-label^="Left width"], input[aria-label^="Right width"]')]
  act(() => {
    for (const input of inputs) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, '10')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
}

function sortieButtons(host) {
  return [...host.querySelectorAll('button')].filter((button) => button.textContent.startsWith('Download Sortie'))
}

describe('offset flight plan buttons', () => {
  beforeEach(() => {
    downloads.length = 0
  })

  it('keeps each button on the saved side, including after the picker changes', () => {
    const curve = routeCurveSide(square)
    expect(curve.sense).toBe('clockwise')
    expect(curve.innerSide).toBe('right')
    const view = mount(savedTeam(true))
    fillWidths(view.host)
    const before = sortieButtons(view.host).map((button) => button.textContent)
    expect(before[0]).toContain('Sortie 1 — Inner (right of course)')
    expect(before[1]).toContain('Sortie 2 — Outer (left of course)')
    expect(sortieButtons(view.host).every((button) => button.disabled === false)).toBe(true)

    act(() => {
      sortieButtons(view.host)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      sortieButtons(view.host)[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(downloads).toHaveLength(2)
    const suffix = { 0: 'I', 1: 'O' }
    downloads.forEach((file, index) => {
      const names = userIds(file.xml)
      expect(names.length).toBeGreaterThan(0)
      expect(names.every((name) => name.endsWith(suffix[index]))).toBe(true)
      const role = suffix[index] === 'I' ? 'Inner' : 'Outer'
      expect(before[index]).toContain(role)
    })

    const outer = [...view.host.querySelectorAll('label')].find((label) =>
      label.textContent.includes('Outer (outside')
    )
    act(() => {
      outer.querySelector('input').click()
    })
    expect(view.host.textContent).toContain(SAVED_SIDE_CHANGED_NOTICE)
    const after = sortieButtons(view.host)
    expect(after.map((button) => button.textContent)).toEqual(before)
    expect(after.every((button) => button.disabled)).toBe(true)
    act(() => {
      after[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(downloads).toHaveLength(2)

    for (const number of [1, 2]) {
      const file = buildTeamSortieFile({
        team: savedTeam(true),
        routeLabel: 'VR900',
        points: square,
        legWidths: widths,
        sortieNumber: number,
      })
      expect('error' in file).toBe(false)
      const letter = number === 1 ? 'I' : 'O'
      expect(userIds(file.xml).every((name) => name.endsWith(letter))).toBe(true)
      expect(before[number - 1]).toContain(letter === 'I' ? 'Inner' : 'Outer')
    }
    view.unmount()
  })

  it('a 1-team plan downloads Sortie 1 and Sortie 2 with I/O suffixes that match the button labels', () => {
    const curve = routeCurveSide(square)
    const view = mount(savedTeam(true))
    fillWidths(view.host)
    const buttons = sortieButtons(view.host)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].textContent).toContain(sortieButtonLabel(1, 'inner', curve))
    expect(buttons[1].textContent).toContain(sortieButtonLabel(2, 'outer', curve))
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(downloads).toHaveLength(2)
    downloads.forEach((file, index) => {
      const inner = buttons[index].textContent.includes('Inner')
      const names = userIds(file.xml)
      expect(names.length).toBeGreaterThan(0)
      expect(names.every((name) => name.endsWith(inner ? 'I' : 'O'))).toBe(true)
    })
    view.unmount()
  })

  it('shows the build error next to the buttons', () => {
    const view = mount(savedTeam(false))
    fillWidths(view.host)
    const button = sortieButtons(view.host)[0]
    expect(button.disabled).toBe(false)
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(view.host.textContent).toContain('No segment assigned.')
    expect(downloads).toHaveLength(0)
    view.unmount()
  })

  it('blocks a saved crew when a width is missing', () => {
    const view = mount(savedTeam(true))
    const buttons = sortieButtons(view.host)
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(view.host.textContent).toContain('Enter a left and right width for every leg before downloading.')
    view.unmount()
  })
})
