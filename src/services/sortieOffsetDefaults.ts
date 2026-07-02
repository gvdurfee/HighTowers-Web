import { parseWidthTexts } from '@survey-planning/mtrWidthParser.js'
import { parallelOffsetsForHalfWidth } from '@survey-planning/surveyGeometry.js'
import { buildLegWidthSummaries } from '@survey-planning/surveySortiePlanner.js'

const FALLBACK_OFFSETS_LABEL = '3, 9, 15, 21'

export type SortieOffsetWaypoint = {
  ptIdent: string
  lat: number
  lon: number
}

/** Max published half-width (NM) from parsed NASR width lines. */
export function maxHalfWidthNmFromWidthTexts(widthTexts: string[]): number | null {
  const spans = parseWidthTexts(widthTexts)
  if (spans.length === 0) return null
  let max = 0
  for (const span of spans) {
    max = Math.max(max, span.leftNm, span.rightNm)
  }
  return max > 0 ? max : null
}

export function formatSortieOffsetsLabel(offsets: number[]): string {
  if (offsets.length === 0) return FALLBACK_OFFSETS_LABEL
  return offsets.join(', ')
}

/** Default parallel-track offsets for the whole route from NASR width text. */
export function defaultSortieOffsetsLabelFromWidthTexts(widthTexts: string[]): string {
  const maxHalf = maxHalfWidthNmFromWidthTexts(widthTexts)
  if (maxHalf == null) return FALLBACK_OFFSETS_LABEL
  return formatSortieOffsetsLabel(parallelOffsetsForHalfWidth(maxHalf))
}

/**
 * Offsets for a waypoint sub-range — uses the widest half-width on legs inside the fragment.
 */
export function defaultSortieOffsetsForFragment(opts: {
  routeType: 'IR' | 'VR'
  routeNumber: string
  widthTexts: string[]
  waypoints: SortieOffsetWaypoint[]
  fromPt: string
  toPt: string
}): string {
  const { waypoints, widthTexts, fromPt, toPt } = opts
  if (!fromPt || !toPt || waypoints.length < 2) {
    return defaultSortieOffsetsLabelFromWidthTexts(widthTexts)
  }

  const fromIdx = waypoints.findIndex((w) => w.ptIdent === fromPt)
  const toIdx = waypoints.findIndex((w) => w.ptIdent === toPt)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
    return defaultSortieOffsetsLabelFromWidthTexts(widthTexts)
  }

  const lo = Math.min(fromIdx, toIdx)
  const hi = Math.max(fromIdx, toIdx)

  const legs = buildLegWidthSummaries({
    routeType: opts.routeType,
    routeNumber: opts.routeNumber,
    waypoints,
    widthTexts,
    teams: [],
    sortieBudgetNm: 500,
  })

  let maxHalf = 0
  for (const leg of legs) {
    const legFromIdx = waypoints.findIndex((w) => w.ptIdent === leg.fromPt)
    if (legFromIdx < lo || legFromIdx >= hi) continue
    if (leg.leftNm != null) maxHalf = Math.max(maxHalf, leg.leftNm)
    if (leg.rightNm != null) maxHalf = Math.max(maxHalf, leg.rightNm)
  }

  if (maxHalf <= 0) {
    return defaultSortieOffsetsLabelFromWidthTexts(widthTexts)
  }

  return formatSortieOffsetsLabel(parallelOffsetsForHalfWidth(maxHalf))
}
