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

  it('does not offer a second download list on a team plan', () => {
    const curve = routeCurveSide(square)
    expect(curve.sense).toBe('clockwise')
    expect(curve.innerSide).toBe('right')
    const view = mount(savedTeam(true))
    fillWidths(view.host)
    expect(sortieButtons(view.host)).toHaveLength(0)
    expect(view.host.textContent).not.toContain('left of course')
    expect(view.host.textContent).not.toContain('right of course')
    const outer = [...view.host.querySelectorAll('label')].find((label) =>
      label.textContent.includes('Outer (outside')
    )
    act(() => {
      outer.querySelector('input').click()
    })
    expect(view.host.textContent).toContain(SAVED_SIDE_CHANGED_NOTICE)
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
