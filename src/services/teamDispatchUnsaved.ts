const KEY_PREFIX = 'htw.teamDispatch.unsaved.'
const STALE_PREFIX = 'htw.teamDispatch.sortiesStale.'

export function teamDispatchUnsavedKey(planId: string): string {
  return `${KEY_PREFIX}${planId}`
}

export function setTeamDispatchUnsaved(planId: string, unsaved: boolean): void {
  if (!planId || typeof localStorage === 'undefined') return
  const key = teamDispatchUnsavedKey(planId)
  if (unsaved) localStorage.setItem(key, '1')
  else localStorage.removeItem(key)
}

export function teamDispatchHasUnsaved(planId: string): boolean {
  if (!planId || typeof localStorage === 'undefined') return false
  return localStorage.getItem(teamDispatchUnsavedKey(planId)) === '1'
}

export function setTeamSortiesStale(planId: string, stale: boolean): void {
  if (!planId || typeof localStorage === 'undefined') return
  const key = `${STALE_PREFIX}${planId}`
  if (stale) localStorage.setItem(key, '1')
  else localStorage.removeItem(key)
}

export function teamSortiesAreStale(planId: string): boolean {
  if (!planId || typeof localStorage === 'undefined') return false
  return localStorage.getItem(`${STALE_PREFIX}${planId}`) === '1'
}
