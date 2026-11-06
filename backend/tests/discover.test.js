// API tests for GET /api/v1/discover.
//
// The clock is fixed at 15 July 2030, 10:00 UTC (11:00 Lisbon), far after any
// real availability in the development database: real rows always expire by
// their own day's midnight, so they can never appear here. Other surfers are
// created directly through the models (with private data that must never be
// returned); only the requesting surfer signs in through the API. Everything
// belongs to @sesh-test.invalid users and is deleted afterwards.
import './setup.js';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { FavoriteSpot, SurferAvailability, SurferProfile, User } from '../src/models/index.js';
import { clock } from '../src/utils/clock.js';
import { parseDiscoverQuery } from '../src/utils/discovery.js';
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail, TEST_DOMAIN } from './helpers.js';

const NOW = new Date('2030-07-15T10:00:00Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const later = (ms) => new Date(NOW.getTime() + ms);
const CARCAVELOS = 'pt-cascais-carcavelos';
const GUINCHO = 'pt-cascais-guincho';
const SUPERTUBOS = 'pt-peniche-supertubos';
const PASSWORD = 'correct horse battery';

const CARD_KEYS = ['availability', 'avatarUrl', 'displayName', 'skillLevel', 'userId'];
const AVAILABILITY_KEYS = ['arrival', 'spot', 'status'];

let server;
let baseUrl;
let viewer;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);
const discover = (query = '', user = viewer) => call(`/api/v1/discover${query}`, { cookie: user?.token });

// A surfer created directly, with private details that must never leak
async function surfer(name, availability, { withProfile = true, updatedAt, skillLevel = 'intermediate', favoriteSpot = SUPERTUBOS } = {}) {
  counter += 1;
  const user = await User.create({ email: testEmail(`discover-${counter}`), passwordHash: 'not-a-real-hash' });
  if (withProfile) {
    await SurferProfile.create({
      userId: user.id,
      displayName: name,
      skillLevel,
      boardType: 'fish',
      about: 'Private bio text',
      avatarUrl: 'https://res.cloudinary.com/sesh/image/upload/v1/sesh/avatars/abc.jpg',
      avatarPublicId: 'sesh/avatars/private-public-id',
    });
    await FavoriteSpot.create({ userId: user.id, spotId: favoriteSpot });
  }
  if (availability) {
    await SurferAvailability.create({ userId: user.id, ...availability });
    if (updatedAt) {
      await sequelize.query('UPDATE surfer_availability SET updated_at = :updatedAt WHERE user_id = :id', {
        replacements: { updatedAt, id: user.id },
      });
    }
  }
  return { id: user.id, email: user.email, name };
}

const ACTIVE = { status: 'active', expiresAt: later(13 * HOUR) };
const ACTIVE_AT = (spotId) => ({ status: 'active', spotId, expiresAt: later(13 * HOUR) });
const RELATIVE = {
  status: 'coming_soon',
  spotId: CARCAVELOS,
  arrivalType: 'relative',
  arrivalOffsetMinutes: 60,
  arrivalAt: later(HOUR),
  expiresAt: later(2 * HOUR),
};
// 13:00–15:00 Lisbon (summer) = 12:00–14:00 UTC
const WINDOW = {
  status: 'coming_soon',
  spotId: GUINCHO,
  arrivalType: 'window',
  windowStartsAt: new Date('2030-07-15T12:00:00Z'),
  windowEndsAt: new Date('2030-07-15T14:00:00Z'),
  expiresAt: new Date('2030-07-15T15:00:00Z'),
};
const AT_SPOT = { status: 'at_spot', spotId: GUINCHO, expiresAt: later(3 * HOUR) };
const OFF = { status: 'off' };

// Removes the availability of every test user except the viewer's
function clearOthersAvailability() {
  return sequelize.query(
    'DELETE FROM surfer_availability WHERE user_id IN (SELECT id FROM users WHERE email LIKE :domain)',
    { replacements: { domain: `%${TEST_DOMAIN}` } },
  );
}

before(async () => {
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());

  const email = testEmail('discover-viewer');
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  viewer = { id: registered.body.user.id, token: sessionToken(loggedIn) };
  await call('/api/v1/profile/me', {
    method: 'PUT',
    cookie: viewer.token,
    origin: TEST_CLIENT_ORIGIN,
    body: { displayName: 'Viewer', skillLevel: 'beginner' },
  });
});

