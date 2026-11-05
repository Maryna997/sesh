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
async function surfer(name, availability, { withProfile = true, updatedAt } = {}) {
  counter += 1;
  const user = await User.create({ email: testEmail(`discover-${counter}`), passwordHash: 'not-a-real-hash' });
  if (withProfile) {
    await SurferProfile.create({
      userId: user.id,
      displayName: name,
      skillLevel: 'intermediate',
      boardType: 'fish',
      about: 'Private bio text',
      avatarUrl: 'https://res.cloudinary.com/sesh/image/upload/v1/sesh/avatars/abc.jpg',
      avatarPublicId: 'sesh/avatars/private-public-id',
    });
    await FavoriteSpot.create({ userId: user.id, spotId: SUPERTUBOS });
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
  assert.deepEqual(parseDiscoverQuery({}), { page: 1, limit: 20 });
  assert.deepEqual(parseDiscoverQuery({ page: '3', limit: '50' }), { page: 3, limit: 50 });
  assert.ok(parseDiscoverQuery({ page: '9999999999' }).errors.page); // absurdly large
  assert.ok(parseDiscoverQuery({ limit: ['10', '20'] }).errors.limit);
});
