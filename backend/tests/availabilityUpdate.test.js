// API tests for PUT /api/v1/availability/me (change, switch Off, reactivate).
//
// The clock is fixed in every step (clock.now is mocked). Unless stated,
// times are 15 July 2026, Lisbon summer time (UTC+1): 09:00Z = 10:00 Lisbon.
// Only @sesh-test.invalid users are created and deleted afterwards (their
// availability rows go with them).
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { SurferAvailability } from '../src/models/index.js';
import { clock } from '../src/utils/clock.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';
const CARCAVELOS = 'pt-cascais-carcavelos';
const GUINCHO = 'pt-cascais-guincho';
const MIDNIGHT = '2026-07-15T23:00:00.000Z'; // 00:00 Lisbon on the 16th

const ACTIVE = { status: 'ACTIVE' };
const OFF = { status: 'OFF' };
const atSpot = (spotId = CARCAVELOS) => ({ status: 'AT_SPOT', spotId });
const relative = (minutes, spotId = CARCAVELOS) => ({ status: 'COMING_SOON', spotId, arrival: { type: 'relative', minutes } });
const window = (startHour, spotId = CARCAVELOS) => ({ status: 'COMING_SOON', spotId, arrival: { type: 'window', startHour } });

let server;
let baseUrl;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);

function setNow(iso) {
  mock.restoreAll();
  mock.method(clock, 'now', () => new Date(iso));
}

async function signedInUser({ withProfile = true } = {}) {
  counter += 1;
  const email = testEmail(`avail-put-${counter}`);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const user = { id: registered.body.user.id, token: sessionToken(loggedIn) };
  if (withProfile) {
    await call('/api/v1/profile/me', {
      method: 'PUT',
      cookie: user.token,
      origin: TEST_CLIENT_ORIGIN,
      body: { displayName: 'Kai Silva', skillLevel: 'intermediate' },
    });
  }
  return user;
}

const getMine = (user) => call('/api/v1/availability/me', { cookie: user?.token });
const postMine = (user, body, options = {}) =>
  call('/api/v1/availability/me', { method: 'POST', cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body, ...options });
const putMine = (user, body, options = {}) =>
  call('/api/v1/availability/me', { method: 'PUT', cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body, ...options });

// The stored row as plain values (dates as ISO strings)
async function storedRow(user) {
  const rows = await SurferAvailability.findAll({ where: { userId: user.id } });
  assert.equal(rows.length, 1, 'exactly one availability row');
  const values = rows[0].get({ plain: true });
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}

// A user whose first availability was created with POST at `iso`
async function userWith(body, iso) {
  setNow(iso);
  const user = await signedInUser();
  const created = await postMine(user, body);
  assert.equal(created.status, 201, created.text);
  return { user, before: await storedRow(user) };
}

const NO_ARRIVAL = { arrivalType: null, arrivalOffsetMinutes: null, arrivalAt: null, windowStartsAt: null, windowEndsAt: null };

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