beforeEach(async () => {
  mock.method(clock, 'now', () => NOW);
  await clearOthersAvailability();
});

afterEach(() => mock.restoreAll());

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('access', () => {
  test('requires a session', async () => {
    const response = await discover('', null);
    assert.equal(response.status, 401);
  });

  test('requires a completed profile', async () => {
    const email = testEmail('discover-no-profile');
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    const response = await discover('', { token: sessionToken(loggedIn) });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'PROFILE_REQUIRED');
  });

  test('a surfer with a profile gets an empty list when nobody is available', async () => {
    const response = await discover();
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { surfers: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });
});

describe('who appears', () => {
  test('only other surfers with a profile and a current, non-Off status', async () => {
    const included = [
      await surfer('Active no spot', ACTIVE),
      await surfer('Active with spot', ACTIVE_AT(CARCAVELOS)),
      await surfer('Coming relative', RELATIVE),
      await surfer('Coming window', WINDOW),
      await surfer('At spot', AT_SPOT),
    ];
    await surfer('Off', OFF);
    await surfer('Expired', { status: 'at_spot', spotId: GUINCHO, expiresAt: new Date(NOW.getTime() - 1) });
    await surfer('Expires exactly now', { status: 'active', expiresAt: NOW });
    await surfer('No profile', ACTIVE, { withProfile: false });
    await surfer('No availability', null);
    // The viewer is available too, but never sees themselves
    await SurferAvailability.create({ userId: viewer.id, ...ACTIVE });

    const response = await discover();
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.surfers.map((card) => card.userId).sort(), included.map((s) => s.id).sort());
    assert.equal(response.body.pagination.total, 5);
    await SurferAvailability.destroy({ where: { userId: viewer.id } });
  });

  test('a status disappears the moment it expires', async () => {
    const atSpot = await surfer('At spot', { ...AT_SPOT, expiresAt: later(HOUR) });
    mock.method(clock, 'now', () => new Date(later(HOUR).getTime() - 1));
    assert.deepEqual((await discover()).body.surfers.map((card) => card.userId), [atSpot.id]);
    mock.method(clock, 'now', () => later(HOUR));
    assert.deepEqual((await discover()).body.surfers, []);
  });

  test('switching to Off removes the surfer immediately', async () => {
    const someone = await surfer('Someone', ACTIVE);
    assert.equal((await discover()).body.surfers.length, 1);
    await SurferAvailability.update({ status: 'off', expiresAt: null }, { where: { userId: someone.id } });
    assert.equal((await discover()).body.surfers.length, 0);
  });
});

