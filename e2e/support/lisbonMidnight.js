// Availability in Sesh lasts until midnight in Lisbon (the backend's real
// clock decides; tests can't move it without changing the app). A test that
// sets an availability and then looks for it on Discover would fail if
// Lisbon midnight passed in between. To keep such tests independent of the
// time of day, they call avoidLisbonMidnight() first: if midnight is less
// than SAFETY_MARGIN_MS away, the test waits until just after it (and its
// timeout is extended by that wait); otherwise it continues at once. The
// wait is recorded as a test annotation, so it is visible in the report.
const LISBON = 'Europe/Lisbon'
export const SAFETY_MARGIN_MS = 3 * 60 * 1000
const AFTER_MIDNIGHT_MS = 5_000

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: LISBON,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

// Milliseconds from `now` until the next midnight in Lisbon
export function msUntilLisbonMidnight(now = new Date()) {
  const parts = Object.fromEntries(
    clockFormat.formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  )
  const secondsIntoDay = parts.hour * 3600 + parts.minute * 60 + parts.second
  return (86_400 - secondsIntoDay) * 1000 - now.getMilliseconds()
}

export async function avoidLisbonMidnight(testInfo, now = new Date()) {
  const remaining = msUntilLisbonMidnight(now)
  if (remaining > SAFETY_MARGIN_MS) return 0
  const wait = remaining + AFTER_MIDNIGHT_MS
  testInfo.annotations.push({ type: 'lisbon-midnight', description: `Waited ${Math.ceil(wait / 1000)} s for midnight in Lisbon to pass` })
  testInfo.setTimeout(testInfo.timeout + wait)
  await new Promise((resolve) => setTimeout(resolve, wait))
  return wait
}
