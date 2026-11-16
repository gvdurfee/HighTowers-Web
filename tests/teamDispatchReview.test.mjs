/** @vitest-environment happy-dom */
import { createElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ReviewedSection } from '../src/components/ReviewedSection.tsx'
import { TeamDispatchSaveBar } from '../src/components/TeamDispatchSaveBar.tsx'
import {
  TEAM_DISPATCH_SECTIONS,
  clearReviewedSections,
  clearReviewMarks,
  markSectionReviewed,
  planIdFromMapSearch,
  readReviewMarks,
  reviewMarksAfterChange,
  saveBarStatus,
  saveBlocker,
  teamDispatchMapPath,
  writeReviewMarks,
} from '../src/services/teamDispatchReview.ts'

function render(node) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(node)
  })
  return {
    host,
    unmount() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

describe('team dispatch review marks', () => {
  it('keeps a reviewed mark until that section changes, and stores it per plan', () => {
    clearReviewMarks('plan-a')
    clearReviewMarks('plan-b')
    const signatures = { route: 'vr114', widths: '20/10', tracks: '2.5/5', aircraft: '3', distance: '400', results: '8', sides: 'inner' }
    let marks = markSectionReviewed({}, 'route', signatures.route)
    marks = markSectionReviewed(marks, 'results', signatures.results)
    marks = markSectionReviewed(marks, 'sides', signatures.sides)
    writeReviewMarks('plan-a', marks)
    writeReviewMarks('plan-b', markSectionReviewed({}, 'tracks', 'other'))

    const edited = { ...signatures, route: 'vr114-edited' }
    const afterEdit = reviewMarksAfterChange(readReviewMarks('plan-a'), edited)
    expect(afterEdit.route).toBeUndefined()
    expect(afterEdit.results).toBe('8')
    expect(afterEdit.sides).toBe('inner')

    const afterRun = clearReviewedSections(afterEdit, ['results', 'sides'])
    expect(afterRun.results).toBeUndefined()
    expect(afterRun.sides).toBeUndefined()
    expect(readReviewMarks('plan-b').tracks).toBe('other')
    expect(TEAM_DISPATCH_SECTIONS).toHaveLength(7)
  })

  it('names the save block and the map path for this plan', () => {
    expect(saveBlocker({ missingSideLabels: ['Team 2'], segmentMessages: [] })).toEqual({
      sectionId: 'sides',
      reason: 'Choose Inner or Outer for Team 2.',
    })
    expect(saveBlocker({ missingSideLabels: [], segmentMessages: ['Segments overlap.'] })).toEqual({
      sectionId: 'results',
      reason: 'Segments overlap.',
    })
    expect(saveBlocker({ missingSideLabels: [], segmentMessages: [] }).reason).toBeNull()
    expect(saveBarStatus({ stale: true, unsaved: true, saved: true })).toBe('Results out of date. Run again.')
    expect(saveBarStatus({ stale: false, unsaved: true, saved: true })).toBe('Unsaved changes')
    expect(saveBarStatus({ stale: false, unsaved: false, saved: true })).toBe('Saved')
    expect(teamDispatchMapPath('plan-a')).toBe('/map?plan=plan-a')
    expect(planIdFromMapSearch('plan=plan-a')).toBe('plan-a')
  })
})

function LocationProbe() {
  const location = useLocation()
  return createElement('p', null, `${location.pathname}${location.search}`)
}

describe('team dispatch save bar', () => {
  it('shows the disabled reason and opens Map View with the plan selected', () => {
    let reasonClicks = 0
    const view = render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/coordinator/survey?plan=plan-a'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/coordinator/survey',
            element: createElement(TeamDispatchSaveBar, {
              reviewedCount: 2,
              sectionCount: 7,
              status: 'Unsaved changes',
              disabled: true,
              disabledReason: 'Choose Inner or Outer for Team 2.',
              notice: null,
              onDisabledReason: () => {
                reasonClicks += 1
              },
              onSave: () => {},
              onSaveAndMap: () => {},
            }),
          }),
          createElement(Route, {
            path: '/map',
            element: createElement(LocationProbe),
          })
        )
      )
    )
    expect(view.host.textContent).toContain('2 of 7 reviewed')
    expect(view.host.textContent).toContain('Unsaved changes')
    const reason = [...view.host.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Choose Inner or Outer for Team 2.')
    )
    act(() => reason.click())
    expect(reasonClicks).toBe(1)
    expect(view.host.querySelector('button[disabled]')?.textContent).toContain('Save team plan')
    view.unmount()

    let path = ''
    const routed = render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/coordinator/survey?plan=plan-a'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/coordinator/survey',
            element: createElement(TeamDispatchSaveBar, {
              reviewedCount: 7,
              sectionCount: 7,
              status: 'Saved',
              disabled: false,
              disabledReason: null,
              notice: null,
              onDisabledReason: () => {},
              onSave: () => {},
              onSaveAndMap: () => {
                path = teamDispatchMapPath('plan-a')
              },
            }),
          }),
          createElement(Route, { path: '/map', element: createElement(LocationProbe) })
        )
      )
    )
    const openMap = [...routed.host.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Save and open Map View')
    )
    act(() => openMap.click())
    expect(path).toBe('/map?plan=plan-a')
    expect(planIdFromMapSearch(path.split('?')[1])).toBe('plan-a')
    routed.unmount()
  })

  it('marks a section reviewed when the checkbox closes, and clears that title after an edit', () => {
    const hostState = { reviewed: false, open: false }
    function Harness() {
      return createElement(ReviewedSection, {
        id: 'route',
        title: 'Route',
        reviewed: hostState.reviewed,
        problem: null,
        open: hostState.open,
        onOpenChange: (open) => {
          hostState.open = open
          if (!open) hostState.reviewed = true
        },
        children: createElement('input', { 'aria-label': 'Route name', defaultValue: 'VR114' }),
      })
    }
    const view = render(createElement(Harness))
    const box = view.host.querySelector('input[type="checkbox"]')
    expect(view.host.querySelector('[aria-expanded="false"]')).toBeTruthy()
    act(() => {
      box.checked = true
      box.dispatchEvent(new Event('change', { bubbles: true }))
    })
    view.unmount()
    hostState.open = true
    const opened = render(createElement(Harness))
    expect(opened.host.querySelector('[aria-expanded="true"]')).toBeTruthy()
    expect(opened.host.querySelector('input[aria-label="Route name"]')).toBeTruthy()
    const openBox = opened.host.querySelector('input[type="checkbox"]')
    act(() => {
      openBox.checked = false
      openBox.dispatchEvent(new Event('change', { bubbles: true }))
    })
    opened.unmount()
    hostState.open = false
    hostState.reviewed = true
    const closed = render(createElement(Harness))
    expect(closed.host.textContent).toContain('Route – Reviewed')
    expect(closed.host.querySelector('[aria-expanded="false"]')).toBeTruthy()
    closed.unmount()
  })
})
