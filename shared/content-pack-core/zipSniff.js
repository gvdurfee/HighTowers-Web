/**
 * ZIP discovery helpers (fflate). Port of src/utils/zip.ts discovery filter.
 */
import { unzipSync } from 'fflate'

export const CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED = 4 * 1024 * 1024

const NAVDATA_CHILD_RE = /(^|\/)navdata\/[^/]+$/i
const USER_WP_NAME_RE = /(^|\/)(user[_ -]?waypoints|userwaypoints)(\.[a-z0-9]{1,8})?$/i

function isIgnoredContentPackPath(path) {
  if (path.startsWith('__MACOSX/')) return true
  return path.split('/').some((seg) => seg.startsWith('._'))
}

export function contentPackDiscoveryFilter(info) {
  if (info.compression !== 0 && info.compression !== 8) return false
  if (info.originalSize > CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED) return false
  const name = normalizeZipEntryName(info.name)
  if (!name || name.endsWith('/')) return false
  if (isIgnoredContentPackPath(name)) return false
  return NAVDATA_CHILD_RE.test(name) || USER_WP_NAME_RE.test(name)
}

export function normalizeZipEntryName(name) {
  let n = name.replace(/\\/g, '/').trim()
  while (n.startsWith('./')) n = n.slice(2)
  while (n.startsWith('/') && n.length > 1) n = n.slice(1)
  return n
}

export function unzipEntriesForContentPackDiscovery(bytes) {
  const out = new Map()
  const unzipped = unzipSync(bytes, { filter: contentPackDiscoveryFilter })
  for (const [name, data] of Object.entries(unzipped)) {
    out.set(normalizeZipEntryName(name), data)
  }
  return out
}
