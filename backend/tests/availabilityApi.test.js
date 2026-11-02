// API tests for GET and POST /api/v1/availability/me.
//
// The clock is fixed in every test (clock.now is mocked), so time rules are
// checked against known instants: 15 July 2026, Lisbon summer time (UTC+1).
// Like the other database tests, only @sesh-test.invalid users are created
// and deleted afterwards (their availability rows go with them).
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { SurferAvailability } from '../src/models/index.js';
import { clock } from '../src/utils/clock.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';
const SPOT = 'pt-cascais-carcavelos';
const TEN_AM = '2026-07-15T09:00:00Z'; // 10:00 Lisbon
const MIDNIGHT = '2026-07-15T23:00:00.000Z'; // 00:00 Lisbon on the 16th
const RESPONSE_KEYS = ['arrival', 'expiresAt', 'isAvailable', 'spot', 'state', 'status', 'updatedAt'];

let server;
let baseUrl;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);

function setNow(iso) {
  mock.method(clock, 'now', () => new Date(iso));
}

async function signedInUser({ withProfile = true } = {}) {
  counter += 1;
  const email = testEmail(`avail-api-${counter}`);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const user = { id: registered.body.user.id, token: sessionToken(loggedIn) };
  if (withProfile) {
    const created = await call('/api/v1/profile/me', {
      method: 'PUT',
      cookie: user.token,
      origin: TEST_CLIENT_ORIGIN,
      body: { displayName: 'Kai Silva', skillLevel: 'intermediate' },
    });
    assert.equal(created.status, 201);
  }
  return user;
}

const getMine = (user) => call('/api/v1/availability/me', { cookie: user?.token });
const postMine = (user, body, options = {}) =>
  call('/api/v1/availability/me', { method: 'POST', cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body, ...options });
const rowsOf = (user) => SurferAvailability.count({ where: { userId: user.id } });

before(async () => {
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());
});

afterEach(() => mock.restoreAll());

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('creating each status (POST, 201)', () => {
  test('ACTIVE without a spot: available until midnight', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'ACTIVE' });
    assert.equal(response.status, 201, response.text);
    const { availability } = response.body;
    assert.deepEqual(Object.keys(availability).sort(), RESPONSE_KEYS);
    assert.deepEqual(
      { status: availability.status, state: availability.state, isAvailable: availability.isAvailable, spot: availability.spot, arrival: availability.arrival, expiresAt: availability.expiresAt },
      { status: 'ACTIVE', state: 'available', isAvailable: true, spot: null, arrival: null, expiresAt: MIDNIGHT },
    );
  });

  test('ACTIVE with an optional spot (a preference)', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'ACTIVE', spotId: SPOT });
    assert.equal(response.status, 201);
    assert.equal(response.body.availability.spot.id, SPOT);
    assert.equal(response.body.availability.spot.name, 'Praia de Carcavelos');
    assert.ok(!('latitude' in response.body.availability.spot));
  });

  for (const minutes of [30, 60, 120]) {
    test(`COMING_SOON in about ${minutes} minutes`, async () => {
      setNow(TEN_AM);
      const user = await signedInUser();
      const response = await postMine(user, { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'relative', minutes } });
      assert.equal(response.status, 201, response.text);
      const arrivesAt = new Date(new Date(TEN_AM).getTime() + minutes * 60000);
      const { availability } = response.body;
      assert.deepEqual(availability.arrival, { type: 'relative', minutes, arrivesAt: arrivesAt.toISOString() });
      assert.equal(availability.expiresAt, new Date(arrivesAt.getTime() + 60 * 60000).toISOString());

      const row = await SurferAvailability.findOne({ where: { userId: user.id } });
      assert.deepEqual(
        { status: row.status, arrivalType: row.arrivalType, arrivalOffsetMinutes: row.arrivalOffsetMinutes, windowStartsAt: row.windowStartsAt },
        { status: 'coming_soon', arrivalType: 'relative', arrivalOffsetMinutes: minutes, windowStartsAt: null },
      );
    });
  }

  test('COMING_SOON with a window later today', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour: 13 } });
    assert.equal(response.status, 201, response.text);
    assert.deepEqual(response.body.availability.arrival, {
      type: 'window',
      startHour: 13,
      startsAt: '2026-07-15T12:00:00.000Z',
      endsAt: '2026-07-15T14:00:00.000Z',
    });
    assert.equal(response.body.availability.expiresAt, '2026-07-15T15:00:00.000Z'); // 16:00 Lisbon
  });

  test('COMING_SOON with a window that has started but not ended (09:40 → 09:00–11:00)', async () => {
    setNow('2026-07-15T08:40:00Z');
    const user = await signedInUser();
    const response = await postMine(user, { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour: 9 } });
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.availability.arrival.startsAt, '2026-07-15T08:00:00.000Z');
    assert.equal(response.body.availability.expiresAt, '2026-07-15T11:00:00.000Z'); // 12:00 Lisbon
    assert.equal(response.body.availability.state, 'available');
  });

  test('AT_SPOT: three hours, with the spot', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'AT_SPOT', spotId: SPOT });
    assert.equal(response.status, 201);
    assert.equal(response.body.availability.status, 'AT_SPOT');
    assert.equal(response.body.availability.expiresAt, '2026-07-15T12:00:00.000Z');
    assert.equal(response.body.availability.arrival, null);
  });

  test('OFF: not available, no spot, no expiry', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'OFF' });
    assert.equal(response.status, 201);
    assert.deepEqual(
      { state: response.body.availability.state, isAvailable: response.body.availability.isAvailable, expiresAt: response.body.availability.expiresAt, spot: response.body.availability.spot },
      { state: 'off', isAvailable: false, expiresAt: null, spot: null },
    );
  });

  test('a late AT_SPOT is capped at midnight', async () => {
    setNow('2026-07-15T21:30:00Z'); // 22:30 Lisbon
    const user = await signedInUser();
    const response = await postMine(user, { status: 'AT_SPOT', spotId: SPOT });
    assert.equal(response.body.availability.expiresAt, MIDNIGHT);
  });
});

