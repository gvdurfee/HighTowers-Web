/** Garmin G1000 user waypoint identifiers: 6 characters, A–Z and 0–9. */
export const G1000_USER_WAYPOINT_ID_MAX_LEN = 6

/**
 * G1000 flight-plan catalog shows a short route name. 22 characters is the
 * limit that still displays in full on the G1000.
 */
export const G1000_ROUTE_NAME_MAX_LEN = 22

/**
 * @param {string} value
 */
function sanitize(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Point id from a ForeFlight MTR name or a bare point id. Stars are dropped.
 * @param {string} originalName
 */
export function g1000PointId(originalName) {
  const upper = String(originalName ?? '')
    .toUpperCase()
    .replace(/\*/g, '')
    .trim()
  const parsed = upper.match(/^(?:IR|SR|VR)\d+-?([A-Z0-9]+)$/)
  if (parsed) return parsed[1]
  return sanitize(upper)
}

/**
 * @param {number} sequence
 * @param {number} digits
 */
function sequenceDigits(sequence, digits) {
  return String(sequence).padStart(digits, '0')
}

/**
 * Solo offset name: point letters, route position, then I or O as the last character.
 * A at position 1 on the inner side is A001I. The leading sequence zero drops only when
 * the 3-digit form does not fit in 6 characters (E3X at position 3 is E3X03I).
 * @param {Array<{ originalName: string, side: 'inner' | 'outer', sequence?: number }>} inputs
 * @returns {{ names: Array<{ g1000Name: string }>, error: string | null }}
 */
export function assignOffsetWaypointNames(inputs) {
  const list = inputs ?? []
  if (list.length > 999) {
    return {
      names: [],
      error: `This route has ${list.length} waypoints. G1000 sequence numbers stop at 999, so these names were not created.`,
    }
  }
  /** @type {Array<{ g1000Name: string }>} */
  const names = []
  for (let index = 0; index < list.length; index++) {
    const sequence = list[index].sequence ?? index + 1
    const point = g1000PointId(list[index].originalName)
    const letter = list[index].side === 'outer' ? 'O' : 'I'
    if (!point) return { names: [], error: 'A waypoint has no point id, so its G1000 name was not created.' }
    if (sequence < 1 || sequence > 999) {
      return { names: [], error: `Point ${point} is past the G1000 sequence limit, so these names were not created.` }
    }
    const three = point + sequenceDigits(sequence, 3) + letter
    let name = three
    if (three.length > G1000_USER_WAYPOINT_ID_MAX_LEN) {
      const two = point + sequenceDigits(sequence, 2) + letter
      if (sequence > 99 || two.length > G1000_USER_WAYPOINT_ID_MAX_LEN) {
        return {
          names: [],
          error: `Point ${point} does not fit in a 6-character G1000 name with its sequence number, so these names were not created.`,
        }
      }
      name = two
    }
    if (!/^[A-Z0-9]+$/.test(name) || !/[IO]$/.test(name)) {
      return { names: [], error: `Point ${point} does not fit in a 6-character G1000 name, so these names were not created.` }
    }
    names.push({ g1000Name: name })
  }
  const seen = new Set()
  for (const item of names) {
    if (seen.has(item.g1000Name)) {
      return { names: [], error: `G1000 name ${item.g1000Name} would be used twice, so these names were not created.` }
    }
    seen.add(item.g1000Name)
  }
  return { names, error: null }
}

/**
 * Team lane name: published point letters, lane number counting out from the centerline, then I or O.
 * Point B on the nearest outer lane is B1O. Point XM on inner lane 2 is XM2I.
 * @param {string} originalName
 * @param {'inner' | 'outer'} side
 * @param {number} laneNumber
 * @returns {{ name: string, error: string | null }}
 */
export function laneWaypointName(originalName, side, laneNumber) {
  const point = g1000PointId(originalName)
  const letter = side === 'outer' ? 'O' : 'I'
  const lane = String(laneNumber)
  if (!point) return { name: '', error: 'A waypoint has no point id, so its G1000 name was not created.' }
  if (!/^[1-9]$/.test(lane)) {
    return { name: '', error: `Lane ${laneNumber} does not fit in one G1000 name character.` }
  }
  const name = point + lane + letter
  if (name.length <= G1000_USER_WAYPOINT_ID_MAX_LEN && /^[A-Z0-9]+$/.test(name)) {
    return { name, error: null }
  }
  return {
    name: '',
    error: `Point ${point} does not fit in a 6-character G1000 name for lane ${laneNumber}.`,
  }
}

/**
 * Name = optional L/R prefix + point id + sequence along the centerline (001).
 * A 3-digit sequence that does not fit drops the leading zero (LE3X01).
 * Names that still do not fit, or a route past 99 points in that case or 999 overall, are refused.
 * @param {Array<{ originalName: string, prefix?: string }>} inputs
 * @returns {{ names: Array<{ g1000Name: string }>, error: string | null }}
 */
export function assignG1000WaypointNames(inputs) {
  const list = inputs ?? []
  if (list.length > 999) {
    return {
      names: [],
      error: `This route has ${list.length} waypoints. G1000 sequence numbers stop at 999, so these names were not created.`,
    }
  }
  const parsed = list.map((input) => ({
    prefix: sanitize(input.prefix ?? ''),
    point: g1000PointId(input.originalName),
  }))
  const wide = parsed.find((item) => item.prefix.length + item.point.length + 3 > G1000_USER_WAYPOINT_ID_MAX_LEN)
  if (wide && list.length > 99) {
    const side = wide.prefix ? `${wide.prefix} prefix` : 'centerline'
    return {
      names: [],
      error: `Point ${wide.point} with the ${side} name uses a 2-digit sequence number. This route has ${list.length} waypoints, and a 2-digit sequence stops at 99, so these G1000 names were not created.`,
    }
  }
  /** @type {Array<{ g1000Name: string }>} */
  const names = []
  for (let index = 0; index < parsed.length; index++) {
    const sequence = index + 1
    const { prefix, point } = parsed[index]
    if (!point) {
      return { names: [], error: 'A waypoint has no point id, so its G1000 name was not created.' }
    }
    const three = prefix + point + sequenceDigits(sequence, 3)
    let name = three
    if (three.length > G1000_USER_WAYPOINT_ID_MAX_LEN) {
      const two = prefix + point + sequenceDigits(sequence, 2)
      if (sequence > 99 || two.length > G1000_USER_WAYPOINT_ID_MAX_LEN) {
        return {
          names: [],
          error: `Point ${point} does not fit in a 6-character G1000 name with its sequence number, so these names were not created.`,
        }
      }
      name = two
    }
    if (!/^[A-Z0-9]+$/.test(name)) {
      return {
        names: [],
        error: `Point ${point} does not fit in a 6-character G1000 name, so these names were not created.`,
      }
    }
    names.push({ g1000Name: name })
  }
  const seen = new Set()
  for (const item of names) {
    if (seen.has(item.g1000Name)) {
      return {
        names: [],
        error: `G1000 name ${item.g1000Name} would be used twice, so these names were not created.`,
      }
    }
    seen.add(item.g1000Name)
  }
  return { names, error: null }
}

/**
 * @param {string} routeLabel
 * @param {1 | 2} sortieNumber
 * @param {'inner' | 'outer'} side
 */
export function sortieRouteName(routeLabel, sortieNumber, side) {
  const sideToken = side === 'inner' ? 'INNER' : 'OUTER'
  const tail = ` S${sortieNumber} ${sideToken}`
  const safe = sanitize(routeLabel) || 'RTE'
  const head = safe.slice(0, Math.max(1, G1000_ROUTE_NAME_MAX_LEN - tail.length))
  return (head + tail).slice(0, G1000_ROUTE_NAME_MAX_LEN)
}

/**
 * @param {string} routeLabel
 * @param {1 | 2} sortieNumber
 * @param {'inner' | 'outer'} side
 */
export function sortieFileName(routeLabel, sortieNumber, side) {
  const sideToken = side === 'inner' ? 'INNER' : 'OUTER'
  const safe = sanitize(routeLabel) || 'route'
  return `${safe}-S${sortieNumber}-${sideToken}.fpl`
}