describe('changing between statuses', () => {
  test('ACTIVE → COMING_SOON (relative): same row, new arrival and expiry', async () => {
    const { user, before } = await userWith(ACTIVE, '2026-07-15T08:00:00Z');
    setNow('2026-07-15T09:00:00Z');
    const response = await putMine(user, relative(60));
    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.body.availability.arrival, { type: 'relative', minutes: 60, arrivesAt: '2026-07-15T10:00:00.000Z' });
    assert.equal(response.body.availability.expiresAt, '2026-07-15T11:00:00.000Z');
    assert.equal(response.body.availability.state, 'available');

    const after = await storedRow(user);
    assert.equal(after.id, before.id);
    assert.equal(after.status, 'coming_soon');
    assert.equal(after.spotId, CARCAVELOS);
  });

  test('COMING_SOON (window) → AT_SPOT: arrival cleared, the new spot is the one sent', async () => {
    const { user, before } = await userWith(window(13), '2026-07-15T09:00:00Z');
    setNow('2026-07-15T12:30:00Z');
    const response = await putMine(user, atSpot(GUINCHO));
    assert.equal(response.status, 200);
    assert.equal(response.body.availability.arrival, null);
    assert.equal(response.body.availability.spot.id, GUINCHO);
    assert.equal(response.body.availability.expiresAt, '2026-07-15T15:30:00.000Z');
    const after = await storedRow(user);
    assert.deepEqual({ ...after, updatedAt: null }, { ...before, ...NO_ARRIVAL, status: 'at_spot', spotId: GUINCHO, expiresAt: '2026-07-15T15:30:00.000Z', updatedAt: null });
  });

  test('AT_SPOT → ACTIVE without a spot: the old spot is not reused', async () => {
    const { user } = await userWith(atSpot(), '2026-07-15T09:00:00Z');
    setNow('2026-07-15T10:00:00Z');
    const response = await putMine(user, ACTIVE);
    assert.equal(response.body.availability.spot, null);
    assert.equal(response.body.availability.expiresAt, MIDNIGHT);
    assert.equal((await storedRow(user)).spotId, null);
  });

  test('COMING_SOON → AT_SPOT without a spot is rejected (the old spot is not silently kept)', async () => {
    const { user, before } = await userWith(relative(30), '2026-07-15T09:00:00Z');
    const response = await putMine(user, { status: 'AT_SPOT' });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors.spotId, 'Choose a surf spot.');
    assert.deepEqual(await storedRow(user), before);
  });

  test('AT_SPOT → COMING_SOON needs a new arrival', async () => {
    const { user, before } = await userWith(atSpot(), '2026-07-15T09:00:00Z');
    assert.equal((await putMine(user, { status: 'COMING_SOON', spotId: CARCAVELOS })).body.errors.arrival, 'Choose when you expect to arrive.');
    assert.deepEqual(await storedRow(user), before);
    assert.equal((await putMine(user, window(11))).status, 200);
  });

  test('details of the same status: Active spot on/off, relative ↔ window, other spots', async () => {
    const { user } = await userWith(ACTIVE, '2026-07-15T08:00:00Z');
    const steps = [
      [{ status: 'ACTIVE', spotId: GUINCHO }, (a) => a.spot?.id === GUINCHO],
      [ACTIVE, (a) => a.spot === null],
      [relative(30), (a) => a.arrival.type === 'relative'],
      [window(13), (a) => a.arrival.type === 'window' && a.arrival.startHour === 13],
      [relative(120), (a) => a.arrival.minutes === 120],
      [relative(120, GUINCHO), (a) => a.spot.id === GUINCHO],
      [atSpot(), (a) => a.spot.id === CARCAVELOS],
      [atSpot(GUINCHO), (a) => a.spot.id === GUINCHO],
    ];
    for (const [body, check] of steps) {
      const response = await putMine(user, body);
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.ok(check(response.body.availability), JSON.stringify(response.body.availability));
    }
    // After relative → window → relative, no window fields are left behind
    const relativeRow = await (async () => {
      await putMine(user, window(13));
      await putMine(user, relative(60));
      return storedRow(user);
    })();
    assert.equal(relativeRow.windowStartsAt, null);
    assert.equal(relativeRow.windowEndsAt, null);
    const windowRow = await (async () => {
      await putMine(user, window(15));
      return storedRow(user);
    })();
    assert.equal(windowRow.arrivalAt, null);
    assert.equal(windowRow.arrivalOffsetMinutes, null);
  });
});

describe('switching to OFF', () => {
  for (const [name, body] of [
    ['ACTIVE with a spot', { status: 'ACTIVE', spotId: CARCAVELOS }],
    ['COMING_SOON relative', relative(60)],
    ['COMING_SOON window', window(13)],
    ['AT_SPOT', atSpot()],
  ]) {
    test(`${name} → OFF clears spot, arrival and expiry`, async () => {
      const { user, before } = await userWith(body, '2026-07-15T09:00:00Z');
      await sequelize.query("UPDATE surfer_availability SET updated_at = '2026-01-01T00:00:00Z' WHERE user_id = :id", { replacements: { id: user.id } });

      setNow('2026-07-15T09:30:00Z');
      const response = await putMine(user, OFF);
      assert.equal(response.status, 200);
      const { availability } = response.body;
      assert.deepEqual(
        { status: availability.status, state: availability.state, isAvailable: availability.isAvailable, spot: availability.spot, arrival: availability.arrival, expiresAt: availability.expiresAt },
        { status: 'OFF', state: 'off', isAvailable: false, spot: null, arrival: null, expiresAt: null },
      );

      const after = await storedRow(user);
      assert.equal(after.id, before.id);
      assert.deepEqual({ status: after.status, spotId: after.spotId, ...Object.fromEntries(Object.keys(NO_ARRIVAL).map((k) => [k, after[k]])), expiresAt: after.expiresAt }, { status: 'off', spotId: null, ...NO_ARRIVAL, expiresAt: null });
      assert.ok(after.updatedAt > '2026-01-01T00:00:00.000Z', 'updated_at changed');
      // Immediately not available, by the model's own rule
      const row = await SurferAvailability.findOne({ where: { userId: user.id } });
      assert.equal(row.isCurrentlyAvailable(new Date('2026-07-15T09:30:00Z')), false);
    });
  }

  test('OFF keeps the profile', async () => {
    const { user } = await userWith(ACTIVE, '2026-07-15T09:00:00Z');
    await putMine(user, OFF);
    const profile = await call('/api/v1/profile/me', { cookie: user.token });
    assert.equal(profile.body.profile.displayName, 'Kai Silva');
  });
});

