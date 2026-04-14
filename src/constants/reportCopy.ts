/** Shown in the Report Form textarea by default and in the PDF when the user leaves notes blank. */
export const ADDITIONAL_NOTES_DEFAULT = 'Nothing additional to report.'

/** AcroForm + app textarea cap so PDF fill and UI stay aligned (tower row fields stay at 240 in the PDF layer). */
export const ADDITIONAL_NOTES_MAX_LENGTH = 1500

export function displayAdditionalNotes(raw: string): string {
  const t = raw.trim()
  return t.length > 0 ? raw.trim() : ADDITIONAL_NOTES_DEFAULT
}

/** Display string for PDF fields and map appendix, capped for the additional-notes AcroForm limit. */
export function additionalNotesForPdf(raw: string): string {
  return displayAdditionalNotes(raw).slice(0, ADDITIONAL_NOTES_MAX_LENGTH)
}

/** Clamp raw textarea value when loading from storage (missions saved before the cap existed). */
export function clampAdditionalNotesInput(raw: string): string {
  if (raw.length <= ADDITIONAL_NOTES_MAX_LENGTH) return raw
  return raw.slice(0, ADDITIONAL_NOTES_MAX_LENGTH)
}