describe('reading your availability (GET)', () => {
  test('null when none was ever set', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await getMine(user);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { availability: null });
  });

  test('returns each status as created', async () => {
    for (const body of [
      { status: 'ACTIVE' },
      { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour: 11 } },
      { status: 'AT_SPOT', spotId: SPOT },
      { status: 'OFF' },
    ]) {
      setNow(TEN_AM);
      const user = await signedInUser();
      const created = await postMine(user, body);
      const read = await getMine(user);
      assert.equal(read.status, 200);
      assert.deepEqual(read.body, created.body, body.status);
      mock.restoreAll();
    }
  });

  test('an expired status is returned as expired, not available (exact boundary)', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    await postMine(user, { status: 'AT_SPOT', spotId: SPOT }); // expires 13:00 Lisbon

    setNow('2026-07-15T11:59:59Z');
    assert.equal((await getMine(user)).body.availability.state, 'available');

    setNow('2026-07-15T12:00:00Z'); // exactly the expiry
    const expired = (await getMine(user)).body.availability;
    assert.deepEqual(
      { status: expired.status, state: expired.state, isAvailable: expired.isAvailable, spot: expired.spot.id },
      { status: 'AT_SPOT', state: 'expired', isAvailable: false, spot: SPOT },
    );
  });

  test('an ACTIVE status from yesterday is expired today', async () => {
    setNow('2026-07-15T20:00:00Z');
    const user = await signedInUser();
    await postMine(user, { status: 'ACTIVE' });
    setNow('2026-07-16T07:00:00Z');
    assert.equal((await getMine(user)).body.availability.state, 'expired');
  });
});

describe('one availability per user', () => {
  test('a second POST is a 409 and changes nothing', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const first = await postMine(user, { status: 'ACTIVE' });
    const second = await postMine(user, { status: 'AT_SPOT', spotId: SPOT });
    assert.equal(second.status, 409);
    assert.deepEqual(second.body, { status: 'error', code: 'AVAILABILITY_EXISTS', message: 'You already have an availability status.' });
    assert.deepEqual((await getMine(user)).body, first.body);
    assert.equal(await rowsOf(user), 1);
  });

  test('simultaneous first requests create exactly one row', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const results = await Promise.all([1, 2, 3, 4].map(() => postMine(user, { status: 'ACTIVE' })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409]);
    assert.equal(await rowsOf(user), 1);
  });
});

