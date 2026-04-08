/**
 * Compresses an image data URL for email embedding.
 * Resizes to max dimension and reduces JPEG quality until under target size.
 * Keeps images readable on desktop while staying under 500KB for email.
 */

const DEFAULT_MAX_BYTES = 500 * 1024 // 500KB
const MAX_DIMENSION = 1400 // px on longest side

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Compresses an image data URL to stay under maxBytes.
 * Uses JPEG format. PNG and other formats are converted to JPEG.
 *
 * @param dataUrl - Base64 data URL (image/jpeg, image/png, etc.)
 * @param maxBytes - Maximum file size in bytes (default 500KB)
 * @returns Compressed image as data URL, or original if already under limit
 */
export async function compressImageForEmail(
  dataUrl: string,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<string> {
  if (!dataUrl?.startsWith('data:')) return dataUrl

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Failed to load image'))
    i.src = dataUrl
  })

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)

  // Binary search for highest quality that stays under maxBytes
  let lo = 0.5
  let hi = 0.95
  let best = dataUrl

  for (let i = 0; i < 10; i++) {
    const q = (lo + hi) / 2
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', q)
    )
    if (!blob) break
    if (blob.size <= maxBytes) {
      lo = q
      best = await blobToDataUrl(blob)
    } else {
      hi = q
    }
  }

  return best
}
