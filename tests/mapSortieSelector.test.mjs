/** @vitest-environment happy-dom */
import { createElement, useState } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { MapSortieSelector } from '../src/components/MapSortieSelector.tsx'
import { ONE_SORTIE_TOOLTIP } from '../src/services/teamPlanRecord.ts'

function renderSelector(sorties) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  function Harness() {
    const [selected, setSelected] = useState(1)
    return createElement(
      'div',
      null,
      createElement(MapSortieSelector, { sorties, selected, onSelect: setSelected }),
      createElement('output', null, String(selected))
    )
  }
  act(() => {
    root.render(createElement(Harness))
  })
  return {
    host,
    button(number) {
      return [...host.querySelectorAll('button')].find((element) => element.textContent === `Sortie ${number}`)
    },
    selected() {
      return host.querySelector('output').textContent
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('map sortie selector', () => {
  it('clicking Sortie 2 changes the selected sortie', () => {
    const view = renderSelector([
      { number: 1, side: 'inner' },
      { number: 2, side: 'outer' },
    ])
    const sortie2 = view.button(2)
    expect(sortie2.disabled).toBe(false)
    expect(sortie2.getAttribute('aria-checked')).toBe('false')
    act(() => {
      sortie2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(view.selected()).toBe('2')
    expect(view.button(2).getAttribute('aria-checked')).toBe('true')
    expect(view.button(1).getAttribute('aria-checked')).toBe('false')
    view.unmount()
  })

  it('disables Sortie 2 and explains a one-sortie team', () => {
    const view = renderSelector([{ number: 1, side: 'inner' }])
    const sortie2 = view.button(2)
    expect(sortie2.disabled).toBe(true)
    expect(sortie2.title).toBe(ONE_SORTIE_TOOLTIP)
    expect(sortie2.parentElement.title).toBe(ONE_SORTIE_TOOLTIP)
    act(() => {
      sortie2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(view.selected()).toBe('1')
    expect(view.button(1).getAttribute('aria-checked')).toBe('true')
    view.unmount()
  })
})
