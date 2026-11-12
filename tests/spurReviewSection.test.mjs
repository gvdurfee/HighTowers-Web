/** @vitest-environment happy-dom */
import fs from 'node:fs'
import path from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { SpurReviewSection } from '../src/components/SpurReviewSection.tsx'

const OFFSET_HINT =
  "Sortie 1 and Sortie 2 fly opposite sides of the route. Each downloads as its own file, already in flying order, so don't invert Sortie 2 on the G1000. Downloads turn on after Map View saves the offset plan."
const SPUR_HINT =
  'Optional and advisory. This only matters when a route goes out and back along the same leg. Nothing here changes your sortie files.'

const spur = [
  { ptIdent: 'G', originalName: 'SAMPLE-G', lat: 35, lon: -106 },
  { ptIdent: 'T', originalName: 'SAMPLE-T', lat: 34, lon: -106 },
  { ptIdent: 'G', originalName: 'SAMPLE-G', lat: 35, lon: -106 },
  { ptIdent: 'A', originalName: 'SAMPLE-A', lat: 35, lon: -105 },
]

function renderSpur() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(SpurReviewSection, {
        waypoints: spur,
        legWidths: spur.slice(0, -1).map(() => ({ leftNm: 2.5, rightNm: 2.5 })),
        sortie1Side: 'inner',
      })
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

describe('spur review disclosure', () => {
  it('starts collapsed and expands to the existing preview', () => {
    const { host, cleanup } = renderSpur()
    const toggle = host.querySelector('button')
    expect(toggle.textContent).toBe('Expand')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('spur-review-details')
    expect(host.querySelector('#spur-review-details')).toBeNull()
    expect(host.textContent).toContain(SPUR_HINT)
    expect(host.textContent).not.toContain('Accept spur change')
    expect(host.textContent).not.toContain('Warnings, still visible')
    expect(host.textContent).not.toContain('UNRESOLVED')

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host.querySelector('button').getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('#spur-review-details')).not.toBeNull()
    expect(host.textContent).toContain('Accept spur change')
    expect(host.textContent).toContain('Out-and-back at SAMPLE-T')
    expect(host.textContent).toContain('Warnings, still visible')
    expect(host.textContent).toContain('UNRESOLVED')
    expect(host.textContent).toContain(SPUR_HINT)
    const accept = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Accept spur change')
    expect(accept.disabled).toBe(true)
    cleanup()
  })

  it('renders the offset and spur hints and does not keep the old helper lines', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/FlightPlanDetailPage.tsx'), 'utf8')
    const copy = fs.readFileSync(path.join(process.cwd(), 'src/content/spurHints.ts'), 'utf8')
    const section = fs.readFileSync(path.join(process.cwd(), 'src/components/SpurReviewSection.tsx'), 'utf8')
    expect(copy).toContain(OFFSET_HINT)
    expect(page).toContain('offsetSortieFilesHint')
    expect(page).not.toContain('Each file uses the offset plan saved in Map View.')
    expect(section).toContain(SPUR_HINT)
    expect(section).not.toContain('This is a preview for the solo plan.')
    const { host, cleanup } = renderSpur()
    expect(host.textContent).toContain(SPUR_HINT)
    cleanup()
  })
})
