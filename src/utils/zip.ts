import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

export type ZipEntries = Map<string, Uint8Array>

export function unzipEntries(bytes: Uint8Array): ZipEntries {
  const out: ZipEntries = new Map()
  const unzipped = unzipSync(bytes)
  for (const [name, data] of Object.entries(unzipped)) {
    out.set(name, data)
  }
  return out
}

export function zipEntries(entries: ZipEntries): Uint8Array {
  const obj: Record<string, Uint8Array> = {}
  for (const [name, data] of entries) obj[name] = data
  return zipSync(obj, { level: 6 })
}

export function textFileBytes(text: string): Uint8Array {
  // Keep output stable for ForeFlight CSV imports.
  return strToU8(text, true)
}

export function bytesToText(bytes: Uint8Array): string {
  return strFromU8(bytes)
}

