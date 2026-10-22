// Options and helpers for the Discover "Time" filter.
//
// The filter value is a small object with a `type` that says which kind of
// choice was made, so future backend matching never has to guess:
//   { type: 'any' }                                   Any time (default)
//   { type: 'now' }                                   Now
//   { type: 'next_2_hours' }                          Next 2 hours
//   { type: 'today' }                                 Any time later today
//   { type: 'custom', day: 'today', time: '15:00' }   Chosen day + approximate time
//   { type: 'custom', day: 'tomorrow', time: 'any' }  Chosen day, any time
// "now" and "next_2_hours" are relative to the moment the search is made.

export const TIME_FILTER_TYPES = {
  ANY: 'any',
  NOW: 'now',
  NEXT_2_HOURS: 'next_2_hours',
  TODAY: 'today',
  CUSTOM: 'custom',
}

// Options shown in the compact dropdown, in Figma order.
export const QUICK_TIME_OPTIONS = [
  { type: TIME_FILTER_TYPES.ANY, label: 'Any time' },
  { type: TIME_FILTER_TYPES.NOW, label: 'Now' },
  { type: TIME_FILTER_TYPES.NEXT_2_HOURS, label: 'Next 2 hours' },
  { type: TIME_FILTER_TYPES.TODAY, label: 'Today' },
  { type: TIME_FILTER_TYPES.CUSTOM, label: 'Choose date & time…' },
]

export const DEFAULT_TIME_FILTER = { type: TIME_FILTER_TYPES.ANY }

// ---------- Custom day + approximate time ----------

export const DAY_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
]

export const ANY_TIME = 'any'

export const TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00']

export const DEFAULT_CUSTOM_TIME = { day: 'today', time: ANY_TIME }

// "Around 15:00" stays selectable until 15:30 today, because it is approximate.
const GRACE_MINUTES = 30

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// True when a time slot is already over for today, in the user's local time.
export function isSlotPast(slot, now) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes > toMinutes(slot) + GRACE_MINUTES
}

// True when a custom { day, time } points to a slot that has passed today.
export function isCustomTimePast({ day, time }, now) {
  return day === 'today' && time !== ANY_TIME && isSlotPast(time, now)
}

export function formatTimeLabel(time) {
  return time === ANY_TIME ? 'Any time' : `Around ${time}`
}

// { day: 'tomorrow', time: '15:00' } -> "Tomorrow · Around 15:00"
export function formatDayTime({ day, time }) {
  const dayLabel = DAY_OPTIONS.find((option) => option.value === day)?.label ?? day
  return `${dayLabel} · ${formatTimeLabel(time)}`
}

// Readable summary of any filter value, e.g. "Next 2 hours" or "Today · Around 15:00".
export function formatTimeFilter(value) {
  if (value.type === TIME_FILTER_TYPES.CUSTOM) return formatDayTime(value)
  return QUICK_TIME_OPTIONS.find((option) => option.type === value.type)?.label ?? 'Any time'
}
