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

export const G1000Service = {
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
      lines.push(
        '    <route-point>',
        `      <waypoint-identifier>${escapeXml(flightPlan.departureAirport.identifier)}</waypoint-identifier>`,
        '      <waypoint-type>AIRPORT</waypoint-type>',
        '      <waypoint-country-code>K2</waypoint-country-code>',
        '    </route-point>'
      )
    }

    for (const wp of waypoints) {
      lines.push(
        '    <route-point>',
        `      <waypoint-identifier>${escapeXml(wp.g1000Name)}</waypoint-identifier>`,
        '      <waypoint-type>USER WAYPOINT</waypoint-type>',
        '      <waypoint-country-code/>',
        '    </route-point>'
      )
    }

    if (flightPlan.destinationAirport) {
      lines.push(
        '    <route-point>',
        `      <waypoint-identifier>${escapeXml(flightPlan.destinationAirport.identifier)}</waypoint-identifier>`,
        '      <waypoint-type>AIRPORT</waypoint-type>',
        '      <waypoint-country-code>K2</waypoint-country-code>',
        '    </route-point>'
      )
    }

    lines.push('  </route>', '</flight-plan>', '')
    return lines.join('\n')
  },
}