describe('reactivating', () => {
  test('OFF → ACTIVE, COMING_SOON and AT_SPOT, same row', async () => {
    for (const body of [ACTIVE, window(13), atSpot()]) {
      const { user, before } = await userWith(OFF, '2026-07-15T09:00:00Z');
      setNow('2026-07-15T10:00:00Z');
      const response = await putMine(user, body);
      assert.equal(response.status, 200, response.text);
      assert.equal(response.body.availability.state, 'available');
      assert.equal((await storedRow(user)).id, before.id);
    }
  });

  test('yesterday’s expired ACTIVE → ACTIVE today, expiring at tonight’s midnight', async () => {
    const { user, before } = await userWith(ACTIVE, '2026-07-14T20:00:00Z');
    setNow('2026-07-15T08:00:00Z');
    assert.equal((await getMine(user)).body.availability.state, 'expired');
    const response = await putMine(user, ACTIVE);
    assert.equal(response.status, 200);
    assert.equal(response.body.availability.state, 'available');
    assert.equal(response.body.availability.expiresAt, MIDNIGHT);
    assert.equal((await storedRow(user)).id, before.id);
  });

  test('expired COMING_SOON → COMING_SOON with a new arrival', async () => {
    const { user } = await userWith(relative(30), '2026-07-15T06:00:00Z'); // expires 07:30Z
    setNow('2026-07-15T09:00:00Z');
    assert.equal((await getMine(user)).body.availability.state, 'expired');
    const response = await putMine(user, relative(120));
    assert.equal(response.body.availability.arrival.arrivesAt, '2026-07-15T11:00:00.000Z');
    assert.equal(response.body.availability.expiresAt, '2026-07-15T12:00:00.000Z');
    assert.equal(response.body.availability.state, 'available');
  });

  test('expired AT_SPOT → ACTIVE', async () => {
    const { user } = await userWith(atSpot(), '2026-07-15T06:00:00Z'); // expires 09:00Z
    setNow('2026-07-15T09:00:00Z'); // exactly expired
    assert.equal((await getMine(user)).body.availability.state, 'expired');
    const response = await putMine(user, ACTIVE);
    assert.deepEqual(
      { state: response.body.availability.state, spot: response.body.availability.spot, expiresAt: response.body.availability.expiresAt },
      { state: 'available', spot: null, expiresAt: MIDNIGHT },
    );
  });
});

describe('same-status renewal', () => {
  test('AT_SPOT again an hour later: expiry moves from 13:00 to 14:00 Lisbon', async () => {
    const { user } = await userWith(atSpot(), '2026-07-15T09:00:00Z');
    assert.equal((await getMine(user)).body.availability.expiresAt, '2026-07-15T12:00:00.000Z');
    setNow('2026-07-15T10:00:00Z');
    const response = await putMine(user, atSpot());
    assert.equal(response.status, 200);
    assert.equal(response.body.availability.expiresAt, '2026-07-15T13:00:00.000Z');
  });

  test('the same relative option again recalculates the arrival from now', async () => {
    const { user } = await userWith(relative(60), '2026-07-15T09:00:00Z');
    setNow('2026-07-15T09:20:00Z');
    const response = await putMine(user, relative(60));
    assert.equal(response.body.availability.arrival.arrivesAt, '2026-07-15T10:20:00.000Z');
    assert.equal(response.body.availability.expiresAt, '2026-07-15T11:20:00.000Z');
  });

  test('ACTIVE → ACTIVE and OFF → OFF succeed and update updated_at', async () => {
    for (const body of [ACTIVE, OFF]) {
      const { user, before } = await userWith(body, '2026-07-15T09:00:00Z');
      await sequelize.query("UPDATE surfer_availability SET updated_at = '2026-01-01T00:00:00Z' WHERE user_id = :id", { replacements: { id: user.id } });
      const response = await putMine(user, body);
      assert.equal(response.status, 200);
      const after = await storedRow(user);
      assert.equal(after.id, before.id);
      assert.ok(after.updatedAt > '2026-01-01T00:00:00.000Z');
    }
  });
});

