import {
  ADDITIONAL_NOTES_DEFAULT,
  clampAdditionalNotesInput,
} from '@/constants/reportCopy'
import {
  mergeContentPackApplyMissionNotes as mergeAllShared,
  mergeContentPackRefinementMissionNotes as mergeRefinedShared,
  stripContentPackParagraphs as stripAllShared,
  stripContentPackRefinementParagraph as stripRefinedShared,
} from '@content-pack/core/contentPackMissionNotes.js'

export type ContentPackApplyTowerGroups = {
  /** Observations whose CSV rows were updated (≤30 m refinements). */
  refined: number[]
  /** Observations that already matched ForeFlight to four decimals (CSV unchanged). */
  unchanged: number[]
  /** Observations appended to the CSV as new user waypoints. */
  appended: number[]
}

export function stripContentPackParagraphs(text: string): string {
  return stripAllShared(text)
}

/** Back-compat alias kept so older callers/tests don't break. */
export function stripContentPackRefinementParagraph(text: string): string {
  return stripRefinedShared(text)
}

/**
 * Merge or replace the auto-generated Content Pack apply paragraphs into the
 * mission's Additional Notes. Each non-empty bucket gets its own paragraph
 * with a distinctive marker so re-running an apply replaces them in place
 * without disturbing manually typed text.
 */
export function mergeContentPackApplyMissionNotes(
  existingNotes: string | undefined,
  groups: ContentPackApplyTowerGroups
): string {
  return mergeAllShared(existingNotes, groups)
}

/** Back-compat wrapper: refined observations only. Prefer the all-outcomes function above. */
export function mergeContentPackRefinementMissionNotes(
  existingNotes: string | undefined,
  refinedTowerObservationNumbers: number[]
): string {
  return mergeRefinedShared(existingNotes, refinedTowerObservationNumbers)
}

/** Trim/clamp + drop the default-text-only case so we don't persist a no-op string. */
export function persistableMissionNotes(merged: string): string | undefined {
  const clamped = clampAdditionalNotesInput(merged).trim()
  if (!clamped || clamped === ADDITIONAL_NOTES_DEFAULT) return undefined
  return clamped
}