describe('validation (400, nothing saved)', () => {
  const cases = [
    ['unsupported status', { status: 'INVISIBLE' }, 'status'],
    ['lowercase / database status names', { status: 'at_spot', spotId: SPOT }, 'status'],
    ['missing status', {}, 'status'],
    ['COMING_SOON without a spot', { status: 'COMING_SOON', arrival: { type: 'relative', minutes: 30 } }, 'spotId'],
    ['AT_SPOT without a spot', { status: 'AT_SPOT' }, 'spotId'],
    ['unknown spot', { status: 'AT_SPOT', spotId: 'pt-nowhere' }, 'spotId'],
    ['OFF with a spot', { status: 'OFF', spotId: SPOT }, 'spotId'],
    ['invalid arrival mode', { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'tomorrow' } }, 'arrival'],
    ['invalid relative offset', { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'relative', minutes: 45 } }, 'arrival'],
    ['invalid window', { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour: 8 } }, 'arrival'],
    ['window that has ended', { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour: 7 } }, 'arrival'],
    ['a date for the window (tomorrow)', { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'window', startHour: 13, date: '2026-07-16' } }, 'arrival'],
    ['a date in the body', { status: 'ACTIVE', date: '2026-07-16' }, 'date'],
    ['arrival with ACTIVE', { status: 'ACTIVE', arrival: { type: 'relative', minutes: 30 } }, 'arrival'],
    ['arrival with AT_SPOT', { status: 'AT_SPOT', spotId: SPOT, arrival: { type: 'window', startHour: 13 } }, 'arrival'],
    ['arrival with OFF', { status: 'OFF', arrival: { type: 'relative', minutes: 30 } }, 'arrival'],
    ['client expiresAt', { status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z' }, 'expiresAt'],
    ['client expires_at', { status: 'ACTIVE', expires_at: '2030-01-01T00:00:00Z' }, 'expires_at'],
    ['client userId', { status: 'ACTIVE', userId: '00000000-0000-4000-8000-000000000000' }, 'userId'],
    ['client user_id', { status: 'ACTIVE', user_id: '00000000-0000-4000-8000-000000000000' }, 'user_id'],
  ];

  for (const [name, body, field] of cases) {
    test(name, async () => {
      setNow(TEN_AM);
      const user = await signedInUser();
      const response = await postMine(user, body);
      assert.equal(response.status, 400, response.text);
      assert.equal(response.body.message, 'Please check the availability details.');
      assert.ok(response.body.errors[field], `${field}: ${JSON.stringify(response.body.errors)}`);
      assert.equal(await rowsOf(user), 0);
    });
  }

  test('a relative arrival crossing into tomorrow', async () => {
    setNow('2026-07-15T22:30:00Z'); // 23:30 Lisbon
    const user = await signedInUser();
    const response = await postMine(user, { status: 'COMING_SOON', spotId: SPOT, arrival: { type: 'relative', minutes: 30 } });
    assert.equal(response.status, 400);
    assert.match(response.body.errors.arrival, /tomorrow/);
  });

  test('a body that is not an object, and invalid JSON', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    assert.ok((await postMine(user, ['ACTIVE'])).body.errors.body);

    const send = (text) =>
      fetch(`${baseUrl}/api/v1/availability/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `sesh_session=${user.token}`, Origin: TEST_CLIENT_ORIGIN },
        body: text,
      });
    const malformed = await send('{"status": ');
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).message, 'Request body must be valid JSON.');
    const empty = await send(undefined);
    assert.equal(empty.status, 400);
    assert.equal(await rowsOf(user), 0);
  });

  test('a client-sent user id can’t create availability for someone else', async () => {
    setNow(TEN_AM);
    const owner = await signedInUser();
    const other = await signedInUser();
    await postMine(other, { status: 'ACTIVE', userId: owner.id });
    assert.equal(await rowsOf(owner), 0);
  });
});

describe('access control', () => {
  test('GET and POST require a session', async () => {
    assert.equal((await getMine(null)).status, 401);
    assert.equal((await postMine(null, { status: 'ACTIVE' })).status, 401);
  });

  test('GET and POST require a completed profile', async () => {
    const user = await signedInUser({ withProfile: false });
    const get = await getMine(user);
    const post = await postMine(user, { status: 'ACTIVE' });
    assert.equal(get.status, 403);
    assert.equal(post.body.code, 'PROFILE_REQUIRED');
    assert.equal(await rowsOf(user), 0);
  });

  test('POST from another website is blocked (CSRF), nothing saved', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'ACTIVE' }, { origin: 'https://evil.example' });
    assert.equal(response.status, 403);
    assert.equal(await rowsOf(user), 0);
  });

  test('responses never include the row id or user id', async () => {
    setNow(TEN_AM);
    const user = await signedInUser();
    const response = await postMine(user, { status: 'ACTIVE' });
    assert.ok(!response.text.includes(user.id));
    assert.ok(!/"(id|userId|user_id)"\s*:\s*"[0-9a-f-]{36}"/.test(response.text));
  });
});
