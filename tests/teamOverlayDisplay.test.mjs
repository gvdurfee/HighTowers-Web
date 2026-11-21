/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ShowAllSortieOverlaysButton } from '../src/components/ShowAllSortieOverlaysButton.tsx'
import {
  CREW_OVERLAY_CYAN,
  CREW_OVERLAY_LIME,
  CREW_OVERLAY_MAGENTA,
  crewOverlayGroups,
  overlayFitCoordinates,
} from '../src/services/teamOverlayDisplay.ts'

function line(number, lon) {
  return { number, coordinates: [[lon, 35], [lon, 36]] }
}

const crews = [
  { id: 'team1', passes: [line(1, -106), line(2, -105), line(3, -104)], airports: [{ identifier: 'KSKX', latitude: 35.1, longitude: -106.8 }] },
  { id: 'team2', passes: [line(1, -103), line(2, -102)], airports: [{ identifier: 'KABQ', latitude: 35.04, longitude: -106.6 }] },
  { id: 'team3', passes: [line(1, -101), line(2, -100)], airports: [{ identifier: 'KTCC', latitude: 35.18, longitude: -103.6 }, { identifier: 'KLRU', latitude: 32.3, longitude: -106.9 }] },
]

function renderButton(visible) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  function Harness() {
    const [pressed, setPressed] = useState(false)
    return createElement(ShowAllSortieOverlaysButton, {
      visible,
      pressed,
      onToggle: () => setPressed((open) => !open),
    })
  }
  act(() => {
    root.render(createElement(Harness))
  })
  return {
    host,
    cleanup() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

describe('Show all Sortie Overlays', () => {
  it('hides the button on an aircrew plan and toggles it on a team plan', () => {
    const aircrew = renderButton(false)
    expect(aircrew.host.querySelector('[data-testid="show-all-sortie-overlays"]')).toBeNull()
    aircrew.cleanup()

    const team = renderButton(true)
    const button = team.host.querySelector('[data-testid="show-all-sortie-overlays"]')
    expect(button.textContent).toBe('Show all Sortie Overlays')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    act(() => {
      button.click()
    })
    expect(button.textContent).toBe('Clear all Sortie Overlays')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    team.cleanup()
  })

  it('draws every other sortie in crew color, and only the selected sortie when off', () => {
    const off = crewOverlayGroups({ crews, selectedCrewId: 'team1', selectedSortie: 1, showAll: false })
    expect(off).toEqual([])

    const on = crewOverlayGroups({ crews, selectedCrewId: 'team1', selectedSortie: 1, showAll: true })
    const drawn = on.flatMap((group) => group.lines.map((coordinates) => ({ color: group.color, coordinates })))
    expect(drawn).toHaveLength(6)
    expect(drawn.filter((line) => line.color === CREW_OVERLAY_MAGENTA)).toHaveLength(2)
    expect(drawn.filter((line) => line.color === CREW_OVERLAY_CYAN)).toHaveLength(2)
    expect(drawn.filter((line) => line.color === CREW_OVERLAY_LIME)).toHaveLength(2)
    expect(drawn.some((line) => line.coordinates[0][0] === -106)).toBe(false)
    expect(on.map((group) => group.color)).toEqual([CREW_OVERLAY_MAGENTA, CREW_OVERLAY_CYAN, CREW_OVERLAY_LIME])
  })

  it('includes every overlay and the ferry airports in the fit', () => {
    const coords = overlayFitCoordinates(crews)
    expect(coords).toContainEqual([-103.6, 35.18])
    expect(coords).toContainEqual([-106.8, 35.1])
    expect(coords.filter((coord) => coord[1] === 35 || coord[1] === 36)).toHaveLength(14)
  })

  it('does not call the flight-plan builders', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const display = readFileSync(join(root, 'src/services/teamOverlayDisplay.ts'), 'utf8')
    const button = readFileSync(join(root, 'src/components/ShowAllSortieOverlaysButton.tsx'), 'utf8')
    const page = readFileSync(join(root, 'src/pages/MissionMapPage.tsx'), 'utf8')
    for (const source of [display, button]) {
      expect(source).not.toContain('buildTeamSortieFile')
      expect(source).not.toContain('buildSortieOffsetFpl')
    }
    const toggle = page.slice(page.indexOf('<ShowAllSortieOverlaysButton'), page.indexOf('<ShowAllSortieOverlaysButton') + 400)
    expect(toggle).toContain('!singleAircrew')
    expect(toggle).not.toContain('buildTeamSortieFile')
    expect(toggle).not.toContain('buildSortieOffsetFpl')
  })
})
