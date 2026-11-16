import { parallelOffsetsForHalfWidth } from '@survey-planning/surveyGeometry.js'

const MARKS_PREFIX = 'htw.teamDispatch.reviewed.'
const AWAITING_PREFIX = 'htw.teamDispatch.awaitingSave.'

export const TEAM_DISPATCH_SECTIONS = [
  { id: 'route', title: 'Route' },
  { id: 'widths', title: 'Corridor widths' },
  { id: 'tracks', title: 'Survey tracks' },
  { id: 'aircraft', title: 'Aircraft and departures' },
  { id: 'distance', title: 'Distance limit and landing' },
  { id: 'results', title: 'Planner results and split' },
  { id: 'sides', title: 'Sortie 1 sides' },
] as const

export type TeamDispatchSectionId = (typeof TEAM_DISPATCH_SECTIONS)[number]['id']

/** Section id -> the field snapshot that was on screen when it was marked reviewed. */
export type ReviewMarks = Partial<Record<TeamDispatchSectionId, string>>

export function reviewStorageKey(planId: string): string {
  return `${MARKS_PREFIX}${planId}`
}

export function readReviewMarks(planId: string): ReviewMarks {
  if (!planId || typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(reviewStorageKey(planId))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as ReviewMarks
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeReviewMarks(planId: string, marks: ReviewMarks): void {
  if (!planId || typeof localStorage === 'undefined') return
  const key = reviewStorageKey(planId)
  if (Object.keys(marks).length === 0) localStorage.removeItem(key)
  else localStorage.setItem(key, JSON.stringify(marks))
}

export function clearReviewMarks(planId: string): void {
  writeReviewMarks(planId, {})
}

export function markSectionReviewed(marks: ReviewMarks, id: TeamDispatchSectionId, signature: string): ReviewMarks {
  return { ...marks, [id]: signature }
}

export function clearReviewedSections(marks: ReviewMarks, ids: TeamDispatchSectionId[]): ReviewMarks {
  const next = { ...marks }
  for (const id of ids) delete next[id]
  return next
}

/** Drop a reviewed mark when that section's fields no longer match the snapshot. */
export function reviewMarksAfterChange(marks: ReviewMarks, signatures: Record<string, string>): ReviewMarks {
  let changed = false
  const next: ReviewMarks = {}
  for (const section of TEAM_DISPATCH_SECTIONS) {
    const saved = marks[section.id]
    if (saved == null) continue
    if (signatures[section.id] === saved) next[section.id] = saved
    else changed = true
  }
  return changed ? next : marks
}

export function saveBlocker(opts: {
  missingSideLabels: string[]
  segmentMessages: string[]
  overLimit?: { ident: string; number: number; nm: number } | null
  coverageMessage?: string | null
}): { sectionId: TeamDispatchSectionId | null; reason: string | null } {
  if (opts.missingSideLabels.length > 0) {
    return { sectionId: 'sides', reason: `Choose Inner or Outer for ${opts.missingSideLabels[0]}.` }
  }
  if (opts.coverageMessage) {
    return { sectionId: 'results', reason: opts.coverageMessage }
  }
  if (opts.segmentMessages.length > 0) {
    return { sectionId: 'results', reason: opts.segmentMessages[0] }
  }
  if (opts.overLimit) {
    const nm = Math.round(opts.overLimit.nm * 10) / 10
    return {
      sectionId: 'results',
      reason: `${opts.overLimit.ident} sortie ${opts.overLimit.number} is ${nm} NM. Add a refuel airport or another aircraft.`,
    }
  }
  return { sectionId: null, reason: null }
}

export function saveBarStatus(opts: { stale: boolean; unsaved: boolean; saved: boolean }): string {
  if (opts.stale) return 'Results out of date. Run again.'
  if (opts.unsaved || !opts.saved) return 'Unsaved changes'
  return 'Saved'
}

export function teamDispatchMapPath(planId: string): string {
  return `/map?plan=${encodeURIComponent(planId)}`
}

export function planIdFromMapSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('plan')
  return value && value.trim() ? value : null
}

export function markTeamPlanAwaitingSave(planId: string): void {
  if (!planId || typeof localStorage === 'undefined') return
  localStorage.setItem(`${AWAITING_PREFIX}${planId}`, '1')
}

export function clearTeamPlanAwaitingSave(planId: string): void {
  if (!planId || typeof localStorage === 'undefined') return
  localStorage.removeItem(`${AWAITING_PREFIX}${planId}`)
}

export function teamPlanAwaitingSave(planId: string): boolean {
  if (!planId || typeof localStorage === 'undefined') return false
  return localStorage.getItem(`${AWAITING_PREFIX}${planId}`) === '1'
}

function samePoint(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
}

/** Every required lane on every piece must be flown by exactly one crew. */
export function uncoveredLaneMessage(opts: {
  points: Array<{ ptIdent: string }>
  legs: Array<{ leftNm: number; rightNm: number } | null>
  policy: { firstOffsetNm: number; stepNm: number }
  crews: Array<{
    sorties: Array<{ fromPt: string; toPt: string; surveySide?: 'left' | 'right' | null; offsetsNm?: number[] }>
  }>
}): string | null {
  const counts = new Map<string, { from: string; to: string; side: string; count: number }>()
  for (let index = 0; index < opts.points.length - 1; index += 1) {
    const leg = opts.legs[index]
    if (!leg) continue
    const from = opts.points[index].ptIdent
    const to = opts.points[index + 1].ptIdent
    for (const side of ['left', 'right'] as const) {
      const width = side === 'left' ? leg.leftNm : leg.rightNm
      for (const offset of parallelOffsetsForHalfWidth(width, opts.policy)) {
        counts.set(`${index}:${side}:${Math.round(offset * 10)}`, { from, to, side, count: 0 })
      }
    }
  }
  for (const crew of opts.crews) {
    for (const sortie of crew.sorties) {
      if (!sortie.surveySide || !sortie.offsetsNm?.length) continue
      const start = opts.points.findIndex((point) => samePoint(point.ptIdent, sortie.fromPt))
      const end = opts.points.findIndex((point) => samePoint(point.ptIdent, sortie.toPt))
      if (start < 0 || end <= start) continue
      for (let index = start; index < end; index += 1) {
        for (const offset of sortie.offsetsNm) {
          const key = `${index}:${sortie.surveySide}:${Math.round(offset * 10)}`
          const row = counts.get(key)
          if (row) row.count += 1
        }
      }
    }
  }
  for (const row of counts.values()) {
    if (row.count === 0) return `${row.from}–${row.to} ${row.side} is not covered.`
    if (row.count > 1) return `${row.from}–${row.to} ${row.side} is flown by more than one crew.`
  }
  return null
}
