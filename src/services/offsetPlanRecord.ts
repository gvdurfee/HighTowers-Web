export type OffsetPlanPoint = {
  ptIdent: string
  g1000Name?: string
  lat: number
  lon: number
}

export type OffsetPlanFlag = {
  index: number
  ptIdent: string
  side: 'left' | 'right'
  reason: 'foldBack' | 'outsideCorridor' | 'straightWidthChange'
  message: string
  lat: number
  lon: number
}

export type OffsetPlanWidth = {
  leftNm: number
  rightNm: number
}

/** Saved with a flight plan. One record per plan, replaced on the next save. */
export type SavedOffsetPlan = {
  flightPlanId: string
  savedAt: string
  sequenceSignature: string
  widths: OffsetPlanWidth[]
  mode: 'published' | 'manual'
  /** Per-leg origin when the pilot filled widths the FAA text did not cover. */
  sources?: Array<'faa' | 'pilot' | 'empty'> | null
  manualMessage: string | null
  inner: OffsetPlanPoint[]
  outer: OffsetPlanPoint[]
  corridorLeft: OffsetPlanPoint[]
  corridorRight: OffsetPlanPoint[]
  flags: OffsetPlanFlag[]
}

export type OffsetPlanStore = {
  get(flightPlanId: string): Promise<SavedOffsetPlan | undefined>
  put(plan: SavedOffsetPlan): Promise<void>
}

export function offsetSequenceSignature(
  waypoints: { originalName: string; lat: number; lon: number }[]
): string {
  return waypoints.map((wp) => `${wp.originalName}@${wp.lat},${wp.lon}`).join('|')
}

export function assessSavedOffsetPlan(
  saved: SavedOffsetPlan | undefined,
  sequenceSignature: string
):
  | { status: 'none' }
  | { status: 'mismatch'; savedAt: string }
  | { status: 'match'; plan: SavedOffsetPlan } {
  if (!saved) return { status: 'none' }
  if (saved.sequenceSignature !== sequenceSignature) {
    return { status: 'mismatch', savedAt: saved.savedAt }
  }
  return { status: 'match', plan: saved }
}

export function offsetFormIsDirty(baseline: string, current: string): boolean {
  return baseline !== current
}

export function memoryOffsetPlanStore(): OffsetPlanStore {
  const records = new Map<string, SavedOffsetPlan>()
  return {
    async get(flightPlanId) {
      const found = records.get(flightPlanId)
      return found ? structuredClone(found) : undefined
    },
    async put(plan) {
      records.set(plan.flightPlanId, structuredClone(plan))
    },
  }
}

export function formatOffsetSavedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
