/**
 * Discover user_waypoints path inside ForeFlight Content Pack bytes.
 * Port of src/utils/userWaypointsZipDiscovery.ts
 */
import {
  decodeWaypointCsvBytes,
  parseForeFlightUserWaypointsCsv,
} from './foreflightUserWaypointsCsv.js'
import { assertForeFlightUserWaypointsShape } from './contentPackWaypoints.js'
import {
  CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED,
  normalizeZipEntryName,
  unzipEntriesForContentPackDiscovery,
} from './zipSniff.js'

export const USER_WAYPOINTS_CSV_CANDIDATES = [
  'navdata/user_waypoints',
  'navdata/user_waypoints.csv',
  'NavData/user_waypoints',
  'NavData/user_waypoints.csv',
  'user_waypoints',
  'user_waypoints.csv',
]

export const ZIP_ENTRY_USER_WP_RE =
  /(^|\/)(user[_ -]?waypoints|userwaypoints)(\.[a-z0-9]{1,8})?$/i

export const NAVDATA_USER_WP_RE =
  /(^|\/)navdata\/(user[_ -]?waypoints|userwaypoints)(\.[a-z0-9]{1,8})?$/i

export const NAVDATA_CHILD_RE = /(^|\/)navdata\/[^/]+$/i

export function isIgnoredZipEntryPath(path) {
  if (path.startsWith('__MACOSX/')) return true
  return path.split('/').some((seg) => seg.startsWith('._'))
}

export function bytesLookLikeZipLocalHeader(bytes) {
  let i = 0
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3
  return (
    bytes.length - i >= 4 &&
    bytes[i] === 0x50 &&
    bytes[i + 1] === 0x4b &&
    bytes[i + 2] === 0x03 &&
    bytes[i + 3] === 0x04
  )
}

function navdataFileSortKey(path) {
  const base = (path.split('/').pop() ?? path).toLowerCase().replace(/\.[^.]+$/, '')
  if (base.includes('user') && base.includes('waypoint')) return 0
  if (base === 'userwaypoints' || base.replace(/[_-]/g, '') === 'userwaypoints') return 0
  if (base.includes('waypoint')) return 1
  return 2
}

export function orderedWaypointCandidatePaths(listedPaths) {
  const normalized = [...new Set(listedPaths.map((p) => normalizeZipEntryName(p)))]
  const filePaths = normalized.filter((p) => !p.endsWith('/') && !isIgnoredZipEntryPath(p))
  const out = []
  const seen = new Set()
  const push = (p) => {
    if (seen.has(p)) return
    seen.add(p)
    out.push(p)
  }
  for (const c of USER_WAYPOINTS_CSV_CANDIDATES) {
    if (filePaths.includes(c)) push(c)
  }
  const nameHits = filePaths.filter((k) => ZIP_ENTRY_USER_WP_RE.test(k))
  nameHits.sort((a, b) => {
    const pa = NAVDATA_USER_WP_RE.test(a) ? 0 : 1
    const pb = NAVDATA_USER_WP_RE.test(b) ? 0 : 1
    return pa - pb || a.length - b.length
  })
  for (const k of nameHits) push(k)
  const navSniff = filePaths.filter((k) => NAVDATA_CHILD_RE.test(k))
  navSniff.sort((a, b) => navdataFileSortKey(a) - navdataFileSortKey(b) || a.length - b.length)
  for (const k of navSniff) push(k)
  return out
}

function tryValidWaypointEntry(entries, key) {
  const data = entries.get(key)
  if (!data || data.length === 0 || data.length > CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED) return null
  if (bytesLookLikeZipLocalHeader(data)) return null
  try {
    const text = decodeWaypointCsvBytes(data)
    const doc = parseForeFlightUserWaypointsCsv(text)
    assertForeFlightUserWaypointsShape(doc)
    return key
  } catch {
    return null
  }
}

function pickUserWaypointsByFilenamePattern(entries) {
  for (const p of USER_WAYPOINTS_CSV_CANDIDATES) {
    if (!entries.has(p)) continue
    const ok = tryValidWaypointEntry(entries, p)
    if (ok) return ok
  }
  const keys = [...entries.keys()].filter((k) => !isIgnoredZipEntryPath(k))
  const candidates = keys.filter((k) => ZIP_ENTRY_USER_WP_RE.test(k))
  candidates.sort((a, b) => {
    const pa = NAVDATA_USER_WP_RE.test(a) ? 0 : 1
    const pb = NAVDATA_USER_WP_RE.test(b) ? 0 : 1
    return pa - pb || a.length - b.length
  })
  for (const k of candidates) {
    const ok = tryValidWaypointEntry(entries, k)
    if (ok) return ok
  }
  return null
}

function pickUserWaypointsByContent(entries, onlyUnderNavdata) {
  let keys = [...entries.keys()].filter((k) => !isIgnoredZipEntryPath(k) && !k.endsWith('/'))
  if (onlyUnderNavdata) keys = keys.filter((k) => NAVDATA_CHILD_RE.test(k))
  keys.sort((a, b) => navdataFileSortKey(a) - navdataFileSortKey(b) || a.length - b.length)

  for (const k of keys) {
    const ok = tryValidWaypointEntry(entries, k)
    if (ok) return ok
  }
  return null
}

export function pickUserWaypointsCsvPath(entries) {
  return (
    pickUserWaypointsByFilenamePattern(entries) ??
    pickUserWaypointsByContent(entries, true) ??
    pickUserWaypointsByContent(entries, false)
  )
}

export function assertUserWaypointCsvBytesLookTextual(bytes, pathHint) {
  if (bytesLookLikeZipLocalHeader(bytes)) {
    const who = pathHint ? `“${pathHint}” ` : ''
    throw new Error(
      `The file ${who}in this pack starts like a ZIP archive, not plain ForeFlight waypoint CSV. ` +
        'That usually means user_waypoints was opened and saved in Numbers/Pages, or the pack is damaged. ' +
        'Re-download the Content Pack from ForeFlight, or replace that file with real CSV from a good pack.'
    )
  }
}

/**
 * @param {Uint8Array | Buffer} zipBytes
 * @returns {{ csvPath: string, csvText: string }}
 */
export function loadUserWaypointsCsvFromZipBuffer(zipBytes) {
  const bytes = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes)
  const entries = unzipEntriesForContentPackDiscovery(bytes)
  const csvPath = pickUserWaypointsCsvPath(entries)
  const csvBytes = csvPath ? entries.get(csvPath) : undefined
  if (!csvPath || !csvBytes) {
    const hintPaths = [...entries.keys()]
    throw new Error(
      'Could not find a ForeFlight user waypoints file in this ZIP (expected CSV text under navdata/, or any path ending in user_waypoints). ' +
        (hintPaths.length ? `Paths sniffed: ${hintPaths.slice(0, 28).join(', ')}` : 'No paths.')
    )
  }
  assertUserWaypointCsvBytesLookTextual(csvBytes, csvPath)
  return { csvPath, csvText: decodeWaypointCsvBytes(csvBytes) }
}
