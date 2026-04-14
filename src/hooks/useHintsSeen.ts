import { useCallback, useMemo, useState } from 'react'

export type HintsSeenMap = Record<string, true>

const STORAGE_KEY = 'HighTowers.hintsSeen.v1'

function readFromStorage(): HintsSeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const obj = parsed as Record<string, unknown>
    const out: HintsSeenMap = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === true) out[k] = true
    }
    return out
  } catch {
    return {}
  }
}

function writeToStorage(map: HintsSeenMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore quota / privacy-mode failures; hints will behave session-only.
  }
}

export function useHintsSeen() {
  const [seen, setSeen] = useState<HintsSeenMap>(() => readFromStorage())

  const isSeen = useCallback((hintId: string): boolean => !!seen[hintId], [seen])

  const markSeen = useCallback((hintId: string) => {
    setSeen((prev) => {
      if (prev[hintId]) return prev
      const next = { ...prev, [hintId]: true as const }
      writeToStorage(next)
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setSeen(() => {
      const next: HintsSeenMap = {}
      writeToStorage(next)
      return next
    })
  }, [])

  return useMemo(
    () => ({
      seen,
      isSeen,
      markSeen,
      resetAll,
    }),
    [seen, isSeen, markSeen, resetAll]
  )
}