describe('card contents', () => {
  test('only the approved public fields, for every status', async () => {
    const activeNoSpot = await surfer('Ana', ACTIVE);
    const activeSpot = await surfer('Bea', ACTIVE_AT(CARCAVELOS));
    const relative = await surfer('Caio', RELATIVE);
    const windowed = await surfer('Duda', WINDOW);
    const atSpot = await surfer('Edu', AT_SPOT);

    const response = await discover();
    const byId = Object.fromEntries(response.body.surfers.map((card) => [card.userId, card]));

    for (const card of response.body.surfers) {
      assert.deepEqual(Object.keys(card).sort(), CARD_KEYS);
      assert.deepEqual(Object.keys(card.availability).sort(), AVAILABILITY_KEYS);
      assert.equal(card.skillLevel, 'intermediate');
      assert.match(card.avatarUrl, /^https:\/\/res\.cloudinary\.com\//);
    }

    assert.deepEqual(byId[activeNoSpot.id], {
      userId: activeNoSpot.id,
      displayName: 'Ana',
      avatarUrl: 'https://res.cloudinary.com/sesh/image/upload/v1/sesh/avatars/abc.jpg',
      skillLevel: 'intermediate',
      availability: { status: 'ACTIVE', spot: null, arrival: null },
    });
    assert.deepEqual(byId[activeSpot.id].availability, {
      status: 'ACTIVE',
      spot: { id: CARCAVELOS, name: 'Praia de Carcavelos', area: 'Carcavelos' },
      arrival: null,
    });
    assert.deepEqual(byId[relative.id].availability, {
      status: 'COMING_SOON',
      spot: { id: CARCAVELOS, name: 'Praia de Carcavelos', area: 'Carcavelos' },
      arrival: { type: 'relative', arrivesAt: later(HOUR).toISOString() },
    });
    assert.deepEqual(byId[windowed.id].availability.arrival, {
      type: 'window',
      startsAt: '2030-07-15T12:00:00.000Z',
      endsAt: '2030-07-15T14:00:00.000Z',
    });
    assert.deepEqual(byId[atSpot.id].availability, {
      status: 'AT_SPOT',
      spot: { id: GUINCHO, name: 'Praia do Guincho', area: 'Guincho' },
      arrival: null,
    });
  });

  test('no private or unnecessary data anywhere in the response', async () => {
    const someone = await surfer('Private Person', RELATIVE);
    const response = await discover();
    const text = response.text;
    for (const secret of [
      someone.email,
      'not-a-real-hash',
      'Private bio text',
      'fish',
      SUPERTUBOS, // a favourite spot
      'private-public-id',
      'expires',
      'passwordHash',
      'avatarPublicId',
      'boardType',
      'about',
      'favoriteSpots',
      'arrivalOffsetMinutes',
      'minutes',
      'updatedAt',
      'createdAt',
      'email',
    ]) {
      assert.ok(!text.includes(secret), `response must not contain "${secret}"`);
    }
  });

  test('the arrival is returned as stored, not recalculated from the offset', async () => {
    // Stored estimate deliberately differs from "now + 60 minutes"
    const someone = await surfer('Stored', { ...RELATIVE, arrivalAt: later(45 * MINUTE) });
    const card = (await discover()).body.surfers.find((c) => c.userId === someone.id);
    assert.equal(card.availability.arrival.arrivesAt, later(45 * MINUTE).toISOString());
  });
});

describe('pagination and order', () => {
  // Five surfers; the most recently updated comes first
  async function fiveSurfers() {
    const list = [];
    for (let i = 0; i < 5; i += 1) {
      list.push(await surfer(`Surfer ${i}`, ACTIVE, { updatedAt: new Date(NOW.getTime() - (i + 1) * MINUTE) }));
    }
    return list; // already in expected order: newest first
  }

  test('defaults: page 1, limit 20, newest first', async () => {
    const expected = await fiveSurfers();
    const response = await discover();
    assert.deepEqual(response.body.pagination, { page: 1, limit: 20, total: 5, totalPages: 1 });
    assert.deepEqual(response.body.surfers.map((c) => c.userId), expected.map((s) => s.id));
  });

  test('custom pages cover everyone exactly once, in a stable order', async () => {
    const expected = await fiveSurfers();
    const seen = [];
    for (const page of [1, 2, 3]) {
      const response = await discover(`?page=${page}&limit=2`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.pagination, { page, limit: 2, total: 5, totalPages: 3 });
      seen.push(...response.body.surfers.map((c) => c.userId));
    }
    assert.deepEqual(seen, expected.map((s) => s.id));
    assert.equal(new Set(seen).size, 5);

    // The same request gives the same result
    assert.deepEqual((await discover('?page=2&limit=2')).body, (await discover('?page=2&limit=2')).body);
  });

  test('a page after the last one is empty with valid metadata', async () => {
    await fiveSurfers();
    const response = await discover('?page=4&limit=2');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { surfers: [], pagination: { page: 4, limit: 2, total: 5, totalPages: 3 } });
  });

  test('equal update times are ordered by user id', async () => {
    const same = new Date(NOW.getTime() - MINUTE);
    const a = await surfer('Tie A', ACTIVE, { updatedAt: same });
    const b = await surfer('Tie B', ACTIVE, { updatedAt: same });
    const ids = (await discover()).body.surfers.map((c) => c.userId);
    assert.deepEqual(ids, [a.id, b.id].sort());
  });

  test('limit up to 50 is accepted; more is rejected', async () => {
    assert.equal((await discover('?limit=50')).status, 200);
    const tooMany = await discover('?limit=51');
    assert.equal(tooMany.status, 400);
    assert.deepEqual(tooMany.body, {
      status: 'error',
      message: 'Please check the search options.',
      errors: { limit: 'Limit must be at most 50.' },
    });
  });

  test('invalid values are rejected with the field named', async () => {
    for (const [query, field] of [
      ['?page=0', 'page'],
      ['?page=-1', 'page'],
      ['?page=abc', 'page'],
      ['?page=1.5', 'page'],
      ['?page=', 'page'],
      ['?page=1e3', 'page'],
      ['?page=1&page=2', 'page'],
      ['?limit=0', 'limit'],
      ['?limit=ten', 'limit'],
      ['?spot=pt-cascais-carcavelos', 'spot'],
    ]) {
      const response = await discover(query);
      assert.equal(response.status, 400, query);
      assert.ok(response.body.errors[field], `${query}: ${JSON.stringify(response.body.errors)}`);
    }
  });
});

