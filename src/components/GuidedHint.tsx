import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'

const POPOVER_WIDTH_PX = 288
const POPOVER_Z_INDEX = 200

type GuidedHintProps = {
  hintId: string
  stepNumber: number
  title: string
  body: ReactNode
  isSeen: boolean
  onDismiss: (hintId: string) => void
  /** `light` for white / light UI (e.g. modals); default matches Tower Analysis panels. */
  surface?: 'dark' | 'light'
  /** Shown below the body in bold, above the action buttons (e.g. non-numbered navigation help). */
  footerBoldNote?: string
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
  surface = 'dark',
  footerBoldNote,
}: GuidedHintProps) {
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const descId = useId()
  const footerNoteId = useId()
  const footerText = footerBoldNote?.trim() ?? ''
  const describedBy = footerText ? `${descId} ${footerNoteId}` : descId

  useClickOutside([buttonRef, popoverRef], () => setOpen(false), open)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const updatePopoverPosition = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const margin = 10
    const alignRight = window.innerWidth - r.right < POPOVER_WIDTH_PX + margin
    let left = alignRight ? r.right - POPOVER_WIDTH_PX : r.left
    left = Math.max(margin, Math.min(left, window.innerWidth - POPOVER_WIDTH_PX - margin))

    const popoverH = popoverRef.current?.offsetHeight ?? 280
    const spaceBelow = window.innerHeight - r.bottom - margin
    const spaceAbove = r.top - margin
    const openAbove =
      spaceBelow < popoverH && spaceAbove > spaceBelow && spaceAbove >= popoverH * 0.85

    const base: CSSProperties = {
      position: 'fixed',
      zIndex: POPOVER_Z_INDEX,
      left,
      width: POPOVER_WIDTH_PX,
      maxHeight: 'min(22rem, calc(100vh - 1.5rem))',
    }

    if (openAbove) {
      setPopoverStyle({
        ...base,
        bottom: window.innerHeight - r.top + margin,
      })
    } else {
      setPopoverStyle({
        ...base,
        top: r.bottom + margin,
      })
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePopoverPosition()
    const raf = requestAnimationFrame(() => updatePopoverPosition())
    const onReflow = () => updatePopoverPosition()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, updatePopoverPosition, title, body, footerText])

  const showNumber = !isSeen

  const triggerClass =
    surface === 'light'
      ? 'inline-flex items-center gap-1 rounded-full border border-cap-ultramarine/35 bg-cap-ultramarine/[0.08] px-2 py-1 text-xs font-semibold text-cap-ultramarine hover:bg-cap-ultramarine/[0.14] focus:outline-none focus:ring-2 focus:ring-cap-ultramarine/40'
      : 'inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cap-yellow/70'

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className={triggerClass}
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

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={`${hintId}-popover`}
            role="dialog"
            aria-modal="false"
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            style={popoverStyle}
            className="overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 text-left text-gray-900 shadow-xl"
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

            {footerText ? (
              <p id={footerNoteId} className="mt-3 text-sm font-bold text-gray-900">
                {footerText}
              </p>
            ) : null}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
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
          </div>,
          document.body
        )}
    </span>
  )
}

