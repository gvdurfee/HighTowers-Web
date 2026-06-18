/** G1000 .fpl XML generator - matches iPad app behavior */

type AirportInput = {
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

type WaypointInput = {
  id: string
  originalName: string
  g1000Name: string
  latitude: number
  longitude: number
  routeType: string
  sequence: number
}

type FlightPlanInput = {
  id: string
  name: string
  departureAirport?: AirportInput
  destinationAirport?: AirportInput
  waypoints: WaypointInput[]
}

/** Sortie fragment export: serpentine route sequence + unique fragment waypoints for table. */
export type SortieFlightPlanInput = {
  routeLabel: string
  sortieNumber: number
  departureAirport: AirportInput
  /** Round-robin sorties use the same airport as departure. */
  destinationAirport: AirportInput
  /** Unique MTR user waypoints in the fragment (waypoint-table). */
  fragmentWaypoints: Pick<WaypointInput, 'g1000Name' | 'latitude' | 'longitude'>[]
  /** Ordered g1000 names including non-consecutive reuse for serpentine legs. */
  routeSequence: string[]
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

type TableRow =
  | { kind: 'airport'; identifier: string; lat: number; lon: number }
  | { kind: 'user'; identifier: string; lat: number; lon: number }

/**
 * Build waypoint-table rows with no duplicate identifiers.
 * Round-robin (same dep/dest): one airport row; route still has both legs.
 */
function buildWaypointTableRows(
  departureAirport: AirportInput | undefined,
  destinationAirport: AirportInput | undefined,
  waypointsSorted: WaypointInput[]
): TableRow[] {
  const rows: TableRow[] = []
  const seen = new Set<string>()

  const depId = departureAirport?.identifier.trim() ?? ''
  const destId = destinationAirport?.identifier.trim() ?? ''
  const roundRobin =
    depId.length > 0 && depId.toUpperCase() === destId.toUpperCase()

  if (departureAirport) {
    const id = departureAirport.identifier
    rows.push({
      kind: 'airport',
      identifier: id,
      lat: departureAirport.latitude,
      lon: departureAirport.longitude,
    })
    seen.add(id)
  }

  for (const wp of waypointsSorted) {
    const id = wp.g1000Name
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({ kind: 'user', identifier: id, lat: wp.latitude, lon: wp.longitude })
  }

  if (destinationAirport && !roundRobin) {
    const id = destinationAirport.identifier
    if (!seen.has(id)) {
      rows.push({
        kind: 'airport',
        identifier: id,
        lat: destinationAirport.latitude,
        lon: destinationAirport.longitude,
      })
      seen.add(id)
    }
  }

  return rows
}

function emitRoutePointLines(
  identifier: string,
  type: 'AIRPORT' | 'USER WAYPOINT',
  countryCode: string
): string[] {
  return [
    '    <route-point>',
    `      <waypoint-identifier>${escapeXml(identifier)}</waypoint-identifier>`,
    `      <waypoint-type>${type}</waypoint-type>`,
    `      <waypoint-country-code>${countryCode}</waypoint-country-code>`,
    '    </route-point>',
  ]
}

function emitWaypointTableLine(row: TableRow): string[] {
  if (row.kind === 'airport') {
    return [
      '    <waypoint>',
      `      <identifier>${escapeXml(row.identifier)}</identifier>`,
      '      <type>AIRPORT</type>',
      '      <country-code>K2</country-code>',
      `      <lat>${row.lat.toFixed(6)}</lat>`,
      `      <lon>${row.lon.toFixed(6)}</lon>`,
      '      <comment/>',
      '    </waypoint>',
    ]
  }
  return [
    '    <waypoint>',
    `      <identifier>${escapeXml(row.identifier)}</identifier>`,
    '      <type>USER WAYPOINT</type>',
    '      <country-code/>',
    `      <lat>${row.lat.toFixed(6)}</lat>`,
    `      <lon>${row.lon.toFixed(6)}</lon>`,
    '      <comment/>',
    '    </waypoint>',
  ]
}

function fragmentWaypointsForTable(
  fragmentWaypoints: SortieFlightPlanInput['fragmentWaypoints']
): WaypointInput[] {
  return fragmentWaypoints.map((wp, i) => ({
    id: `sortie-${i}`,
    originalName: wp.g1000Name,
    g1000Name: wp.g1000Name,
    latitude: wp.latitude,
    longitude: wp.longitude,
    routeType: 'VR',
    sequence: i,
  }))
}

export const G1000Service = {
  generateSortieFlightPlan(input: SortieFlightPlanInput): string {
    const created = formatDate(new Date())
    const dep = input.departureAirport
    const dest = input.destinationAirport
    const tableWaypoints = fragmentWaypointsForTable(input.fragmentWaypoints)
    const tableRows = buildWaypointTableRows(dep, dest, tableWaypoints)

    const routeName = [
      dep.identifier,
      input.routeLabel,
      `sortie${input.sortieNumber}`,
    ]
      .filter(Boolean)
      .join(' ')

    const lines: string[] = []
    lines.push(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">',
      `  <created>${escapeXml(created)}</created>`,
      '  <waypoint-table>'
    )

    for (const row of tableRows) {
      lines.push(...emitWaypointTableLine(row))
    }

    lines.push(
      '  </waypoint-table>',
      '  <route>',
      `    <route-name>${escapeXml(routeName)}</route-name>`,
      '    <flight-plan-index>1</flight-plan-index>'
    )

    lines.push(...emitRoutePointLines(dep.identifier, 'AIRPORT', 'K2'))

    for (const id of input.routeSequence) {
      lines.push(...emitRoutePointLines(id.trim(), 'USER WAYPOINT', ''))
    }

    lines.push(...emitRoutePointLines(dest.identifier, 'AIRPORT', 'K2'))

    lines.push('  </route>', '</flight-plan>', '')
    return lines.join('\n')
  },

  generateFlightPlan(flightPlan: FlightPlanInput): string {
    const waypoints = [...flightPlan.waypoints].sort(
      (a, b) => a.sequence - b.sequence
    )
    const created = formatDate(new Date())
    const routeName = [
      flightPlan.departureAirport?.identifier ?? '',
      flightPlan.destinationAirport?.identifier ?? '',
    ]
      .join(' ')
      .trim()

    const tableRows = buildWaypointTableRows(
      flightPlan.departureAirport,
      flightPlan.destinationAirport,
      waypoints
    )

    const lines: string[] = []
    lines.push(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">',
      `  <created>${escapeXml(created)}</created>`,
      '  <waypoint-table>'
    )

    for (const row of tableRows) {
      lines.push(...emitWaypointTableLine(row))
    }

    lines.push(
      '  </waypoint-table>',
      '  <route>',
      `    <route-name>${escapeXml(routeName)}</route-name>`,
      '    <flight-plan-index>1</flight-plan-index>'
    )

    if (flightPlan.departureAirport) {
      lines.push(...emitRoutePointLines(flightPlan.departureAirport.identifier, 'AIRPORT', 'K2'))
    }

    let lastUserWaypointId: string | null = null
    for (const wp of waypoints) {
      const id = wp.g1000Name.trim()
      // Some avionics reject routes with consecutive duplicate user route-points (e.g. XM112 twice in a row).
      if (lastUserWaypointId && id.toUpperCase() === lastUserWaypointId.toUpperCase()) continue
      lastUserWaypointId = id
      lines.push(...emitRoutePointLines(id, 'USER WAYPOINT', ''))
    }

    if (flightPlan.destinationAirport) {
      lines.push(
        ...emitRoutePointLines(flightPlan.destinationAirport.identifier, 'AIRPORT', 'K2')
      )
    }

    lines.push('  </route>', '</flight-plan>', '')
    return lines.join('\n')
  },
}
