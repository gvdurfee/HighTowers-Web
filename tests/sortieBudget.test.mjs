import { describe, expect, it } from 'vitest'
import {
  SORTIE_BUDGET_DEFAULT_NM,
  formatSortieEndurance,
  readSortieBudgetEntry,
  resolveSortieBudget,
} from '../src/services/sortieBudget.ts'

describe('sortie distance limit', () => {
  it('defaults to 400 NM and shows hours at 100 KTAS', () => {
    expect(SORTIE_BUDGET_DEFAULT_NM).toBe(400)
    expect(formatSortieEndurance(400)).toBe('≈ 4.0 h at 100 KTAS, no wind, no climb or reserve')
    expect(readSortieBudgetEntry('')).toBe(400)
    expect(readSortieBudgetEntry('900')).toBe(400)
    expect(readSortieBudgetEntry('425')).toBe(400)
    expect(readSortieBudgetEntry('450')).toBe(450)
  })

  it('clamps a saved value above 500 and leaves an in-range value alone', () => {
    expect(resolveSortieBudget(800)).toEqual({ nm: 500, reduced: true })
    expect(resolveSortieBudget(400)).toEqual({ nm: 400, reduced: false })
    expect(resolveSortieBudget(undefined)).toEqual({ nm: 400, reduced: false })
  })
})
