export type WidthSource = 'faa' | 'pilot' | 'empty'

export type PilotWidthRow = {
  left: string
  right: string
  source: WidthSource
  reason: 'not-covered' | 'unreadable' | null
  clause: string | null
}

export function pilotEntryMessage(filled: number, total: number): string {
  return `Published widths were filled for ${filled} of ${total} legs. Enter left and right widths for the highlighted legs from your AP/1B or Military Flight Bag. This happens when the FAA width text doesn't cover a leg or is written in a form the app can't read.`
}

export function legEntryReason(
  reason: 'not-covered' | 'unreadable' | null,
  clause?: string | null
): string | null {
  if (reason === 'unreadable') {
    return clause ? `FAA text not readable: ${clause}` : 'FAA text not readable'
  }
  if (reason === 'not-covered') return 'not covered by FAA text'
  return null
}

export function downloadBlockReason(rows: Array<{ left: string; right: string }>): string | null {
  const missing = rows.some((row) => !rowComplete(row))
  if (!missing) return null
  return 'Enter a left and right width for every leg before downloading.'
}

export type PublishedWidthLeg = {
  fromPt: string
  toPt: string
  leftNm: number
  rightNm: number
}

function normalizeNm(value: number): number {
  return Math.round(value * 1000) / 1000
}

function formatNm(value: number): string {
  return String(normalizeNm(value))
}

type WidthHit = {
  side: 'left' | 'right'
  fromPt: string
  toPt: string
  index: number
}

function contiguousSpans(hits: WidthHit[]): Array<{ fromPt: string; toPt: string }> {
  const ordered = [...hits].sort((a, b) => a.index - b.index)
  const spans: Array<{ fromPt: string; toPt: string; end: number }> = []
  for (const hit of ordered) {
    const last = spans[spans.length - 1]
    if (last && hit.index === last.end + 1) {
      last.toPt = hit.toPt
      last.end = hit.index
    } else {
      spans.push({ fromPt: hit.fromPt, toPt: hit.toPt, end: hit.index })
    }
  }
  return spans
}

function phraseForWidth(width: number, hits: WidthHit[]): string {
  const half = formatNm(width / 2)
  const widthText = formatNm(width)
  const sides = new Set(hits.map((hit) => hit.side))
  if (sides.size > 1) return `${half} NM on ${widthText} NM sides`
  const side = hits[0]?.side ?? 'left'
  const spans = contiguousSpans(hits).filter((span) => span.fromPt && span.toPt)
  if (spans.length === 1) {
    return `${half} NM on the ${widthText} NM ${side} side from ${spans[0].fromPt} to ${spans[0].toPt}`
  }
  if (spans.length === 2) {
    return `${half} NM on the ${widthText} NM ${side} side from ${spans[0].fromPt} to ${spans[0].toPt} and ${spans[1].fromPt} to ${spans[1].toPt}`
  }
  return `${half} NM on ${widthText} NM ${side} sides`
}

/**
 * One short note from the route's published side widths.
 * Each distinct width is named once. A width used on one side of one stretch names that stretch.
 */
export function publishedWidthNote(
  routeLabel: string,
  legs: PublishedWidthLeg[],
  pilotEntered = false
): string | null {
  void routeLabel
  const groups = new Map<number, WidthHit[]>()
  legs.forEach((leg, index) => {
    if (!Number.isFinite(leg.leftNm) || !Number.isFinite(leg.rightNm)) return
    for (const side of ['left', 'right'] as const) {
      const width = normalizeNm(side === 'left' ? leg.leftNm : leg.rightNm)
      const hits = groups.get(width) ?? []
      hits.push({ side, fromPt: leg.fromPt, toPt: leg.toPt, index })
      groups.set(width, hits)
    }
  })
  if (groups.size === 0) return null
  const phrases = [...groups.entries()].map(([width, hits]) => phraseForWidth(width, hits))
  const pilot = pilotEntered ? ' Some widths entered by pilot.' : ''
  void phrases
  return `Tracks: first 2.5 NM, then every 5 NM, to the published edge.${pilot}`
}

export function rowComplete(row: { left: string; right: string }): boolean {
  const leftNm = Number(row.left)
  const rightNm = Number(row.right)
  return row.left.trim() !== '' && row.right.trim() !== '' && Number.isFinite(leftNm) && Number.isFinite(rightNm) && leftNm >= 0 && rightNm >= 0
}

/** FAA values replace a leg the text covers. Pilot values stay on legs that stay blank. */
export function mergeReloadedWidths(faaRows: PilotWidthRow[], previous: PilotWidthRow[] | null): PilotWidthRow[] {
  return faaRows.map((row, index) => {
    if (row.source === 'faa' && rowComplete(row)) return row
    const pilot = previous?.[index]
    if (pilot?.source === 'pilot' && rowComplete(pilot)) {
      return { ...pilot, reason: row.reason, clause: row.clause }
    }
    return row
  })
}