test('parseDiscoverQuery (unit)', () => {
  assert.deepEqual(parseDiscoverQuery({}), { page: 1, limit: 20, filters: {} });
  assert.deepEqual(parseDiscoverQuery({ page: '3', limit: '50' }), { page: 3, limit: 50, filters: {} });
  assert.ok(parseDiscoverQuery({ page: '9999999999' }).errors.page); // absurdly large
  assert.ok(parseDiscoverQuery({ limit: ['10', '20'] }).errors.limit);
});

// ---------------------------------------------------------------- Task 8.2
// Filters. NOW is 10:00 UTC = 11:00 Lisbon (summer). Windows start on
// Lisbon hours: 13:00 Lisbon = 12:00 UTC, 17:00 Lisbon = 16:00 UTC.

const ids = (response) => response.body.surfers.map((card) => card.userId).sort();
const sorted = (...people) => people.map((person) => person.id).sort();
const at = (iso) => new Date(iso);
const relativeAt = (iso, spotId = CARCAVELOS) => ({
  status: 'coming_soon',
  spotId,
  arrivalType: 'relative',
  arrivalOffsetMinutes: 60,
  arrivalAt: at(iso),
  expiresAt: new Date(at(iso).getTime() + HOUR),
});
const windowFrom = (startIso, spotId = GUINCHO) => ({
  status: 'coming_soon',
  spotId,
  arrivalType: 'window',
  windowStartsAt: at(startIso),
  windowEndsAt: new Date(at(startIso).getTime() + 2 * HOUR),
  expiresAt: new Date(at(startIso).getTime() + 3 * HOUR),
});
const q = (params) => `?${new URLSearchParams(params)}`;

describe('filter: spotId (current availability spot)', () => {
  test('matches Coming Soon, At the Spot and Active preferred spots; Active without a spot only without the filter', async () => {
    const activeNoSpot = await surfer('Active no spot', ACTIVE);
    const activeCarcavelos = await surfer('Active Carcavelos', ACTIVE_AT(CARCAVELOS));
    const comingCarcavelos = await surfer('Coming Carcavelos', RELATIVE); // Carcavelos
    const atGuincho = await surfer('At Guincho', AT_SPOT); // Guincho
    // Favourite spot Carcavelos, but currently at Guincho: favourites don't count
    const favouriteOnly = await surfer('Favourite Carcavelos', AT_SPOT, { favoriteSpot: CARCAVELOS });

    assert.deepEqual(ids(await discover(q({ spotId: CARCAVELOS }))), sorted(activeCarcavelos, comingCarcavelos));
    assert.deepEqual(ids(await discover(q({ spotId: GUINCHO }))), sorted(atGuincho, favouriteOnly));
    assert.deepEqual((await discover(q({ spotId: SUPERTUBOS }))).body.surfers, []); // everyone's favourite, nobody's spot
    assert.deepEqual(ids(await discover()), sorted(activeNoSpot, activeCarcavelos, comingCarcavelos, atGuincho, favouriteOnly));
  });

  test('an unknown or malformed spot id is a 400', async () => {
    for (const [spotId, label] of [['pt-nowhere', 'unknown'], ['Praia de Carcavelos', 'name instead of id'], ['x'.repeat(101), 'too long']]) {
      const response = await discover(q({ spotId }));
      assert.equal(response.status, 400, label);
      assert.equal(response.body.errors.spotId, 'Choose a surf spot from the list.');
    }
  });
});

