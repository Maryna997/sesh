// The device time zone is New York for this file: inbox times must still be
// Lisbon times (and Lisbon calendar days).
process.env.TZ = 'America/New_York'

import { describe, expect, test } from 'vitest'
import { formatInboxTime, formatMessageTime } from './messageTime'

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

describe('formatMessageTime (Lisbon)', () => {
  test('the time, with the day when it isn’t today', () => {
    expect(formatMessageTime('2026-11-08T10:24:00.000Z', NOW)).toBe('10:24')
    expect(formatMessageTime('2026-11-07T23:59:00.000Z', NOW)).toBe('Yesterday, 23:59')
    expect(formatMessageTime('2026-11-05T09:00:00.000Z', NOW)).toBe('Thursday, 09:00')
    expect(formatMessageTime('2026-11-01T09:00:00.000Z', NOW)).toBe('1 Nov, 09:00')
    expect(formatMessageTime('2025-10-12T09:00:00.000Z', NOW)).toBe('12 Oct 2025, 10:00') // summer time then
  })

  test('around midnight in Lisbon (not the device’s midnight)', () => {
    const justAfterMidnight = new Date('2026-11-08T00:05:00.000Z')
    expect(formatMessageTime('2026-11-07T23:55:00.000Z', justAfterMidnight)).toBe('Yesterday, 23:55')
    expect(formatMessageTime('2026-11-08T00:01:00.000Z', justAfterMidnight)).toBe('00:01')
  })

  test('across the summer time change (Lisbon: 25 Oct 2026, 02:00 → 01:00)', () => {
    const afterChange = new Date('2026-10-25T12:00:00.000Z') // 12:00 WET
    expect(formatMessageTime('2026-10-25T00:30:00.000Z', afterChange)).toBe('01:30') // 01:30 WEST, same day
    expect(formatMessageTime('2026-10-24T22:30:00.000Z', afterChange)).toBe('Yesterday, 23:30')
  })

  test('invalid input gives an empty string', () => {
    expect(formatMessageTime(undefined, NOW)).toBe('')
  })
})
