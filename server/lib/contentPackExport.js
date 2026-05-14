import AdmZip from 'adm-zip'
import { normalizeZipEntryName } from '../../shared/content-pack-core/zipSniff.js'

/**
 * @param {{ baselinePath: string, csvMemberPath: string, csvText: string }} input
 * @returns {Buffer}
 */
export function buildExportZipBuffer(input) {
  const zip = new AdmZip(input.baselinePath)
  const entries = zip.getEntries()
  let rawName = null
  for (const e of entries) {
    if (e.isDirectory) continue
    if (normalizeZipEntryName(e.entryName) === input.csvMemberPath) {
      rawName = e.entryName
      break
    }
  }
  if (!rawName) {
    throw new Error(`CSV member “${input.csvMemberPath}” not found in baseline ZIP`)
  }
  zip.updateFile(rawName, Buffer.from(input.csvText, 'utf8'))
  return zip.toBuffer()
}
