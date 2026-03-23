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

    const lines: string[] = []
    lines.push(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">',
      `  <created>${escapeXml(created)}</created>`,
      '  <waypoint-table>'
    )

    if (flightPlan.departureAirport) {
      const a = flightPlan.departureAirport
      lines.push(
        '    <waypoint>',
        `      <identifier>${escapeXml(a.identifier)}</identifier>`,
        '      <type>AIRPORT</type>',
        '      <country-code>K2</country-code>',
        `      <lat>${a.latitude.toFixed(6)}</lat>`,
        `      <lon>${a.longitude.toFixed(6)}</lon>`,
        '      <comment/>',
        '    </waypoint>'
      )
    }

    for (const wp of waypoints) {
      lines.push(
        '    <waypoint>',
        `      <identifier>${escapeXml(wp.g1000Name)}</identifier>`,
        '      <type>USER WAYPOINT</type>',
        '      <country-code/>',
        `      <lat>${wp.latitude.toFixed(6)}</lat>`,
        `      <lon>${wp.longitude.toFixed(6)}</lon>`,
        '      <comment/>',
        '    </waypoint>'
      )
    }

    if (flightPlan.destinationAirport) {
      const a = flightPlan.destinationAirport
      lines.push(
        '    <waypoint>',
        `      <identifier>${escapeXml(a.identifier)}</identifier>`,
        '      <type>AIRPORT</type>',
        '      <country-code>K2</country-code>',
        `      <lat>${a.latitude.toFixed(6)}</lat>`,
        `      <lon>${a.longitude.toFixed(6)}</lon>`,
        '      <comment/>',
        '    </waypoint>'
      )
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
