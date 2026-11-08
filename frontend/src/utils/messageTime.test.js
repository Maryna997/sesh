// The device time zone is New York for this file: inbox times must still be
// Lisbon times (and Lisbon calendar days).
process.env.TZ = 'America/New_York'

import { describe, expect, test } from 'vitest'
import { formatInboxTime } from './messageTime'

const NOW = new Date('2026-11-08T12:00:00.000Z') // Sunday 8 Nov, 12:00 in Lisbon

describe('formatInboxTime (Lisbon)', () => {
  test('today: the time', () => {
    expect(formatInboxTime('2026-11-08T10:24:00.000Z', NOW)).toBe('10:24')
    // 00:30 in Lisbon is still "today" there, although it's 7 Nov in New York
    expect(formatInboxTime('2026-11-08T00:30:00.000Z', NOW)).toBe('00:30')
  })

  test('yesterday, then the weekday within a week', () => {
    expect(formatInboxTime('2026-11-07T23:59:00.000Z', NOW)).toBe('Yesterday')
    expect(formatInboxTime('2026-11-05T09:00:00.000Z', NOW)).toBe('Thursday')
    expect(formatInboxTime('2026-11-02T09:00:00.000Z', NOW)).toBe('Monday') // 6 days ago
  })

  test('older: day and month, with the year when it isn’t this year', () => {
    expect(formatInboxTime('2026-11-01T09:00:00.000Z', NOW)).toBe('1 Nov')
    expect(formatInboxTime('2025-10-12T09:00:00.000Z', NOW)).toBe('12 Oct 2025')
  })

  test('summer time is handled (Lisbon UTC+1)', () => {
    const july = new Date('2026-07-15T12:00:00.000Z')
    expect(formatInboxTime('2026-07-15T09:24:00.000Z', july)).toBe('10:24')
  })

  test('invalid input gives an empty string', () => {
    expect(formatInboxTime('not a date', NOW)).toBe('')
  })
})
