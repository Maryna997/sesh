// Unit tests for availability validation and time calculations.
// Every test uses fixed instants (no real clock). Reminders:
// - Lisbon is UTC+1 in summer (WEST) and UTC+0 in winter (WET).
// - In 2026 summer time starts on 29 March and ends on 25 October, at 01:00 UTC.
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAvailability } from '../src/utils/availabilityRules.js';
import { lisbonParts, lisbonTime, startOfNextLisbonDay } from '../src/utils/lisbonTime.js';

const at = (iso) => new Date(iso);
const iso = (date) => date?.toISOString() ?? null;
const SPOT = 'pt-cascais-carcavelos';

// Shortcuts for valid requests
const build = (body, now) => buildAvailability(body, at(now));
const relative = (minutes) => ({ status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'relative', minutes } });
const window = (startHour) => ({ status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour } });

describe('Lisbon time helpers', () => {
  test('next local midnight in summer, winter and across month/year ends', () => {
    assert.equal(iso(startOfNextLisbonDay(at('2026-07-15T10:00:00Z'))), '2026-07-15T23:00:00.000Z');
    assert.equal(iso(startOfNextLisbonDay(at('2026-12-15T10:00:00Z'))), '2026-12-16T00:00:00.000Z');
    assert.equal(iso(startOfNextLisbonDay(at('2026-07-31T12:00:00Z'))), '2026-07-31T23:00:00.000Z');
    assert.equal(iso(startOfNextLisbonDay(at('2026-12-31T23:30:00Z'))), '2027-01-01T00:00:00.000Z');
  });

  test('the day summer time starts (23 hours) and ends (25 hours)', () => {
    // 29 March: 00:30 UTC is still 00:30 WET; the day ends at 00:00 WEST = 23:00 UTC
    assert.equal(iso(startOfNextLisbonDay(at('2026-03-29T00:30:00Z'))), '2026-03-29T23:00:00.000Z');
    assert.equal(iso(startOfNextLisbonDay(at('2026-03-28T23:30:00Z'))), '2026-03-29T00:00:00.000Z');
    // 25 October: 00:30 UTC is 01:30 WEST; the day ends at 00:00 WET = 00:00 UTC on the 26th
    assert.equal(iso(startOfNextLisbonDay(at('2026-10-25T00:30:00Z'))), '2026-10-26T00:00:00.000Z');
    assert.equal(iso(startOfNextLisbonDay(at('2026-10-24T22:30:00Z'))), '2026-10-24T23:00:00.000Z');
  });

  test('wall-clock times become the right instants on both sides of a change', () => {
    assert.equal(iso(lisbonTime(2026, 3, 29, 5)), '2026-03-29T04:00:00.000Z'); // after the change: WEST
    assert.equal(iso(lisbonTime(2026, 3, 28, 5)), '2026-03-28T05:00:00.000Z');
    assert.equal(iso(lisbonTime(2026, 10, 25, 9)), '2026-10-25T09:00:00.000Z'); // after the change: WET
    assert.equal(iso(lisbonTime(2026, 10, 24, 9)), '2026-10-24T08:00:00.000Z');
    assert.deepEqual(lisbonParts(at('2026-07-15T22:30:00Z')), { year: 2026, month: 7, day: 15, hour: 23, minute: 30, second: 0 });
  });
});

