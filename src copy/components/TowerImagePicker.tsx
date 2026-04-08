import { useRef } from 'react'
import exifr from 'exifr'

export interface ImageMetadata {
  image: HTMLImageElement
  latitude?: number
  longitude?: number
  altitudeFt?: number
  focalLengthMm?: number
  cameraModel?: string
}

interface TowerImagePickerProps {
  onSelect: (meta: ImageMetadata) => void
  disabled?: boolean
}

export function TowerImagePicker({ onSelect, disabled }: TowerImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
    })

    // Convert to data URL so the image persists after we revoke the blob URL
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0)
      img.src = canvas.toDataURL('image/jpeg', 0.9)
    }
    URL.revokeObjectURL(objectUrl)

    let latitude: number | undefined
    let longitude: number | undefined
    let altitudeFt: number | undefined
    let focalLengthMm: number | undefined
    let cameraModel: string | undefined

    try {
      // exifr.gps() reliably extracts GPS from EXIF or XMP (many phones/cameras use XMP)
      const gpsData = await exifr.gps(file).catch(() => null)
      if (gpsData?.latitude != null && gpsData?.longitude != null) {
        latitude = gpsData.latitude
        longitude = gpsData.longitude
      }

      const exif = await exifr.parse(file, {
        pick: ['latitude', 'longitude', 'Altitude', 'FocalLength', 'FocalLengthIn35mmFormat', 'Model'],
        gps: true,
        xmp: true,
      })
      if (exif) {
        // Prefer gps() result; fallback to parse if gps() didn't find it
        if (latitude == null) latitude = exif.latitude as number | undefined
        if (longitude == null) longitude = exif.longitude as number | undefined
        const altM = exif.Altitude as number | undefined
        altitudeFt = altM != null ? altM * 3.28084 : undefined
        focalLengthMm = (exif.FocalLengthIn35mmFormat ?? exif.FocalLength) as number | undefined
        cameraModel = exif.Model as string | undefined
      }
    } catch {
      // No EXIF
    }

    onSelect({
      image: img,
      latitude,
      longitude,
      altitudeFt,
      focalLengthMm,
      cameraModel,
    })

    e.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="w-full py-12 px-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-cap-ultramarine hover:bg-cap-ultramarine/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="text-cap-ultramarine font-medium">Select Image</span>
        <p className="text-sm text-gray-500 mt-2">
          Choose a tower photo with GPS metadata for best results
        </p>
      </button>
    </>
  )
}
