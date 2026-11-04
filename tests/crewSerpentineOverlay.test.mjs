import { describe, expect, it } from 'vitest'
import { buildOffsetRoutes } from '../shared/survey-planning/offsetRoutePlan.js'
import { buildCoordinatorCrewOffsetFile } from '../src/services/coordinatorOffsetExport.ts'
import {
  crossoverEnds,
  emptyCrewOverlay,
  selectedCrewOverlay,
  serpentineFromTracks,
} from '../src/services/crewSerpentineOverlay.ts'

const VR114 = ['A', 'B', 'C', 'D', 'E', 'F', 'M1']
const VR114_COORDS = [
  [34.64166666, -102.9],
  [35.7, -102.96666666],
  [35.58333333, -103.63333333],
  [35.53333333, -103.94166666],
  [35.05833333, -104.04166666],
  [34.825, -103.74166666],
  [34.65, -103.78333333],
]
const VR114_INNER = ['A001I', 'B002I', 'C003I', 'D004I', 'E005I', 'F006I', 'M1007I']
const VR114_OUTER_REVERSED = ['M1007O', 'F006O', 'E005O', 'D004O', 'C003O', 'B002O', 'A001O']

const team2Departure = { identifier: 'KTCC', latitude: 35.18, longitude: -103.6, name: 'Tucumcari' }
const team2Destination = { identifier: 'KCVN', latitude: 34.42, longitude: -103.08, name: 'Clovis' }

function vr114Points() {
  return VR114.map((point, index) => ({
    ptIdent: point,
    originalName: `VR114-${point}`,
    lat: VR114_COORDS[index][0],
    lon: VR114_COORDS[index][1],
  }))
}

function vr114Widths(count) {
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? { leftNm: 20, rightNm: 20 } : { leftNm: 10, rightNm: 20 }
  )
}

function coordsOf(overlay) {
  return overlay.passes.flatMap((pass) => pass.coordinates)
}

describe('crew serpentine overlay', () => {
  const points = vr114Points()
  const widths = vr114Widths(points.length - 1)
  const built = buildOffsetRoutes(points, widths)

  const team1 = serpentineFromTracks({
    id: 'team1',
    label: 'Team 1',
    sortie1Side: 'inner',
    inner: built.inner.waypoints,
    outer: built.outer.waypoints,
  })
  const team2 = serpentineFromTracks({
    id: 'team2',
    label: 'Team 2',
    sortie1Side: 'outer',
    inner: built.inner.waypoints,
    outer: built.outer.waypoints,
    departure: team2Departure,
    destination: team2Destination,
  })
  const team3 = emptyCrewOverlay('team3', 'Team 3')
  const overlays = [team1, team2, team3]

  it('uses the same VR114 waypoint names as that crew’s offset flight plans', () => {
    const sortie1 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 1,
    })
    const sortie2 = buildCoordinatorCrewOffsetFile({
      routeLabel: 'VR114',
      points,
      legWidths: widths,
      sortie1Side: 'inner',
      sortieNumber: 2,
    })
    expect(sortie1.userNames).toEqual(VR114_INNER)
    expect(sortie2.userNames).toEqual(VR114_OUTER_REVERSED)
    expect(team1.passes[0].names).toEqual(sortie1.userNames)
    expect(team1.passes[1].names).toEqual(sortie2.userNames)
  })

  it('shows only the selected crew’s path', () => {
    const shown = selectedCrewOverlay(overlays, 'team2')
    expect(shown).toBe(team2)
    expect(shown?.airport).toBe('KTCC')
    expect(shown?.passes[0].names[0]).toBe('A001O')
    expect(shown?.passes[0].names).not.toEqual(team1.passes[0].names)
    expect(coordsOf(shown)).toEqual(coordsOf(team2))
    expect(coordsOf(shown)).not.toEqual(coordsOf(team1))

    const third = selectedCrewOverlay(overlays, 'team3')
    expect(third?.passes).toEqual([])
    expect(coordsOf(third)).toEqual([])
    expect(crossoverEnds(third)).toBeNull()
  })

  it('places the crossover at the end of Pass 1 and the start of Pass 2', () => {
    const ends = crossoverEnds(team1)
    expect(ends?.pass1End).toEqual(team1.passes[0].coordinates.at(-1))
    expect(ends?.pass2Start).toEqual(team1.passes[1].coordinates[0])
    expect(ends?.pass1End).not.toEqual(ends?.pass2Start)

    const team2Ends = crossoverEnds(selectedCrewOverlay(overlays, 'team2'))
    expect(team2Ends?.pass1End).toEqual(team2.passes[0].coordinates.at(-1))
    expect(team2Ends?.pass2Start).toEqual(team2.passes[1].coordinates[0])
    expect(team2Ends?.pass1End).not.toEqual(ends?.pass1End)
  })
})
