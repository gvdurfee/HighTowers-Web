/**
 * Sortie G1000 .fpl route builder: fragment slice + serpentine waypoint sequence.
 * See docs/COORDINATOR_SURVEY_CONSOLE.md §3.
 */

/** Conservative G1000 active-route warning threshold (user waypoints only). */
export const SORTIE_FPL_ROUTE_POINT_WARN = 30

/**
 * @typedef {object} SortieFragmentWaypoint
 * @property {string} ptIdent - MTR point id (e.g. C, M1)
 * @property {string} g1000Name
 * @property {number} lat
 * @property {number} lon
 */

/**
 * @typedef {object} SortieFplSortieInput
 * @property {number} sortieNumber
 * @property {number} startIdx - inclusive index in full flight-plan waypoint list
 * @property {number} endIdx - inclusive index in full flight-plan waypoint list
 * @property {string} startAt - ptIdent where first offset leg begins
 * @property {string} waypointFrom
 * @property {string} waypointTo
 * @property {number[]} offsets
 */

/**
 * @typedef {object} SortieFplAirportInput
 * @property {string} identifier
 * @property {string} [name]
 * @property {number} lat
 * @property {number} lon
 * @property {number} [elevation]
 */

/**
 * @param {unknown[]} allWaypoints
 * @param {number} startIdx
 * @param {number} endIdx
 * @returns {unknown[]}
 */
export function sliceFragmentWaypoints(allWaypoints, startIdx, endIdx) {
  if (!Array.isArray(allWaypoints) || allWaypoints.length < 2) {
    throw new Error('Flight plan needs at least two waypoints for a sortie fragment.')
  }
  if (startIdx < 0 || endIdx >= allWaypoints.length || startIdx >= endIdx) {
    throw new Error('Invalid sortie waypoint range.')
  }
  return allWaypoints.slice(startIdx, endIdx + 1)
}

/**
 * Indices along fragment [0..n-1] from `fromLocal` to `toLocal`.
 * @param {number} fromLocal
 * @param {number} toLocal
 * @param {number} fragmentLen
 * @returns {number[]}
 */
function legIndices(fromLocal, toLocal, fragmentLen) {
  if (fragmentLen < 2) {
    throw new Error('Sortie fragment must span at least two waypoints.')
  }
  if (fromLocal < 0 || fromLocal >= fragmentLen || toLocal < 0 || toLocal >= fragmentLen) {
    throw new Error('Sortie leg endpoints out of fragment range.')
  }
  if (fromLocal === toLocal) {
    throw new Error('Sortie leg cannot start and end at the same waypoint.')
  }
  const step = fromLocal < toLocal ? 1 : -1
  const indices = []
  for (let i = fromLocal; ; i += step) {
    indices.push(i)
    if (i === toLocal) break
  }
  return indices
}

/**
 * Build alternating outbound/inbound legs for parallel-track sorties.
 * @param {SortieFragmentWaypoint[]} fragment
 * @param {string} startAt - ptIdent at fragment start or end
 * @param {number[]} offsets
 * @returns {{ routeSequence: string[], routePointCount: number, warnRoutePointLimit: boolean }}
 */
export function buildSerpentineRouteSequence(fragment, startAt, offsets) {
  if (!Array.isArray(fragment) || fragment.length < 2) {
    throw new Error('Sortie fragment must span at least two waypoints.')
  }
  if (!Array.isArray(offsets) || offsets.length === 0) {
    throw new Error('Sortie requires at least one parallel-track offset.')
  }

  const n = fragment.length
  const beginLocal = fragment.findIndex((wp) => wp.ptIdent === startAt)
  if (beginLocal !== 0 && beginLocal !== n - 1) {
    throw new Error('startAt must be the first or last waypoint of the sortie fragment.')
  }
  const otherLocal = beginLocal === 0 ? n - 1 : 0

  /** @type {string[]} */
  const routeSequence = []

  for (let k = 0; k < offsets.length; k++) {
    const fromLocal = k % 2 === 0 ? beginLocal : otherLocal
    const toLocal = k % 2 === 0 ? otherLocal : beginLocal
    const leg = legIndices(fromLocal, toLocal, n).map((i) => fragment[i].g1000Name)

    if (routeSequence.length === 0) {
      routeSequence.push(...leg)
    } else {
      // Omit duplicate join point at leg boundary (e.g. avoid M1→M1).
      routeSequence.push(...leg.slice(1))
    }
  }

  return {
    routeSequence,
    routePointCount: routeSequence.length,
    warnRoutePointLimit: routeSequence.length > SORTIE_FPL_ROUTE_POINT_WARN,
  }
}

/**
 * @param {object} opts
 * @param {SortieFplSortieInput} opts.sortie
 * @param {SortieFragmentWaypoint[]} opts.fragmentWaypoints
 * @param {SortieFplAirportInput} opts.teamDeparture
 * @param {string} opts.routeLabel
 */
export function buildSortieFplExportInput({
  sortie,
  fragmentWaypoints,
  teamDeparture,
  routeLabel,
}) {
  const { routeSequence, routePointCount, warnRoutePointLimit } =
    buildSerpentineRouteSequence(fragmentWaypoints, sortie.startAt, sortie.offsets)

  return {
    routeLabel,
    sortieNumber: sortie.sortieNumber,
    waypointFrom: sortie.waypointFrom,
    waypointTo: sortie.waypointTo,
    offsets: [...sortie.offsets],
    startAt: sortie.startAt,
    fragmentWaypoints,
    routeSequence,
    routePointCount,
    warnRoutePointLimit,
    teamDeparture: {
      identifier: teamDeparture.identifier,
      name: teamDeparture.name ?? teamDeparture.identifier,
      latitude: teamDeparture.lat,
      longitude: teamDeparture.lon,
      elevation: teamDeparture.elevation,
    },
  }
}

/**
 * @param {object} opts
 * @param {string} opts.dep
 * @param {string} opts.routeName
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {number} opts.sortieNumber
 */
export function formatSortieFplFilename({ dep, routeName, from, to, sortieNumber }) {
  const safe = (s) =>
    String(s)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]/g, '')
  return `${safe(dep)}-${safe(routeName)}-${safe(from)}-${safe(to)}-sortie${sortieNumber}.fpl`
}
