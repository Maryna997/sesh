// Inbox times, in Portugal mainland time like every time in Sesh (see
// lisbonTime.js), following the Figma inbox ("10:24", "Yesterday", "Thursday"):
// - today            → "10:24"
// - yesterday        → "Yesterday"
// - the last 7 days  → the weekday ("Thursday")
// - this year        → "12 Oct"
// - earlier          → "12 Oct 2025"
import { LISBON_TIME_ZONE, formatLisbonTime } from './lisbonTime'

const dayParts = new Intl.DateTimeFormat('en-GB', { timeZone: LISBON_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' })
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: LISBON_TIME_ZONE, weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: LISBON_TIME_ZONE, day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { timeZone: LISBON_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' })

// The Lisbon calendar day of an instant, as a number of days (for differences)
function lisbonDayNumber(date) {
  const parts = Object.fromEntries(dayParts.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
  return { day: Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000, year: parts.year }
}

export function formatInboxTime(value, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const then = lisbonDayNumber(date)
  const today = lisbonDayNumber(now)
  const daysAgo = today.day - then.day

  if (daysAgo <= 0) return formatLisbonTime(date) // today (or a moment ahead of this device's clock)
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return weekday.format(date)
  return then.year === today.year ? dayMonth.format(date) : dayMonthYear.format(date)
}
