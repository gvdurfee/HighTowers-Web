/** A published NASR effective date. Later cycles are 28 days apart. */
export const NASR_CYCLE_ANCHOR = '2026-10-29'
const CYCLE_DAYS = 28

function utcDay(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function formatUtc(ms) {
  const date = new Date(ms)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Local calendar day, so an evening in this timezone does not jump a cycle. */
export function localToday(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Effective date of the 28-day cycle that contains `today`. */
export function nasrCycleDate(today, anchor = NASR_CYCLE_ANCHOR) {
  const start = utcDay(anchor)
  const day = utcDay(today)
  if (day < start) return anchor
  const steps = Math.floor((day - start) / 86400000 / CYCLE_DAYS)
  return formatUtc(start + steps * CYCLE_DAYS * 86400000)
}

/** The cycle that ended the day before this effective date. */
export function previousNasrCycle(isoDate) {
  return formatUtc(utcDay(isoDate) - CYCLE_DAYS * 86400000)
}

/** Newest cached effective date on or before today. */
export function newestCachedCycle(dates, today) {
  const eligible = dates.filter((date) => date <= today).sort()
  return eligible.length > 0 ? eligible[eligible.length - 1] : null
}

/** YYYY-MM-DD to the FAA extra-file date, for example 29_Oct_2026. */
export function toMtrZipDate(isoDate) {
  const [, month, day] = isoDate.split('-').map(Number)
  const year = isoDate.slice(0, 4)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(day).padStart(2, '0')}_${months[month - 1]}_${year}`
}
