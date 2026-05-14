/**
 * ForeFlight Content Pack: discover and load `navdata/user_waypoints` from a ZIP (browser).
 * Pure discovery logic lives in shared/content-pack-core.
 */
import {
  CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED,
  unzipEntriesForContentPackDiscovery,
} from '@/utils/zip'
import { formatZipListingHintFromPaths, listContentPackZipPaths, readZipEntryDecompressedBytes } from '@/utils/contentPackZip'
import { decodeWaypointCsvBytes, parseForeFlightUserWaypointsCsv } from '@/utils/foreflightUserWaypointsCsv'
import { assertForeFlightUserWaypointsShape } from '@/utils/contentPackWaypoints'
import {
  USER_WAYPOINTS_CSV_CANDIDATES,
  ZIP_ENTRY_USER_WP_RE,
  NAVDATA_USER_WP_RE,
  NAVDATA_CHILD_RE,
  isIgnoredZipEntryPath,
  bytesLookLikeZipLocalHeader,
  orderedWaypointCandidatePaths,
  pickUserWaypointsCsvPath,
  assertUserWaypointCsvBytesLookTextual,
} from '@content-pack/core/userWaypointsZipDiscovery.js'

export {
  USER_WAYPOINTS_CSV_CANDIDATES,
  ZIP_ENTRY_USER_WP_RE,
  NAVDATA_USER_WP_RE,
  NAVDATA_CHILD_RE,
  isIgnoredZipEntryPath,
  bytesLookLikeZipLocalHeader,
  orderedWaypointCandidatePaths,
  pickUserWaypointsCsvPath,
  assertUserWaypointCsvBytesLookTextual,
}

export async function tryLoadWaypointViaZipJs(
  file: File,
  listedPaths: string[]
): Promise<{ path: string; bytes: Uint8Array } | null> {
  for (const path of orderedWaypointCandidatePaths(listedPaths)) {
    let bytes: Uint8Array | null = null
    try {
      bytes = await readZipEntryDecompressedBytes(file, path)
    } catch {
      bytes = null
    }
    if (!bytes || bytes.length === 0 || bytes.length > CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED) continue
    if (bytesLookLikeZipLocalHeader(bytes)) continue
    try {
      const text = decodeWaypointCsvBytes(bytes)
      const doc = parseForeFlightUserWaypointsCsv(text)
      assertForeFlightUserWaypointsShape(doc)
      return { path, bytes }
    } catch {
      continue
    }
  }
  return null
}

/**
 * Read `user_waypoints` CSV text and member path from a ForeFlight Content Pack ZIP.
 */
export async function loadUserWaypointsCsvFromZipFile(file: File): Promise<{ csvPath: string; csvText: string }> {
  let listedPaths: string[] = []
  try {
    listedPaths = await listContentPackZipPaths(file)
  } catch {
    listedPaths = []
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const entries = unzipEntriesForContentPackDiscovery(bytes)
  let csvPath = pickUserWaypointsCsvPath(entries)
  let csvBytes: Uint8Array | undefined = csvPath ? entries.get(csvPath) : undefined
  if (!csvPath || !csvBytes) {
    const viaJs = listedPaths.length > 0 ? await tryLoadWaypointViaZipJs(file, listedPaths) : null
    if (viaJs) {
      csvPath = viaJs.path
      csvBytes = viaJs.bytes
    }
  }
  if (!csvPath || !csvBytes) {
    const hintPaths = listedPaths.length ? listedPaths : [...entries.keys()]
    throw new Error(
      'Could not find a ForeFlight user waypoints file in this ZIP (expected CSV text under navdata/, or any path ending in user_waypoints). ' +
        formatZipListingHintFromPaths(hintPaths)
    )
  }
  assertUserWaypointCsvBytesLookTextual(csvBytes, csvPath)
  return { csvPath, csvText: decodeWaypointCsvBytes(csvBytes) }
}
