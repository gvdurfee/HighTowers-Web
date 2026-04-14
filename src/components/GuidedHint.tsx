import { useEffect, useId, useMemo, useRef, useState } from 'react'

type GuidedHintProps = {
  hintId: string
  stepNumber: number
  title: string
  body: string
  isSeen: boolean
  onDismiss: (hintId: string) => void
}

function useClickOutside(
  refs: React.RefObject<HTMLElement>[],
  onOutside: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      for (const r of refs) {
        const el = r.current
        if (el && el.contains(target)) return
      }
      onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [enabled, onOutside, refs])
}

function BulbIcon({ on }: { on: boolean }) {
  // Material Symbols uses font-variation settings for filled/unfilled.
  const style = useMemo(
    () =>
      ({
        fontVariationSettings: `"FILL" ${on ? 1 : 0}, "wght" 400, "GRAD" 0, "opsz" 20`,
      }) as React.CSSProperties,
    [on]
  )
  return (
    <span
      className="material-symbols-outlined leading-none"
      style={style}
      aria-hidden
    >
      lightbulb
    </span>
  )
}

export function GuidedHint({
  hintId,
  stepNumber,
  title,
  body,
  isSeen,
  onDismiss,
}: GuidedHintProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const descId = useId()

  useClickOutside([buttonRef, popoverRef], () => setOpen(false), open)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const showNumber = !isSeen

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cap-yellow/70"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${hintId}-popover` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {showNumber && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cap-yellow text-gray-900"
            aria-label={`Tip ${stepNumber}`}
          >
            {stepNumber}
          </span>
        )}
        <BulbIcon on={!isSeen} />
        <span className="sr-only">Open tip: {title}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          id={`${hintId}-popover`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
          aria-describedby={descId}
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div id={headingId} className="font-semibold text-gray-900">
                {title}
              </div>
              <div id={descId} className="mt-1 text-sm text-gray-700">
                {body}
              </div>
            </div>
            <button
              type="button"
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Close tip"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              Not now
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-cap-ultramarine text-white font-medium hover:bg-cap-ultramarine/90"
              onClick={() => {
                onDismiss(hintId)
                setOpen(false)
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </span>
  )
}

