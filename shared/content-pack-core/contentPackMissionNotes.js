/**
 * Auto-generated paragraph(s) for the mission's Additional Notes after a
 * Content Pack apply. Each outcome category gets its own paragraph with a
 * distinctive marker so re-runs replace them in place without disturbing the
 * user's hand-typed Additional Notes.
 *
 * The paragraphs end up on the Air Force Report Form PDF, so wording is meant
 * to read naturally to a reviewing officer.
 */

const CONTENT_PACK_REFINEMENT_MARKER =
  'map to refined ForeFlight user waypoints (previously reported; updated elevation and location coordinates from Tower Data Analysis)'
const CONTENT_PACK_UNCHANGED_MARKER =
  'already match the ForeFlight content pack waypoints after four-decimal-degree rounding (no Content Pack changes were needed)'
const CONTENT_PACK_APPENDED_MARKER =
  'were added to the ForeFlight content pack as new user waypoints (previously unreported towers on this route)'

const ALL_MARKERS = [
  CONTENT_PACK_REFINEMENT_MARKER,
  CONTENT_PACK_UNCHANGED_MARKER,
  CONTENT_PACK_APPENDED_MARKER,
]

/** Removes any paragraphs the app previously appended for Content Pack apply outcomes. */
export function stripContentPackParagraphs(text) {
  const parts = text.split(/\n\n+/).filter((p) => !ALL_MARKERS.some((m) => p.includes(m)))
  return parts.join('\n\n').trim()
}

/** Back-compat alias kept so older callers/tests don't break. */
export function stripContentPackRefinementParagraph(text) {
  return stripContentPackParagraphs(text)
}

function formatTowerObservationList(nums) {
  const labels = nums.map((n) => `Tower ${n}`)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

/**
 * Merge or replace the auto-generated Content Pack apply paragraphs into the
 * mission's Additional Notes.
 *
 * @param {string | undefined} existingNotes
 * @param {{ refined: number[], unchanged: number[], appended: number[] }} groups
 * @returns {string}
 */
export function mergeContentPackApplyMissionNotes(existingNotes, groups) {
  const base = stripContentPackParagraphs((existingNotes ?? '').trim())
  const paragraphs = []
  if (groups.refined.length > 0) {
    paragraphs.push(
      `The following tower observation(s) ${CONTENT_PACK_REFINEMENT_MARKER}: ${formatTowerObservationList(groups.refined)}.`
    )
  }
  if (groups.unchanged.length > 0) {
    paragraphs.push(
      `The following tower observation(s) ${CONTENT_PACK_UNCHANGED_MARKER}: ${formatTowerObservationList(groups.unchanged)}.`
    )
  }
  if (groups.appended.length > 0) {
    paragraphs.push(
      `The following tower observation(s) ${CONTENT_PACK_APPENDED_MARKER}: ${formatTowerObservationList(groups.appended)}.`
    )
  }
  if (paragraphs.length === 0) return base
  const block = paragraphs.join('\n\n')
  return base ? `${base}\n\n${block}` : block
}

/**
 * Back-compat wrapper: only handles refined observation numbers.
 * Prefer `mergeContentPackApplyMissionNotes` for new callers.
 */
export function mergeContentPackRefinementMissionNotes(existingNotes, refinedTowerObservationNumbers) {
  return mergeContentPackApplyMissionNotes(existingNotes, {
    refined: refinedTowerObservationNumbers,
    unchanged: [],
    appended: [],
  })
}
