import { useEffect, useRef } from 'react'

interface MeasureLinesPanelProps {
  image: HTMLImageElement | null
  topSlider: number
  baseSlider: number
  measurementHeight: number
  onTopChange: (v: number) => void
  onBaseChange: (v: number) => void
  onHeightMeasured: (h: number) => void
}

export function MeasureLinesPanel({
  image,
  topSlider,
  baseSlider,
  measurementHeight,
  onTopChange,
  onBaseChange,
  onHeightMeasured,
}: MeasureLinesPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageAreaRef = useRef<HTMLDivElement>(null)

  // Report image area height so parent can use it for slider ranges
  useEffect(() => {
    if (!imageAreaRef.current || !image) return
    const measure = () => {
      const h = imageAreaRef.current?.clientHeight
      if (h && h > 0) onHeightMeasured(h)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(imageAreaRef.current)
    return () => ro.disconnect()
  }, [image, onHeightMeasured])

  if (!image) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-gray-500">Select an image to measure</p>
      </div>
    )
  }

  const containerH = measurementHeight || 400
  const aspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height) || 1.5
  const fitHeight = containerH
  const fitWidth = fitHeight * aspect

  const topY = topSlider
  const baseY = baseSlider

  const maxVal = Math.max(1, Math.round(fitHeight))

  return (
    <div
      ref={containerRef}
      className="relative flex-1 flex flex-col overflow-hidden bg-cap-silver rounded-lg"
      style={{ minHeight: 300 }}
    >
      {/* Image area - we measure this for slider coordinate system */}
      <div
        ref={imageAreaRef}
        className="relative flex-1 flex items-center justify-center min-h-0"
      >
        <div
          className="relative flex-shrink-0"
          style={{ width: fitWidth, height: fitHeight }}
        >
          <img
            src={image.src}
            alt="Tower"
            className="block"
            style={{ width: fitWidth, height: fitHeight, objectFit: 'contain' }}
            draggable={false}
          />
          {/* Red line - top of tower */}
          <div
            className="absolute left-0 right-0 h-0.5 bg-cap-pimento pointer-events-none z-10"
            style={{ top: topY }}
          />
          {/* Blue line - base of tower */}
          <div
            className="absolute left-0 right-0 h-0.5 bg-cap-ultramarine pointer-events-none z-10"
            style={{ top: baseY }}
          />
        </div>
      </div>

      {/* Sliders - symmetric fill: white ahead of thumb, colored behind */}
      <div className="flex-shrink-0 p-3 space-y-2 border-t border-gray-500/25 bg-black/[0.06]">
        <div className="space-y-0.5">
          <label className="text-xs text-cap-pimento font-medium block">Top of tower</label>
          <input
            type="range"
            min={0}
            max={maxVal}
            step={1}
            value={topSlider}
            onChange={(e) => onTopChange(Number(e.target.value))}
            className="w-full h-2 slider-fill-red cursor-pointer appearance-none bg-transparent"
            style={{ ['--fill-pct' as string]: `${(topSlider / maxVal) * 100}%` }}
            tabIndex={1}
            aria-label="Top of tower"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-xs text-cap-ultramarine font-medium block">Bottom of tower</label>
          <input
            type="range"
            min={0}
            max={maxVal}
            step={1}
            value={baseSlider}
            onChange={(e) => onBaseChange(Number(e.target.value))}
            className="w-full h-2 slider-fill-blue cursor-pointer appearance-none bg-transparent"
            style={{ ['--fill-pct' as string]: `${(baseSlider / maxVal) * 100}%` }}
            tabIndex={2}
            aria-label="Bottom of tower"
          />
        </div>
      </div>
    </div>
  )
}
