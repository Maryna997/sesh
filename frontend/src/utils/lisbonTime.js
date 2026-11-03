// Portugal mainland time (Europe/Lisbon) for availability: arrival windows,
// "today" and the times shown on My Status. The browser's own time zone is
// never used, so a visitor whose device is set to another zone still sees
// Lisbon times. Summer time (WET/WEST) is handled by the built-in Intl data.

export const LISBON_TIME_ZONE = 'Europe/Lisbon'

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LISBON_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// "13:05" (Lisbon) for an instant (Date or ISO string)
export function formatLisbonTime(value) {
  return timeFormatter.format(new Date(value))
}

// Minutes since Lisbon midnight for an instant (0–1439)
export function lisbonMinutesOfDay(value) {
  const parts = Object.fromEntries(
    timeFormatter.formatToParts(new Date(value)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  )
  return parts.hour * 60 + parts.minute
}

// "09:00"
export const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`
