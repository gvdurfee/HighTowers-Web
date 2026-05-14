import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import {
  CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED,
  contentPackDiscoveryFilter,
  normalizeZipEntryName as normalizeZipEntryNameCore,
} from '@content-pack/core/zipSniff.js'

export type ZipEntries = Map<string, Uint8Array>

export { CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED }

/** Match how most tools expect paths: forward slashes, no ./ prefix (Windows zips often use \\). */
export function normalizeZipEntryName(name: string): string {
  return normalizeZipEntryNameCore(name)
}

export { contentPackDiscoveryFilter }

/** Full unzip — avoid for large ForeFlight packs; use unzipEntriesForContentPackDiscovery instead. */
export function unzipEntries(bytes: Uint8Array): ZipEntries {
  const out: ZipEntries = new Map()
  const unzipped = unzipSync(bytes)
  for (const [name, data] of Object.entries(unzipped)) {
    out.set(normalizeZipEntryName(name), data)
  }
  return out
}

/** Inflate only small navdata / user_waypoints candidates (memory-safe for big content packs). */
export function unzipEntriesForContentPackDiscovery(bytes: Uint8Array): ZipEntries {
  const out: ZipEntries = new Map()
  const unzipped = unzipSync(bytes, { filter: contentPackDiscoveryFilter })
  for (const [name, data] of Object.entries(unzipped)) {
    out.set(normalizeZipEntryName(name), data)
  }
  return out
}

export function zipEntries(entries: ZipEntries): Uint8Array {
  const obj: Record<string, Uint8Array> = {}
  for (const [name, data] of entries) obj[name] = data
  return zipSync(obj, { level: 6 })
}

export function textFileBytes(text: string): Uint8Array {
  return strToU8(text)
}

export function bytesToText(bytes: Uint8Array): string {
  return strFromU8(bytes)
}