describe('filter: skillLevel (profile level)', () => {
  test('each level returns only surfers with that profile level', async () => {
    const people = {
      beginner: await surfer('Beginner', ACTIVE, { skillLevel: 'beginner' }),
      intermediate: await surfer('Intermediate', ACTIVE, { skillLevel: 'intermediate' }),
      advanced: await surfer('Advanced', ACTIVE, { skillLevel: 'advanced' }),
    };
    for (const [level, person] of Object.entries(people)) {
      const response = await discover(q({ skillLevel: level }));
      assert.deepEqual(ids(response), [person.id], level);
      assert.equal(response.body.surfers[0].skillLevel, level);
    }
  });

  test('invalid levels are a 400 (values are lowercase, as stored)', async () => {
    for (const skillLevel of ['expert', 'Beginner', 'INTERMEDIATE', '']) {
      const response = await discover(q({ skillLevel }));
      assert.equal(response.status, 400, skillLevel);
      assert.equal(response.body.errors.skillLevel, 'Skill level must be one of: beginner, intermediate, advanced.');
    }
  });
});

describe('filter: status', () => {
  test('each discoverable status; Off and expired never appear', async () => {
    const active = await surfer('Active', ACTIVE);
    const coming = await surfer('Coming', RELATIVE);
    const atSpot = await surfer('At spot', AT_SPOT);
    await surfer('Off', OFF);
    await surfer('Expired coming', { ...RELATIVE, expiresAt: NOW });
    await surfer('Expired at spot', { ...AT_SPOT, expiresAt: new Date(NOW.getTime() - 1) });

    assert.deepEqual(ids(await discover(q({ status: 'ACTIVE' }))), [active.id]);
    assert.deepEqual(ids(await discover(q({ status: 'COMING_SOON' }))), [coming.id]);
    assert.deepEqual(ids(await discover(q({ status: 'AT_SPOT' }))), [atSpot.id]);
  });

  test('invalid statuses are a 400 (OFF is never searchable)', async () => {
    for (const status of ['OFF', 'active', 'AT_THE_SPOT', 'INVISIBLE']) {
      const response = await discover(q({ status }));
      assert.equal(response.status, 400, status);
      assert.equal(response.body.errors.status, 'Status must be one of: ACTIVE, COMING_SOON, AT_SPOT.');
    }
  });
});