describe('time rules on update', () => {
  test('a started window is accepted (09:40 → 09:00–11:00); an ended one is not', async () => {
    const { user, before } = await userWith(ACTIVE, '2026-07-15T07:00:00Z');
    setNow('2026-07-15T08:40:00Z');
    const started = await putMine(user, window(9));
    assert.equal(started.status, 200);
    assert.equal(started.body.availability.expiresAt, '2026-07-15T11:00:00.000Z');

    const stored = await storedRow(user);
    setNow('2026-07-15T10:00:00Z'); // 11:00 Lisbon: the 09:00 window has ended
    const ended = await putMine(user, window(9));
    assert.equal(ended.status, 400);
    assert.match(ended.body.errors.arrival, /already ended/);
    assert.deepEqual(await storedRow(user), stored);
    assert.equal(stored.id, before.id);
  });

  test('a relative arrival crossing midnight is rejected; a late one is capped', async () => {
    const { user } = await userWith(ACTIVE, '2026-07-15T21:00:00Z');
    setNow('2026-07-15T22:00:00Z'); // 23:00 Lisbon
    assert.match((await putMine(user, relative(60))).body.errors.arrival, /tomorrow/);
    const capped = await putMine(user, relative(30));
    assert.equal(capped.body.availability.expiresAt, MIDNIGHT);
  });

  test('month and year ends', async () => {
    const { user } = await userWith(ACTIVE, '2026-07-31T08:00:00Z');
    setNow('2026-07-31T21:30:00Z'); // 22:30 Lisbon, 31 July
    assert.equal((await putMine(user, ACTIVE)).body.availability.expiresAt, '2026-07-31T23:00:00.000Z');
    setNow('2026-12-31T23:30:00Z'); // 23:30 Lisbon (winter), New Year's Eve
    assert.equal((await putMine(user, atSpot())).body.availability.expiresAt, '2027-01-01T00:00:00.000Z');
  });

  test('summer-time change days and winter time', async () => {
    const { user } = await userWith(ACTIVE, '2026-03-28T10:00:00Z');
    // 29 March (23-hour day): 22:30 WEST → capped at 00:00 WEST = 23:00 UTC
    setNow('2026-03-29T21:30:00Z');
    assert.equal((await putMine(user, atSpot())).body.availability.expiresAt, '2026-03-29T23:00:00.000Z');
    // 25 October (25-hour day): 19:00–21:00 WET = 19:00–21:00 UTC
    setNow('2026-10-25T12:00:00Z');
    const october = (await putMine(user, window(19))).body.availability;
    assert.deepEqual([october.arrival.startsAt, october.expiresAt], ['2026-10-25T19:00:00.000Z', '2026-10-25T22:00:00.000Z']);
    // Winter: 10:00 Lisbon = 10:00 UTC; arrival in 30 min, expiry 1 h later
    setNow('2026-12-15T10:00:00Z');
    const winter = (await putMine(user, relative(30))).body.availability;
    assert.deepEqual([winter.arrival.arrivesAt, winter.expiresAt], ['2026-12-15T10:30:00.000Z', '2026-12-15T11:30:00.000Z']);
  });

  test('an updated status expires exactly at its expiry time', async () => {
    const { user } = await userWith(ACTIVE, '2026-07-15T08:00:00Z');
    setNow('2026-07-15T09:00:00Z');
    await putMine(user, atSpot()); // expires 12:00Z
    setNow('2026-07-15T11:59:59Z');
    assert.equal((await getMine(user)).body.availability.state, 'available');
    setNow('2026-07-15T12:00:00Z');
    assert.equal((await getMine(user)).body.availability.state, 'expired');
  });
});

