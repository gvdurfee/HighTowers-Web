type LeaveGuard = () => boolean

let guard: LeaveGuard | null = null

export function setOffsetPlanLeaveGuard(next: LeaveGuard | null) {
  guard = next
}

/** Returns true when navigation may continue. */
export function confirmLeaveOffsetPlan(): boolean {
  if (!guard) return true
  return guard()
}
