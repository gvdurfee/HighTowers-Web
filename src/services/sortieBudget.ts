/** Dispatcher-facing sortie distance limit. Planner callers that pass an explicit budget are unchanged. */
export const SORTIE_BUDGET_DEFAULT_NM = 400
export const SORTIE_BUDGET_MIN_NM = 100
export const SORTIE_BUDGET_MAX_NM = 500
export const SORTIE_BUDGET_STEP_NM = 50

/**
 * No survey-speed or ground-speed setting exists in the app.
 * Endurance hours next to the distance field use this constant: hours = NM / KTAS.
 */
export const SURVEY_SPEED_KTAS = 100

/** A crew day longer than this is a warning. It does not block Save. */
export const CREW_DAY_LIMIT_HOURS = 8

export function sortieEnduranceHours(distanceNm: number, speedKtas = SURVEY_SPEED_KTAS): number {
  if (!Number.isFinite(distanceNm) || !Number.isFinite(speedKtas) || speedKtas <= 0) return 0
  return distanceNm / speedKtas
}

export function formatSortieEndurance(distanceNm: number): string {
  const hours = sortieEnduranceHours(distanceNm)
  return `≈ ${hours.toFixed(1)} h at ${SURVEY_SPEED_KTAS} KTAS, no wind, no climb or reserve`
}

/** A saved value outside 100–500 is clamped. `reduced` is true only when the stored number changed. */
export function resolveSortieBudget(value: number | null | undefined): { nm: number; reduced: boolean } {
  if (value == null || !Number.isFinite(value)) {
    return { nm: SORTIE_BUDGET_DEFAULT_NM, reduced: false }
  }
  if (value > SORTIE_BUDGET_MAX_NM) return { nm: SORTIE_BUDGET_MAX_NM, reduced: true }
  if (value < SORTIE_BUDGET_MIN_NM) return { nm: SORTIE_BUDGET_MIN_NM, reduced: true }
  return { nm: value, reduced: false }
}

/** A blank, out-of-range, or off-step entry falls back to 400. */
export function readSortieBudgetEntry(raw: string): number {
  const next = Number(raw)
  if (!Number.isFinite(next)) return SORTIE_BUDGET_DEFAULT_NM
  const snapped = Math.round(next / SORTIE_BUDGET_STEP_NM) * SORTIE_BUDGET_STEP_NM
  if (snapped < SORTIE_BUDGET_MIN_NM || snapped > SORTIE_BUDGET_MAX_NM) return SORTIE_BUDGET_DEFAULT_NM
  if (Math.abs(snapped - next) > 1e-6) return SORTIE_BUDGET_DEFAULT_NM
  return snapped
}
