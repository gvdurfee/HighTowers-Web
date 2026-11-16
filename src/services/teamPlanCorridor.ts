/**
 * On a saved team plan, Team Dispatch owns corridor widths and track spacing.
 * Map View shows that plan read-only. db.offsetPlans is not applied, so an older
 * map offset record cannot override the team plan.
 * Stored span widths win over the FAA text. A team plan saved before widths were
 * stored still uses the FAA text.
 * A single-aircrew plan has no saved team plan, and its offset panel stays editable.
 */

import type { TeamPlanSpanWidth } from '@/services/teamPlanRecord'

export const FAA_WIDTH_FALLBACK_NOTE = 'Widths from FAA text; save in Team Dispatch to lock them.'
export function teamPlanOwnsCorridor(savedTeamPlan: unknown): boolean {
  if (!savedTeamPlan || typeof savedTeamPlan !== 'object') return false
  const teams = (savedTeamPlan as { teams?: unknown }).teams
  return Array.isArray(teams) && teams.length > 0
}

function finiteWidth(value: unknown): number | null {
  const width = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(width) && width >= 1 ? width : null
}

/** Widths worth locking. A blank or sub-1 NM span means the record should omit them. */
export function spanWidthsFromRows(
  rows: Array<{ fromPt: string; toPt: string; leftNm: string; rightNm: string }>
): TeamPlanSpanWidth[] | null {
  if (rows.length === 0) return null
  const widths: TeamPlanSpanWidth[] = []
  for (const row of rows) {
    const leftNm = finiteWidth(row.leftNm)
    const rightNm = finiteWidth(row.rightNm)
    if (leftNm == null || rightNm == null || !row.fromPt || !row.toPt) return null
    widths.push({ fromPt: row.fromPt, toPt: row.toPt, leftNm, rightNm })
  }
  return widths
}

/** Saved left/right widths, or null when this record has none (older plans). */
export function teamPlanSpanWidths(savedTeamPlan: unknown): TeamPlanSpanWidth[] | null {
  if (!teamPlanOwnsCorridor(savedTeamPlan)) return null
  const raw = (savedTeamPlan as { spanWidths?: unknown }).spanWidths
  if (!Array.isArray(raw) || raw.length === 0) return null
  const widths = spanWidthsFromRows(
    raw.map((row) => {
      const span = row as Partial<TeamPlanSpanWidth>
      return {
        fromPt: span.fromPt ?? '',
        toPt: span.toPt ?? '',
        leftNm: String(span.leftNm ?? ''),
        rightNm: String(span.rightNm ?? ''),
      }
    })
  )
  return widths && widths.length === raw.length ? widths : null
}

function samePoint(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
}

/**
 * Line the saved spans up with the route points.
 * One published span can cover several legs (B to M1 covers B–C, C–D, and so on).
 * A gap, an overlap, or a span that is not on the route falls back to the FAA text.
 */
export function savedWidthsForPoints(
  points: { ptIdent: string }[],
  widths: TeamPlanSpanWidth[]
): Array<{ leftNm: number; rightNm: number }> | null {
  if (points.length < 2 || widths.length === 0) return null
  const indexOf = (ident: string) => points.findIndex((point) => samePoint(point.ptIdent, ident))
  const spans = widths.map((width) => ({
    width,
    from: indexOf(width.fromPt),
    to: indexOf(width.toPt),
  }))
  if (spans.some((span) => span.from < 0 || span.to <= span.from)) return null
  const legs: Array<{ leftNm: number; rightNm: number }> = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const matches = spans.filter((span) => span.from <= index && index < span.to)
    if (matches.length !== 1) return null
    legs.push({ leftNm: matches[0].width.leftNm, rightNm: matches[0].width.rightNm })
  }
  return legs
}

export function teamPlanTrackSpacing(savedTeamPlan: unknown): { firstOffsetNm: number; stepNm: number } | null {
  if (!teamPlanOwnsCorridor(savedTeamPlan)) return null
  const record = savedTeamPlan as { firstOffsetNm?: number; stepNm?: number }
  return {
    firstOffsetNm: record.firstOffsetNm != null && record.firstOffsetNm > 0 ? record.firstOffsetNm : 3,
    stepNm: record.stepNm != null && record.stepNm > 0 ? record.stepNm : 6,
  }
}