describe('expiry for every status', () => {
  test('ACTIVE: until next local midnight; spot optional', () => {
    const { data } = build({ status: 'ACTIVE' }, '2026-07-15T09:00:00Z');
    assert.deepEqual({ status: data.status, spotId: data.spotId, expiresAt: iso(data.expiresAt) }, {
      status: 'active',
      spotId: null,
      expiresAt: '2026-07-15T23:00:00.000Z',
    });
    assert.equal(build({ status: 'ACTIVE', spotId: SPOT }, '2026-07-15T09:00:00Z').data.spotId, SPOT);
  });

  test('COMING_SOON relative: arrival = now + minutes, expiry = arrival + 1 h (the 10:00 example)', () => {
    // 10:00 Lisbon in summer = 09:00 UTC
    const { data } = build(relative(120), '2026-07-15T09:00:00Z');
    assert.equal(data.arrivalType, 'relative');
    assert.equal(data.arrivalOffsetMinutes, 120);
    assert.equal(iso(data.arrivalAt), '2026-07-15T11:00:00.000Z'); // 12:00 Lisbon
    assert.equal(iso(data.expiresAt), '2026-07-15T12:00:00.000Z'); // 13:00 Lisbon
    assert.equal(data.windowStartsAt, null);
    for (const minutes of [30, 60]) {
      const result = build(relative(minutes), '2026-07-15T09:00:00Z').data;
      assert.equal(result.arrivalAt.getTime() - at('2026-07-15T09:00:00Z').getTime(), minutes * 60000);
    }
  });

  test('COMING_SOON window: today’s window in Lisbon time, expiry = end + 1 h (the 09:00–11:00 example)', () => {
    const { data } = build(window(9), '2026-07-15T06:00:00Z'); // 07:00 Lisbon
    assert.equal(data.arrivalType, 'window');
    assert.equal(iso(data.windowStartsAt), '2026-07-15T08:00:00.000Z'); // 09:00 Lisbon
    assert.equal(iso(data.windowEndsAt), '2026-07-15T10:00:00.000Z'); // 11:00 Lisbon
    assert.equal(iso(data.expiresAt), '2026-07-15T11:00:00.000Z'); // 12:00 Lisbon
    assert.equal(data.arrivalAt, null);
    assert.equal(data.arrivalOffsetMinutes, null);
  });

  test('AT_SPOT: three hours after activation', () => {
    const { data } = build({ status: 'AT_SPOT', spotId: SPOT }, '2026-07-15T09:00:00Z');
    assert.equal(iso(data.expiresAt), '2026-07-15T12:00:00.000Z');
    assert.equal(data.arrivalType, null);
  });

  test('OFF: no spot, no arrival, no expiry', () => {
    assert.deepEqual(build({ status: 'OFF' }, '2026-07-15T09:00:00Z').data, {
      status: 'off',
      spotId: null,
      arrivalType: null,
      arrivalOffsetMinutes: null,
      arrivalAt: null,
      windowStartsAt: null,
      windowEndsAt: null,
      expiresAt: null,
    });
  });

  test('winter time: the same local rules shift by one hour in UTC', () => {
    const now = '2026-12-15T10:00:00Z'; // 10:00 Lisbon (WET)
    assert.equal(iso(build({ status: 'ACTIVE' }, now).data.expiresAt), '2026-12-16T00:00:00.000Z');
    const windowData = build(window(11), now).data;
    assert.equal(iso(windowData.windowStartsAt), '2026-12-15T11:00:00.000Z');
    assert.equal(iso(windowData.expiresAt), '2026-12-15T14:00:00.000Z');
  });
});

describe('end-of-day cap', () => {
  // 23:00 Lisbon in summer = 22:00 UTC; midnight = 23:00 UTC
  test('AT_SPOT late in the evening is capped at midnight', () => {
    const { data } = build({ status: 'AT_SPOT', spotId: SPOT }, '2026-07-15T21:30:00Z'); // 22:30 Lisbon
    assert.equal(iso(data.expiresAt), '2026-07-15T23:00:00.000Z');
  });

  test('a relative arrival before midnight is allowed, its expiry is capped', () => {
    const { data } = build(relative(30), '2026-07-15T22:00:00Z'); // arrives 23:30 Lisbon
    assert.equal(iso(data.arrivalAt), '2026-07-15T22:30:00.000Z');
    assert.equal(iso(data.expiresAt), '2026-07-15T23:00:00.000Z');
  });

  test('a relative arrival at or after midnight (tomorrow) is rejected', () => {
    assert.match(build(relative(60), '2026-07-15T22:00:00Z').errors.arrival, /would be tomorrow/); // exactly 00:00
    assert.match(build(relative(120), '2026-07-15T22:30:00Z').errors.arrival, /would be tomorrow/);
  });

  test('the last window (19:00–21:00) expires at 22:00, inside the day', () => {
    const { data } = build(window(19), '2026-07-15T17:00:00Z'); // 18:00 Lisbon
    assert.equal(iso(data.expiresAt), '2026-07-15T21:00:00.000Z');
  });

  test('ACTIVE one second before midnight still gets a (short) future expiry', () => {
    const { data } = build({ status: 'ACTIVE' }, '2026-07-15T22:59:59Z');
    assert.equal(iso(data.expiresAt), '2026-07-15T23:00:00.000Z');
  });
});

