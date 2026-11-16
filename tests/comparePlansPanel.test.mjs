/** @vitest-environment happy-dom */
import { createElement, useState } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ComparePlansPanel } from '../src/components/ComparePlansPanel.tsx'
import { SortieFileButton } from '../src/components/SortieFileButton.tsx'
import { ONE_SORTIE_TOOLTIP } from '../src/services/teamPlanRecord.ts'

const option = {
  id: 'klru-refuel',
  title: 'Return home, only KLRU refuels at KTCC',
  refuelStops: 1,
  wingNm: 2489.2,
  allUnder: true,
  recommended: true,
  insertedPoint: null,
  boundaryNote: null,
  teams: [
    {
      identifier: 'KLRU',
      from: 'A',
      to: 'B',
      home: 'KLRU',
      refuel: 'KTCC',
      refuelAirport: { identifier: 'KTCC', name: 'Tucumcari', latitude: 35.182778, longitude: -103.603194 },
      sorties: [
        { number: 1, distanceNm: 480.9, overBudget: false },
        { number: 2, distanceNm: 480.9, overBudget: false },
      ],
      totalNm: 961.8,
    },
  ],
}

describe('compare plans panel', () => {
  it('Apply loads the option and does not save', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    function Harness() {
      const [loaded, setLoaded] = useState('')
      const [saved, setSaved] = useState(false)
      return createElement(
        'div',
        null,
        createElement(ComparePlansPanel, {
          options: [option],
          spacingNote: 'Spacing is one value for the whole route.',
          onApply: (next) => setLoaded(`${next.teams[0].from}-${next.teams[0].to}`),
        }),
        createElement('button', { type: 'button', onClick: () => setSaved(true) }, 'Save team plan'),
        createElement('output', null, `${loaded}|${saved}`)
      )
    }
    act(() => {
      root.render(createElement(Harness))
    })
    const apply = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Apply')
    act(() => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.querySelector('output').textContent).toBe('A-B|false')
    const duplicate = {
      ...option,
      id: option.id,
      teams: [
        {
          ...option.teams[0],
          sorties: [
            { number: 1, distanceNm: 100, overBudget: false },
            { number: 1, distanceNm: 200, overBudget: false },
          ],
        },
      ],
    }
    const warnings = []
    const report = console.error
    console.error = (...args) => warnings.push(args.map(String).join(' '))
    act(() => {
      root.render(
        createElement(ComparePlansPanel, {
          options: [option, duplicate],
          spacingNote: 'Spacing is one value for the whole route.',
          onApply: () => {},
        })
      )
    })
    console.error = report
    expect(warnings.join('\n')).not.toMatch(/same key/)
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})

describe('sortie download button', () => {
  it('stays disabled with a tooltip when the team has no such sortie', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let clicks = 0
    act(() => {
      root.render(
        createElement(SortieFileButton, {
          label: 'Download sortie 2 .fpl',
          enabled: false,
          title: ONE_SORTIE_TOOLTIP,
          onClick: () => {
            clicks += 1
          },
        })
      )
    })
    const button = host.querySelector('button')
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('This team flies one sortie')
    expect(button.parentElement.title).toBe('This team flies one sortie')
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(clicks).toBe(0)
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})