describe('validation leaves the stored record unchanged', () => {
  const cases = [
    ['unsupported status', { status: 'INVISIBLE' }, 'status'],
    ['lowercase status', { status: 'active' }, 'status'],
    ['missing spot', { status: 'AT_SPOT' }, 'spotId'],
    ['unknown spot', atSpot('pt-nowhere'), 'spotId'],
    ['invalid arrival mode', { status: 'COMING_SOON', spotId: CARCAVELOS, arrival: { type: 'later' } }, 'arrival'],
    ['invalid offset', relative(45), 'arrival'],
    ['invalid window', window(8), 'arrival'],
    ['tomorrow’s date', { status: 'COMING_SOON', spotId: CARCAVELOS, arrival: { type: 'window', startHour: 13, date: '2026-07-16' } }, 'arrival'],
    ['unexpected field', { status: 'ACTIVE', note: 'hi' }, 'note'],
    ['client expiresAt', { status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z' }, 'expiresAt'],
    ['client userId', { status: 'ACTIVE', userId: '00000000-0000-4000-8000-000000000000' }, 'userId'],
    ['conflicting arrival fields', { status: 'COMING_SOON', spotId: CARCAVELOS, arrival: { type: 'relative', minutes: 30, startHour: 9 } }, 'arrival'],
    ['arrival with ACTIVE', { status: 'ACTIVE', arrival: { type: 'relative', minutes: 30 } }, 'arrival'],
    ['arrival with AT_SPOT', { ...atSpot(), arrival: { type: 'window', startHour: 13 } }, 'arrival'],
    ['spot or arrival with OFF', { status: 'OFF', spotId: CARCAVELOS, arrival: { type: 'relative', minutes: 30 } }, 'spotId'],
  ];

  for (const [name, body, field] of cases) {
    test(name, async () => {
      const { user, before } = await userWith(window(13), '2026-07-15T09:00:00Z');
      const response = await putMine(user, body);
      assert.equal(response.status, 400, response.text);
      assert.equal(response.body.message, 'Please check the availability details.');
      assert.ok(response.body.errors[field], `${field}: ${JSON.stringify(response.body.errors)}`);
      assert.deepEqual(await storedRow(user), before);
    });
  }
});

describe('one row, concurrent updates', () => {
  test('simultaneous different updates end in one complete status from one request', async () => {
    const { user, before } = await userWith(ACTIVE, '2026-07-15T08:00:00Z');
    setNow('2026-07-15T09:00:00Z');
    const bodies = [{ status: 'ACTIVE', spotId: GUINCHO }, relative(60), window(13, GUINCHO), atSpot(), OFF];
    const responses = await Promise.all(bodies.map((body) => putMine(user, body)));
    assert.deepEqual(responses.map((r) => r.status), [200, 200, 200, 200, 200]);

    const after = await storedRow(user);
    assert.equal(after.id, before.id);
    const final = (await getMine(user)).body.availability;
    // The stored state is exactly what one of the requests returned
    const strip = ({ updatedAt: _updatedAt, ...rest }) => rest;
    assert.ok(
      responses.some((r) => JSON.stringify(strip(r.body.availability)) === JSON.stringify(strip(final))),
      `final state ${JSON.stringify(final)} matches one response`,
    );
    assert.equal(await SurferAvailability.count({ where: { userId: user.id } }), 1);
  });
});

describe('access and endpoint responsibilities', () => {
  test('PUT without an existing record is a 404 and creates nothing', async () => {
    setNow('2026-07-15T09:00:00Z');
    const user = await signedInUser();
    const response = await putMine(user, ACTIVE);
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { status: 'error', code: 'AVAILABILITY_NOT_FOUND', message: 'You haven’t set an availability status yet.' });
    assert.equal(await SurferAvailability.count({ where: { userId: user.id } }), 0);
  });

  test('POST stays creation-only: 409 for existing Off and expired records', async () => {
    const off = await userWith(OFF, '2026-07-15T09:00:00Z');
    assert.equal((await postMine(off.user, ACTIVE)).body.code, 'AVAILABILITY_EXISTS');
    const expired = await userWith(ACTIVE, '2026-07-14T20:00:00Z');
    setNow('2026-07-15T09:00:00Z');
    assert.equal((await postMine(expired.user, ACTIVE)).status, 409);
    assert.deepEqual(await storedRow(expired.user), expired.before);
  });

  test('PUT requires a session and a completed profile', async () => {
    assert.equal((await putMine(null, ACTIVE)).status, 401);
    const noProfile = await signedInUser({ withProfile: false });
    const response = await putMine(noProfile, ACTIVE);
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'PROFILE_REQUIRED');
  });

  test('PUT from another website is blocked (CSRF) and changes nothing', async () => {
    const { user, before } = await userWith(ACTIVE, '2026-07-15T09:00:00Z');
    const response = await putMine(user, OFF, { origin: 'https://evil.example' });
    assert.equal(response.status, 403);
    assert.deepEqual(await storedRow(user), before);
  });

  test('a user only ever changes their own availability', async () => {
    const owner = await userWith(ACTIVE, '2026-07-15T09:00:00Z');
    const other = await userWith(ACTIVE, '2026-07-15T09:00:00Z');
    await putMine(other.user, OFF);
    assert.deepEqual(await storedRow(owner.user), owner.before);
    assert.equal((await storedRow(other.user)).status, 'off');
  });

  test('responses never include the row id or user id', async () => {
    const { user, before } = await userWith(ACTIVE, '2026-07-15T09:00:00Z');
    const response = await putMine(user, atSpot());
    assert.ok(!response.text.includes(before.id));
    assert.ok(!response.text.includes(user.id));
  });
});
