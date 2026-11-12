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

export const OFFSET_PLAN_VERSION = 1
export const SPUR_PROPOSAL_VERSION = 1

export const RESAVE_IN_MAP_VIEW =
  'Re-save in Map View. Offset downloads stay off until this plan is saved again.'

export type TrackOffsetMode = 'half' | 'explicit'

/** One side of one leg. Half uses the corridor width divided by two. Explicit is the flown distance. */
export type TrackOffsetRecord = {
  leftMode: TrackOffsetMode
  leftNm: number | null
  rightMode: TrackOffsetMode
  rightNm: number | null
}

export type SpurDecision = 'unset' | 'rejected' | 'accepted'

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
  /** Absent on plans saved before track offsets. Those plans are not current. */
  planVersion?: number
  fingerprint?: string
  trackOffsets?: TrackOffsetRecord[]
  sortie1Side?: 'inner' | 'outer' | null
  departureIdent?: string | null
  destinationIdent?: string | null
  spurDecision?: SpurDecision
  spurProposalVersion?: number
}

export type OffsetFreshnessInput = {
  waypoints: { originalName: string; lat: number; lon: number }[]
  widths: OffsetPlanWidth[]
  trackOffsets: TrackOffsetRecord[]
  sortie1Side: 'inner' | 'outer' | null
  departureIdent: string | null
  destinationIdent: string | null
  spurDecision: SpurDecision
  spurProposalVersion: number
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

export function trackRecordFromLeg(leg: {
  trackLeftNm?: number | null
  trackRightNm?: number | null
}): TrackOffsetRecord {
  return {
    leftMode: leg.trackLeftNm == null ? 'half' : 'explicit',
    leftNm: leg.trackLeftNm == null ? null : leg.trackLeftNm,
    rightMode: leg.trackRightNm == null ? 'half' : 'explicit',
    rightNm: leg.trackRightNm == null ? null : leg.trackRightNm,
  }
}

export function blankTrackRecord(): TrackOffsetRecord {
  return { leftMode: 'half', leftNm: null, rightMode: 'half', rightNm: null }
}

function ident(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text.toUpperCase() : null
}

/** Stable fingerprint of the inputs that an offset download is allowed to represent. */
export function offsetPlanFingerprint(input: OffsetFreshnessInput): string {
  return JSON.stringify({
    version: OFFSET_PLAN_VERSION,
    waypoints: input.waypoints.map((wp) => [wp.originalName, wp.lat, wp.lon]),
    widths: input.widths.map((width) => [width.leftNm, width.rightNm]),
    trackOffsets: input.trackOffsets.map((track) => [track.leftMode, track.leftNm, track.rightMode, track.rightNm]),
    sortie1Side: input.sortie1Side,
    departureIdent: ident(input.departureIdent),
    destinationIdent: ident(input.destinationIdent),
    spurDecision: input.spurDecision,
    spurProposalVersion: input.spurProposalVersion,
  })
}

/**
 * Freshness for a page that does not edit widths. Widths and track offsets come from the save.
 * Airports and the waypoint list come from the flight plan as it is now.
 * The chosen sortie side is not part of this check: the save already holds both tracks.
 */
export function fingerprintIgnoringSortieSide(fingerprint: string): string {
  try {
    const parsed = JSON.parse(fingerprint) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fingerprint
    delete parsed.sortie1Side
    return JSON.stringify(parsed)
  } catch {
    return fingerprint
  }
}

/** Widths and tracks come from the save. Airports and waypoints come from the flight plan. */
export function freshnessForSavedPlan(opts: {
  waypoints: { originalName: string; lat: number; lon: number }[]
  saved: SavedOffsetPlan | undefined
  sortie1Side: 'inner' | 'outer' | null | undefined
  departureIdent: string | null
  destinationIdent: string | null
}): OffsetFreshnessInput {
  const widths = opts.saved?.widths ?? []
  const trackOffsets = widths.map((_, index) => opts.saved?.trackOffsets?.[index] ?? blankTrackRecord())
  const side = opts.sortie1Side === 'inner' || opts.sortie1Side === 'outer' ? opts.sortie1Side : null
  return {
    waypoints: opts.waypoints,
    widths,
    trackOffsets,
    sortie1Side: side,
    departureIdent: opts.departureIdent,
    destinationIdent: opts.destinationIdent,
    spurDecision: opts.saved?.spurDecision ?? 'unset',
    spurProposalVersion: opts.saved?.spurProposalVersion ?? SPUR_PROPOSAL_VERSION,
  }
}

export function assessSavedOffsetPlan(
  saved: SavedOffsetPlan | undefined,
  current: OffsetFreshnessInput
):
  | { status: 'none' }
  | { status: 'stale'; reason: 'legacy' | 'sequence' | 'fingerprint'; savedAt: string }
  | { status: 'match'; plan: SavedOffsetPlan } {
  if (!saved) return { status: 'none' }
  if (saved.planVersion !== OFFSET_PLAN_VERSION || !saved.fingerprint) {
    return { status: 'stale', reason: 'legacy', savedAt: saved.savedAt }
  }
  if (fingerprintIgnoringSortieSide(saved.fingerprint) !== fingerprintIgnoringSortieSide(offsetPlanFingerprint(current))) {
    const sequenceChanged = saved.sequenceSignature !== offsetSequenceSignature(current.waypoints)
    return { status: 'stale', reason: sequenceChanged ? 'sequence' : 'fingerprint', savedAt: saved.savedAt }
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
