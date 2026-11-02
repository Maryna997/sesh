// Lisbon local time helpers for availability ("today", arrival windows,
// end-of-day expiry), using only Node's built-in Intl time-zone data.
//
// Dates are always real instants (Date objects, stored as TIMESTAMPTZ). These
// helpers only answer "what is the Lisbon date/time of this instant?" and
// "which instant is this Lisbon date/time?". They never depend on the
// server's own time zone, and they follow summer time (WET/WEST): Portugal
// changes at 01:00 UTC on the last Sunday of March and of October.

export const LISBON_TIME_ZONE = 'Europe/Lisbon';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LISBON_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

// The Lisbon calendar date and wall-clock time of an instant
export function lisbonParts(date) {
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

// How far Lisbon is ahead of UTC at an instant, in minutes (0 or 60)
function lisbonOffsetMinutes(date) {
  const parts = lisbonParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// The instant of a Lisbon wall-clock time. Day overflow is allowed
// (day + 1 at the end of a month is the 1st of the next month).
// Used for midnight and the 05:00–21:00 windows, which always exist exactly
// once (summer time changes at 01:00/02:00).
export function lisbonTime(year, month, day, hour = 0, minute = 0) {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(wallClockAsUtc - lisbonOffsetMinutes(new Date(wallClockAsUtc)) * 60000);
  // One correction step if the guess fell on the other side of a change
  const corrected = new Date(wallClockAsUtc - lisbonOffsetMinutes(instant) * 60000);
  if (corrected.getTime() !== instant.getTime()) instant = corrected;
  return instant;
}

// 00:00 of the next Lisbon day: the exclusive end of "today"
export function startOfNextLisbonDay(now) {
  const { year, month, day } = lisbonParts(now);
  return lisbonTime(year, month, day + 1);
}

// A wall-clock time on the same Lisbon day as `now`
export function lisbonTimeToday(now, hour, minute = 0) {
  const { year, month, day } = lisbonParts(now);
  return lisbonTime(year, month, day, hour, minute);
}