describe('windows: started is fine, ended is not', () => {
  test('a window that has started but not ended is accepted (09:40 → 09:00–11:00)', () => {
    const { data } = build(window(9), '2026-07-15T08:40:00Z'); // 09:40 Lisbon
    assert.equal(iso(data.windowStartsAt), '2026-07-15T08:00:00.000Z');
    assert.equal(iso(data.expiresAt), '2026-07-15T11:00:00.000Z');
  });

  test('…and so is "in about 1 hour" at the same moment', () => {
    assert.ok(build(relative(60), '2026-07-15T08:40:00Z').data);
  });

  test('a window is rejected only once its end has been reached', () => {
    assert.ok(build(window(9), '2026-07-15T09:59:59Z').data); // 10:59:59 Lisbon
    assert.match(build(window(9), '2026-07-15T10:00:00Z').errors.arrival, /already ended/); // exactly 11:00
    assert.match(build(window(5), '2026-07-15T12:00:00Z').errors.arrival, /already ended/);
    assert.match(build(window(19), '2026-07-15T20:00:00Z').errors.arrival, /already ended/); // 21:00
  });

  test('windows follow summer-time changes on the changeover days', () => {
    // 29 March, 03:30 Lisbon (WEST): today's 09:00 is 08:00 UTC
    assert.equal(iso(build(window(9), '2026-03-29T02:30:00Z').data.windowStartsAt), '2026-03-29T08:00:00.000Z');
    // 25 October, 03:30 Lisbon (WET): today's 09:00 is 09:00 UTC
    assert.equal(iso(build(window(9), '2026-10-25T03:30:00Z').data.windowStartsAt), '2026-10-25T09:00:00.000Z');
  });

  test('just after midnight, windows refer to the new day', () => {
    const { data } = build(window(5), '2026-07-15T23:10:00Z'); // 00:10 on the 16th, Lisbon
    assert.equal(iso(data.windowStartsAt), '2026-07-16T04:00:00.000Z');
  });
});

describe('validation', () => {
  const NOW = '2026-07-15T09:00:00Z';
  const errorsFor = (body) => build(body, NOW).errors ?? {};

  test('status is required and must be one of the four API names', () => {
    assert.equal(errorsFor({}).status, 'Choose an availability status.');
    for (const status of ['active', 'AT_THE_SPOT', 'INVISIBLE', 42]) {
      assert.match(errorsFor({ status }).status, /must be one of/);
    }
    assert.ok(errorsFor(null).body);
    assert.ok(errorsFor(['ACTIVE']).body);
  });

  test('spot rules per status', () => {
    assert.equal(errorsFor({ status: 'AT_SPOT' }).spotId, 'Choose a surf spot.');
    assert.equal(errorsFor({ ...relative(30), spotId: null }).spotId, 'Choose a surf spot.');
    assert.equal(errorsFor({ status: 'OFF', spotId: SPOT }).spotId, 'Off doesn’t take a surf spot.');
    assert.ok(errorsFor({ status: 'AT_SPOT', spotId: 12 }).spotId);
    assert.ok(errorsFor({ status: 'AT_SPOT', spotId: 'x'.repeat(101) }).spotId);
  });

  test('arrival only with Coming Soon, and required there', () => {
    for (const status of ['ACTIVE', 'AT_SPOT', 'OFF']) {
      const body = { status, spotId: status === 'OFF' ? undefined : SPOT, arrival: { type: 'relative', minutes: 30 } };
      assert.equal(errorsFor(body).arrival, 'An arrival time is only used with Coming Soon.', status);
    }
    assert.equal(errorsFor({ status: 'COMING_SOON', spotId: SPOT }).arrival, 'Choose when you expect to arrive.');
  });

  test('unsupported arrival modes, offsets and windows', () => {
    assert.match(errorsFor({ ...relative(30), arrival: { type: 'tomorrow' } }).arrival, /relative" or "window/);
    assert.match(errorsFor({ ...relative(30), arrival: 'soon' }).arrival, /relative time or a window/);
    for (const minutes of [0, 15, 45, 90, 180, '30', null]) assert.ok(errorsFor(relative(minutes)).arrival, String(minutes));
    for (const startHour of [0, 6, 8, 21, 23, '9', 9.5]) assert.ok(errorsFor(window(startHour)).arrival, String(startHour));
  });

  test('conflicting arrival fields are rejected', () => {
    assert.ok(errorsFor({ ...relative(30), arrival: { type: 'relative', minutes: 30, startHour: 9 } }).arrival);
    assert.ok(errorsFor({ ...window(9), arrival: { type: 'window', startHour: 9, minutes: 30 } }).arrival);
  });

  test('dates, expiry and owner can never come from the client', () => {
    const errors = errorsFor({
      status: 'ACTIVE',
      expiresAt: '2030-01-01T00:00:00Z',
      expires_at: '2030-01-01T00:00:00Z',
      userId: 'someone-else',
      user_id: 'someone-else',
      date: '2026-07-16',
    });
    for (const field of ['expiresAt', 'expires_at', 'userId', 'user_id', 'date']) assert.equal(errors[field], 'This field can’t be set.');
    // A date inside the window is rejected too: windows are always today
    assert.ok(errorsFor({ ...window(9), arrival: { type: 'window', startHour: 9, date: '2026-07-16' } }).arrival);
  });
})
