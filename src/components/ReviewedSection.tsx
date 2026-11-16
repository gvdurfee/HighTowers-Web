import type { ReactNode } from 'react'
import { forwardRef } from 'react'
import { guidedHintPanelClassName } from '@/components/GuidedHint'

export const ReviewedSection = forwardRef<
  HTMLElement,
  {
    id: string
    title: string
    reviewed: boolean
    problem: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }
>(function ReviewedSection({ id, title, reviewed, problem, open, onOpenChange, children }, ref) {
  const regionId = `review-${id}`
  const expanded = open || Boolean(problem)
  const label = reviewed ? `${title} – Reviewed` : title
  return (
    <section
      ref={ref}
      id={regionId}
      aria-expanded={expanded}
      className={
        reviewed && !expanded
          ? 'rounded-xl border border-emerald-200 bg-emerald-50'
          : 'rounded-xl border border-gray-200 bg-white'
      }
    >
      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={expanded}
          aria-controls={`${regionId}-detail`}
          onChange={(event) => onOpenChange(event.target.checked)}
        />
        <span className={reviewed && !expanded ? 'text-sm font-medium text-emerald-900' : 'text-base font-semibold text-gray-900'}>
          {label}
        </span>
      </label>
      {expanded && (
        <div id={`${regionId}-detail`} className={`mx-4 mb-4 p-4 ${guidedHintPanelClassName}`}>
          {problem && (
            <p role="alert" className="mb-3 text-sm font-semibold text-cap-pimento">
              {problem}
            </p>
          )}
          {children}
        </div>
      )}
    </section>
  )
})
