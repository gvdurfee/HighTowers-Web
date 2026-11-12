/** Placeholder copy. Wording may change after MVP training. Logic should import these, not restate them. */

export const SINGLE_AIRCREW_SPUR_HINT =
  'This route has a spur, a leg that goes out to a point and comes straight back. Sortie 1 flies it once: down one side, a short crossover at the far end, then back up the other side. Sortie 2 skips the spur. If weather cuts Sortie 1 short, fly the spur later as its own flight plan.'

export const OFFSET_SORTIE_FILES_HINT =
  "Sortie 1 and Sortie 2 fly opposite sides of the route. Each downloads as its own file, already in flying order, so don't invert Sortie 2 on the G1000. Downloads turn on after Map View saves the offset plan."

export const OFFSET_SORTIE_FILES_SPUR_LEAD =
  'Sortie 1 and Sortie 2 fly opposite sides of the route, except any spur, which Sortie 1 flies on both sides.'

/** The offset-files paragraph. A spur replaces only the first sentence. */
export function offsetSortieFilesHint(hasSpur: boolean): string {
  if (!hasSpur) return OFFSET_SORTIE_FILES_HINT
  const rest = OFFSET_SORTIE_FILES_HINT.slice(OFFSET_SORTIE_FILES_HINT.indexOf('. ') + 2)
  return `${OFFSET_SORTIE_FILES_SPUR_LEAD} ${rest}`
}