describe('filter: arrival time range (Coming Soon only)', () => {
  // R11 arrives 11:00Z, R1130 at 11:30Z; W12 is 12:00–14:00Z, W16 is 16:00–18:00Z
  async function arrivals() {
    return {
      r11: await surfer('Relative 11:00', relativeAt('2030-07-15T11:00:00Z')),
      r1130: await surfer('Relative 11:30', relativeAt('2030-07-15T11:30:00Z')),
      w12: await surfer('Window 12-14', windowFrom('2030-07-15T12:00:00Z')),
      w16: await surfer('Window 16-18', windowFrom('2030-07-15T16:00:00Z')),
      active: await surfer('Active', ACTIVE),
      atSpot: await surfer('At spot', AT_SPOT),
    };
  }
  const range = (from, to) => q({ ...(from && { arrivalFrom: from }), ...(to && { arrivalTo: to }) });

  test('relative arrivals: inside the range (inclusive) or not', async () => {
    const p = await arrivals();
    assert.deepEqual(ids(await discover(range('2030-07-15T10:45:00Z', '2030-07-15T11:15:00Z'))), [p.r11.id]);
    assert.deepEqual(ids(await discover(range('2030-07-15T11:00:00Z', '2030-07-15T11:30:00Z'))), sorted(p.r11, p.r1130)); // both ends inclusive
    assert.deepEqual(ids(await discover(range('2030-07-15T11:00:01Z', '2030-07-15T11:29:59Z'))), []);
  });

  test('windows: included when they overlap the range, touching edges included', async () => {
    const p = await arrivals();
    assert.deepEqual(ids(await discover(range('2030-07-15T13:00:00Z', '2030-07-15T13:30:00Z'))), [p.w12.id]); // inside
    assert.deepEqual(ids(await discover(range('2030-07-15T11:45:00Z', '2030-07-15T12:15:00Z'))), [p.w12.id]); // overlaps start
    assert.deepEqual(ids(await discover(range('2030-07-15T14:00:00Z', '2030-07-15T16:00:00Z'))), sorted(p.w12, p.w16)); // touches both
    assert.deepEqual(ids(await discover(range('2030-07-15T14:00:01Z', '2030-07-15T15:59:59Z'))), []); // in between
  });

  test('a zero-length range is a point in time', async () => {
    const p = await arrivals();
    assert.deepEqual(ids(await discover(range('2030-07-15T11:30:00Z', '2030-07-15T11:30:00Z'))), [p.r1130.id]);
    assert.deepEqual(ids(await discover(range('2030-07-15T13:00:00Z', '2030-07-15T13:00:00Z'))), [p.w12.id]);
  });

  test('one-sided ranges', async () => {
    const p = await arrivals();
    // From 12:30: everything arriving / in a window that ends at or after 12:30
    assert.deepEqual(ids(await discover(range('2030-07-15T12:30:00Z'))), sorted(p.w12, p.w16));
    // Until 11:30: arrivals at or before 11:30 and windows starting by then
    assert.deepEqual(ids(await discover(range(null, '2030-07-15T11:30:00Z'))), sorted(p.r11, p.r1130));
    // Until 16:00: the 16:00 window starts exactly then (inclusive)
    assert.deepEqual(ids(await discover(range(null, '2030-07-15T16:00:00Z'))), sorted(p.r11, p.r1130, p.w12, p.w16));
  });

  test('Active and At the Spot never match an arrival range; combining them with it gives an empty result', async () => {
    const p = await arrivals();
    const wide = range('2030-07-15T00:00:00Z', '2030-07-15T23:59:59Z');
    assert.deepEqual(ids(await discover(wide)), sorted(p.r11, p.r1130, p.w12, p.w16));
    for (const status of ['ACTIVE', 'AT_SPOT']) {
      const response = await discover(`${wide}&status=${status}`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { surfers: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }
    assert.deepEqual(ids(await discover(`${wide}&status=COMING_SOON`)), sorted(p.r11, p.r1130, p.w12, p.w16));
  });

  test('offsets other than Z are accepted and compared as instants', async () => {
    const p = await arrivals();
    // 12:00+01:00 = 11:00Z
    const response = await discover(range('2030-07-15T11:45:00+01:00', '2030-07-15T12:15:00+01:00'));
    assert.deepEqual(ids(response), [p.r11.id]);
  });

  test('invalid timestamps and reversed ranges are a 400', async () => {
    for (const [params, field] of [
      [{ arrivalFrom: 'tomorrow' }, 'arrivalFrom'],
      [{ arrivalFrom: '2030-07-15' }, 'arrivalFrom'],
      [{ arrivalFrom: '2030-07-15T10:00:00' }, 'arrivalFrom'], // no time zone
      [{ arrivalTo: '2030-02-30T10:00:00Z' }, 'arrivalTo'], // no such day
      [{ arrivalTo: '2030-07-15T24:00:00Z' }, 'arrivalTo'],
      [{ arrivalFrom: '1794009600000' }, 'arrivalFrom'], // epoch milliseconds
      [{ arrivalFrom: '2030-07-15T12:00:00Z', arrivalTo: '2030-07-15T11:59:59Z' }, 'arrivalTo'], // reversed
    ]) {
      const response = await discover(q(params));
      assert.equal(response.status, 400, JSON.stringify(params));
      assert.ok(response.body.errors[field], `${JSON.stringify(params)}: ${JSON.stringify(response.body.errors)}`);
    }
    const repeated = await discover('?arrivalFrom=2030-07-15T10:00:00Z&arrivalFrom=2030-07-15T11:00:00Z');
    assert.equal(repeated.status, 400);
    assert.ok(repeated.body.errors.arrivalFrom);
  });
});

describe('combined filters (AND)', () => {
  async function mix() {
    return {
      // Intermediate, Coming Soon to Carcavelos, arriving 11:00Z
      target: await surfer('Target', relativeAt('2030-07-15T11:00:00Z', CARCAVELOS)),
      // Same but beginner
      beginnerComing: await surfer('Beginner coming', relativeAt('2030-07-15T11:00:00Z', CARCAVELOS), { skillLevel: 'beginner' }),
      // Intermediate, Coming Soon to Guincho
      otherSpot: await surfer('Other spot', relativeAt('2030-07-15T11:00:00Z', GUINCHO)),
      // Intermediate, Active preferring Carcavelos
      activeHere: await surfer('Active here', ACTIVE_AT(CARCAVELOS)),
      // Intermediate, Coming Soon to Carcavelos but arriving later (17:00 window)
      later: await surfer('Later', windowFrom('2030-07-15T16:00:00Z', CARCAVELOS)),
      // Beginner, Active without spot
      beginnerActive: await surfer('Beginner active', ACTIVE, { skillLevel: 'beginner' }),
    };
  }

  test('spot + skill, spot + status, skill + status', async () => {
    const p = await mix();
    assert.deepEqual(ids(await discover(q({ spotId: CARCAVELOS, skillLevel: 'intermediate' }))), sorted(p.target, p.activeHere, p.later));
    assert.deepEqual(ids(await discover(q({ spotId: CARCAVELOS, status: 'COMING_SOON' }))), sorted(p.target, p.beginnerComing, p.later));
    assert.deepEqual(ids(await discover(q({ skillLevel: 'beginner', status: 'ACTIVE' }))), [p.beginnerActive.id]);
  });

  test('status + arrival, and all filters together', async () => {
    const p = await mix();
    const morning = { arrivalFrom: '2030-07-15T10:30:00Z', arrivalTo: '2030-07-15T11:30:00Z' };
    assert.deepEqual(ids(await discover(q({ status: 'COMING_SOON', ...morning }))), sorted(p.target, p.beginnerComing, p.otherSpot));
    const all = await discover(q({ spotId: CARCAVELOS, skillLevel: 'intermediate', status: 'COMING_SOON', ...morning, page: '1', limit: '20' }));
    assert.equal(all.status, 200);
    assert.deepEqual(ids(all), [p.target.id]);
    assert.deepEqual(all.body.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  test('filtered cards keep the exact public shape and leak nothing', async () => {
    await mix();
    const response = await discover(q({ spotId: CARCAVELOS, skillLevel: 'intermediate' }));
    for (const card of response.body.surfers) {
      assert.deepEqual(Object.keys(card).sort(), CARD_KEYS);
      assert.deepEqual(Object.keys(card.availability).sort(), AVAILABILITY_KEYS);
    }
    for (const secret of ['Private bio text', 'fish', 'private-public-id', 'expires', 'not-a-real-hash', '@sesh-test.invalid', 'favoriteSpots']) {
      assert.ok(!response.text.includes(secret), secret);
    }
  });
});

describe('filters with pagination', () => {
  test('filters apply before paging: totals, pages and order describe the filtered set', async () => {
    const matching = [];
    for (let i = 0; i < 5; i += 1) {
      matching.push(await surfer(`Match ${i}`, ACTIVE_AT(CARCAVELOS), { updatedAt: new Date(NOW.getTime() - (i + 1) * MINUTE) }));
      // Interleaved non-matching surfers (other level), newer than each match
      await surfer(`Other ${i}`, ACTIVE_AT(CARCAVELOS), { skillLevel: 'advanced', updatedAt: new Date(NOW.getTime() - i * MINUTE - 30 * 1000) });
    }

    const seen = [];
    for (const page of [1, 2, 3]) {
      const response = await discover(q({ spotId: CARCAVELOS, skillLevel: 'intermediate', page: String(page), limit: '2' }));
      assert.deepEqual(response.body.pagination, { page, limit: 2, total: 5, totalPages: 3 });
      seen.push(...response.body.surfers.map((card) => card.userId));
    }
    assert.deepEqual(seen, matching.map((person) => person.id)); // newest first, each once
    assert.equal(new Set(seen).size, 5);
    // Unfiltered, all ten are there
    assert.equal((await discover(q({ spotId: CARCAVELOS }))).body.pagination.total, 10);
  });

  test('no filters still behaves exactly as before', async () => {
    const a = await surfer('A', ACTIVE, { updatedAt: new Date(NOW.getTime() - MINUTE) });
    const b = await surfer('B', RELATIVE, { updatedAt: new Date(NOW.getTime() - 2 * MINUTE) });
    const response = await discover();
    assert.deepEqual(response.body.surfers.map((card) => card.userId), [a.id, b.id]);
    assert.deepEqual(response.body.pagination, { page: 1, limit: 20, total: 2, totalPages: 1 });
  });
});
