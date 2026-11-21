import type { LonLat } from '@/services/serpentineDisplay'

/** Crew colors for the all-overlays picture. Distinct from the yellow sortie, the blue centerline, and the orange remaining line. */
export const CREW_OVERLAY_MAGENTA = '#FF2BD6'
export const CREW_OVERLAY_CYAN = '#00F0FF'
export const CREW_OVERLAY_LIME = '#B6FF00'
export const CREW_OVERLAY_COLORS = [CREW_OVERLAY_MAGENTA, CREW_OVERLAY_CYAN, CREW_OVERLAY_LIME] as const

export function crewOverlayColor(index: number): string {
  return CREW_OVERLAY_COLORS[index % CREW_OVERLAY_COLORS.length]
}

export type OverlayCrew = {
  id: string
  passes: Array<{ number: number; coordinates: LonLat[] }>
  airports: Array<{ identifier: string; latitude: number; longitude: number } | null | undefined>
}

export type CrewOverlayGroup = {
  crewIndex: number
  color: string
  lines: LonLat[][]
}

/** Thin lines for every sortie except the one already drawn in yellow. */
export function crewOverlayGroups(opts: {
  crews: OverlayCrew[]
  selectedCrewId: string
  selectedSortie: number
  showAll: boolean
}): CrewOverlayGroup[] {
  if (!opts.showAll) return []
  return opts.crews
    .map((crew, crewIndex) => ({
      crewIndex,
      color: crewOverlayColor(crewIndex),
      lines: crew.passes
        .filter((pass) => !(crew.id === opts.selectedCrewId && pass.number === opts.selectedSortie))
        .map((pass) => pass.coordinates)
        .filter((line) => line.length >= 2),
    }))
    .filter((group) => group.lines.length > 0)
}

/** Lane tracks plus each crew's airports, so a ferry is inside the fit. */
export function overlayFitCoordinates(crews: OverlayCrew[]): LonLat[] {
  const coords: LonLat[] = []
  for (const crew of crews) {
    for (const pass of crew.passes) {
      for (const coord of pass.coordinates) coords.push(coord)
    }
    for (const airport of crew.airports) {
      if (!airport || !Number.isFinite(airport.latitude) || !Number.isFinite(airport.longitude)) continue
      coords.push([airport.longitude, airport.latitude])
    }
  }
  return coords
}
