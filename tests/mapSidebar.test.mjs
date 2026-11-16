/** @vitest-environment happy-dom */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MainLayout } from '../src/layouts/MainLayout.tsx'
import { confirmLeaveOffsetPlan, setOffsetPlanLeaveGuard } from '../src/services/offsetPlanLeaveGuard.ts'

function renderAt(path) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(MainLayout) },
            createElement(Route, { path: '/map', element: createElement('p', null, 'Map page') }),
            createElement(Route, { path: '/workflow', element: createElement('p', null, 'Workflow page') }),
            createElement(Route, { path: '/flight-plans', element: createElement('p', null, 'Flight plans page') }),
            createElement(Route, { path: '/coordinator/survey', element: createElement('p', null, 'Team dispatch page') }),
            createElement(Route, { path: '/tower-analysis', element: createElement('p', null, 'Tower page') }),
            createElement(Route, { path: '/report-form', element: createElement('p', null, 'Report page') }),
            createElement(Route, { path: '/export', element: createElement('p', null, 'Export page') })
          )
        )
      )
    )
  })
  return {
    host,
    cleanup() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

describe('sidebar from Map View', () => {
  it('opens every other page when the map has nothing unsaved to keep', () => {
    setOffsetPlanLeaveGuard(() => true)
    const view = renderAt('/map')
    const names = [
      ['Workflow Guide', 'Workflow page'],
      ['Flight Plans', 'Flight plans page'],
      ['Team Dispatch', 'Team dispatch page'],
      ['Tower Data Analysis', 'Tower page'],
      ['Air Force Report Form', 'Report page'],
      ['Export Reported Data', 'Export page'],
      ['Map View', 'Map page'],
    ]
    for (const [name, page] of names) {
      const button = [...view.host.querySelectorAll('button')].find((item) => item.textContent?.includes(name))
      act(() => button.click())
      expect(view.host.textContent).toContain(page)
      const map = [...view.host.querySelectorAll('button')].find((item) => item.textContent?.includes('Map View'))
      act(() => map.click())
      expect(view.host.textContent).toContain('Map page')
    }
    expect(confirmLeaveOffsetPlan()).toBe(true)
    view.cleanup()
    setOffsetPlanLeaveGuard(null)
  })

  it('stays on Map View when the offset plan still asks to be saved', () => {
    setOffsetPlanLeaveGuard(() => false)
    const view = renderAt('/map')
    const button = [...view.host.querySelectorAll('button')].find((item) => item.textContent?.includes('Workflow Guide'))
    act(() => button.click())
    expect(view.host.textContent).toContain('Map page')
    expect(view.host.textContent).not.toContain('Workflow page')
    view.cleanup()
    setOffsetPlanLeaveGuard(null)
  })
})
