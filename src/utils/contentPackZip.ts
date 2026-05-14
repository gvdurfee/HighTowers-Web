import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED, normalizeZipEntryName } from '@/utils/zip'

/** Central-directory listing only (no per-file inflate) — for error hints. */
export async function listContentPackZipPaths(zipBlob: Blob): Promise<string[]> {
  const reader = new ZipReader(new BlobReader(zipBlob))
  try {
    const entries = await reader.getEntries()
    return entries.map((e) => normalizeZipEntryName(e.filename))
  } finally {
    await reader.close()
  }
}

export function formatZipListingHintFromPaths(paths: string[]): string {
  const keys = paths.filter((k) => !k.startsWith('__MACOSX/'))
  if (keys.length === 0) {
    return 'No paths were read from this ZIP.'
  }
  const sample = keys.slice(0, 28).join(', ')
  const more = keys.length > 28 ? ` … (+${keys.length - 28} more)` : ''
  return `Paths in this archive: ${sample}${more}.`
}

/**
 * Decompress a single member by normalized path (central-directory + zip.js codecs).
 * Use when fflate’s filtered `unzipSync` skips an entry (unsupported method in filter, etc.).
 */
export async function readZipEntryDecompressedBytes(
  zipBlob: Blob,
  normalizedPath: string
): Promise<Uint8Array | null> {
  const reader = new ZipReader(new BlobReader(zipBlob))
  try {
    const entries = await reader.getEntries()
    for (const entry of entries) {
      if (entry.directory) continue
      if (normalizeZipEntryName(entry.filename) !== normalizedPath) continue
      const blob = await entry.getData(new BlobWriter())
      const buf = await blob.arrayBuffer()
      const out = new Uint8Array(buf)
      if (out.length > CONTENT_PACK_MAX_DISCOVERY_UNCOMPRESSED) {
        return null
      }
      return out
    }
    return null
  } finally {
    await reader.close()
  }
}

/**
 * Copy the archive entry-for-entry, replacing one member’s uncompressed payload.
 * Unchanged entries use pass-through (compressed bytes copied) so large packs stay memory-safe.
 */
export async function repackContentPackReplaceFile(
  zipBlob: Blob,
  normalizedTargetPath: string,
  replacementUtf8: string
): Promise<Blob> {
  const zipReader = new ZipReader(new BlobReader(zipBlob))
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    bufferedWrite: true,
    keepOrder: true,
  })

  try {
    const entries = await zipReader.getEntries()
    for (const entry of entries) {
      const rawName = entry.filename
      const norm = normalizeZipEntryName(rawName)

      if (entry.directory) {
        await zipWriter.add(rawName, undefined, { directory: true })
        continue
      }

      if (norm === normalizedTargetPath) {
        await zipWriter.add(rawName, new TextReader(replacementUtf8), {
          level: 6,
          lastModDate: entry.lastModDate,
        })
        continue
      }

      const compressedBlob = await entry.getData(new BlobWriter(), { passThrough: true })
      const extraFieldAES = (entry as { extraFieldAES?: { strength: number } }).extraFieldAES
      const addOpts: Record<string, unknown> = {
        passThrough: true,
        uncompressedSize: entry.uncompressedSize,
        compressionMethod: entry.compressionMethod,
        encrypted: entry.encrypted,
        zipCrypto: entry.zipCrypto,
        signature: entry.signature,
        lastModDate: entry.lastModDate,
        versionMadeBy: entry.versionMadeBy,
        externalFileAttributes: entry.externalFileAttributes,
        internalFileAttributes: entry.internalFileAttributes,
        rawExtraField: entry.rawExtraField,
      }
      if (extraFieldAES) {
        addOpts.encryptionStrength = extraFieldAES.strength
      }
      if (entry.compressionMethod === 0) {
        addOpts.level = 0
      }
      await zipWriter.add(rawName, new BlobReader(compressedBlob), addOpts)
    }
  } finally {
    await zipReader.close()
  }

  return zipWriter.close()
}
