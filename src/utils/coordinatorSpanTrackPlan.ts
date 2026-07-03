import {
  defaultSpanTrackPlanFromWidthTexts,
  formatOffsetsList,
  parseOffsetsListInput,
  validateSpanTrackPlan,
} from '@survey-planning/corridorTrackPlan.js'
import { parallelOffsetsForHalfWidth } from '@survey-planning/surveyGeometry.js'

export type SpanTrackPlanEntry = {
  fromPt: string
  toPt: string
  leftNm: number
  rightNm: number
  leftOffsets: number[]
  rightOffsets: number[]
  rawText?: string
}

export type SpanTrackRowState = {
  fromPt: string
  toPt: string
  leftNm: string
  rightNm: string
  leftOffsetsText: string
  rightOffsetsText: string
  displayText: string
}

export function formatWidthTextDisplay(text: string): string {
  const trimmed = text.trim()
  if (trimmed.toUpperCase().startsWith('CORRIDORS ARE')) return trimmed
  return `CORRIDORS ARE ${trimmed}`
}

export function spanTrackRowsFromWidthTexts(widthTexts: string[]): SpanTrackRowState[] {
  return defaultSpanTrackPlanFromWidthTexts(widthTexts).map(entryToRow)
}

function entryToRow(entry: SpanTrackPlanEntry): SpanTrackRowState {
  const displayText = entry.rawText
    ? formatWidthTextDisplay(entry.rawText)
    : formatSpanLabel(entry.fromPt, entry.toPt)
  return {
    fromPt: entry.fromPt,
    toPt: entry.toPt,
    leftNm: String(entry.leftNm),
    rightNm: String(entry.rightNm),
    leftOffsetsText: formatOffsetsList(entry.leftOffsets),
    rightOffsetsText: formatOffsetsList(entry.rightOffsets),
    displayText,
  }
}

export function formatSpanLabel(fromPt: string, toPt: string): string {
  if (fromPt === '*' && toPt === '*') return 'Entire route'
  return `${fromPt}→${toPt}`
}

export function spanTrackPlanFromRows(rows: SpanTrackRowState[]): SpanTrackPlanEntry[] {
  return rows.map((row) => ({
    fromPt: row.fromPt,
    toPt: row.toPt,
    leftNm: Number(row.leftNm),
    rightNm: Number(row.rightNm),
    leftOffsets: parseOffsetsListInput(row.leftOffsetsText),
    rightOffsets: parseOffsetsListInput(row.rightOffsetsText),
    rawText: row.displayText.replace(/^CORRIDORS ARE\s+/i, ''),
  }))
}

export function validateSpanTrackRows(rows: SpanTrackRowState[]): string | null {
  if (rows.length === 0) return 'No corridor width spans loaded.'
  try {
    const plan = spanTrackPlanFromRows(rows)
    return validateSpanTrackPlan(plan)
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid corridor track plan.'
  }
}

/** Recompute offset lists from current half-widths using wing default policy. */
export function resetRowOffsetsToDefault(row: SpanTrackRowState): SpanTrackRowState {
  const leftNm = Number(row.leftNm)
  const rightNm = Number(row.rightNm)
  return {
    ...row,
    leftOffsetsText:
      Number.isFinite(leftNm) && leftNm > 0
        ? formatOffsetsList(parallelOffsetsForHalfWidth(leftNm))
        : row.leftOffsetsText,
    rightOffsetsText:
      Number.isFinite(rightNm) && rightNm > 0
        ? formatOffsetsList(parallelOffsetsForHalfWidth(rightNm))
        : row.rightOffsetsText,
  }
}

export { parseOffsetsListInput, formatOffsetsList }
