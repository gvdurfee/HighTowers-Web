/** @vitest-environment happy-dom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { SpurPlanNotice } from '../src/components/SpurPlanNotice.tsx'
import { SINGLE_AIRCREW_SPUR_HINT } from '../src/content/spurHints.ts'

const sr213 = [
  { originalName: 'SR213-G', lat: 34.866667, lon: -106.591667 },
  { originalName: 'SR214H', lat: 34.698334, lon: -106.568333 },
  { originalName: 'SR213-G', lat: 34.866667, lon: -106.591667 },
  { originalName: 'SR213-A', lat: 34.683334, lon: -105.775 },
]

const vr114 = [
  { originalName: 'VR114-A', lat: 35, lon: -106 },
  { originalName: 'VR114-B', lat: 36, lon: -106 },
  { originalName: 'VR114-C', lat: 36, lon: -105 },
  { originalName: 'VR114-D', lat: 35, lon: -105 },
]

function renderNotice(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      createElement(SpurPlanNotice, {
        teamKnown: true,
        isAnchorPlan: false,
        legWidths: props.waypoints.slice(0, -1).map(() => ({ leftNm: 2.5, rightNm: 2.5 })),
        sortie1Side: 'inner',
        ...props,
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

describe('spur hint copy', () => {
  it('shows the SR213 single-aircrew spur hint and no Spur review', () => {
    const { host, cleanup } = renderNotice({ singleAircrew: true, waypoints: sr213 })
    expect(host.textContent).toContain(SINGLE_AIRCREW_SPUR_HINT)
    expect(host.textContent).not.toContain('Spur review')
    expect(host.textContent).not.toContain('Nothing here changes your sortie files')
    expect(host.textContent).not.toContain('Sortie 2 keeps the spur')
    cleanup()
  })

  it('shows neither hint nor Spur review for a single-aircrew route with no spur', () => {
    const { host, cleanup } = renderNotice({ singleAircrew: true, waypoints: vr114 })
    expect(host.textContent ?? '').not.toContain(SINGLE_AIRCREW_SPUR_HINT)
    expect(host.textContent ?? '').not.toContain('Spur review')
    cleanup()
  })

  it('keeps Spur review for a Team Dispatch plan', () => {
    const { host, cleanup } = renderNotice({ singleAircrew: false, waypoints: sr213 })
    expect(host.textContent).toContain('Spur review')
    expect(host.textContent).toContain('Nothing here changes your sortie files')
    expect(host.textContent).not.toContain(SINGLE_AIRCREW_SPUR_HINT)
    const toggle = host.querySelector('button')
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Sortie 2 keeps the spur')
    cleanup()
  })
})
