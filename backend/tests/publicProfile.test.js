// API tests for the availability part of GET /api/v1/profiles/:userId
// (Task 8.5, public surfer profile).
//
// The clock is fixed at 15 July 2030, 10:00 UTC (11:00 Lisbon), like the
// Discover tests. The viewed surfer is created directly through the models,
// with private data that must never be returned; the viewer signs in through
// the API. Everything belongs to @sesh-test.invalid users and is deleted
// afterwards.
import './setup.js';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { FavoriteSpot, SurferAvailability, SurferProfile, User } from '../src/models/index.js';
import { clock } from '../src/utils/clock.js';
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const NOW = new Date('2030-07-15T10:00:00Z');
const HOUR = 60 * 60 * 1000;
const later = (ms) => new Date(NOW.getTime() + ms);
const CARCAVELOS = 'pt-cascais-carcavelos';
const GUINCHO = 'pt-cascais-guincho';
const PASSWORD = 'correct horse battery';
const AVAILABILITY_KEYS = ['arrival', 'spot', 'status'];

let server;
let baseUrl;
let viewer;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);
const viewProfile = (userId) => call(`/api/v1/profiles/${userId}`, { cookie: viewer.token });

// A surfer with a complete profile (and private details) and, optionally, an availability row
async function surfer(availability) {
  counter += 1;
  const user = await User.create({ email: testEmail(`public-${counter}`), passwordHash: 'not-a-real-hash' });
  await SurferProfile.create({
    userId: user.id,
    displayName: `Surfer ${counter}`,
    skillLevel: 'advanced',
    avatarUrl: 'https://res.cloudinary.com/sesh/image/upload/v1/sesh/avatars/abc.jpg',
    avatarPublicId: 'sesh/avatars/private-public-id',
  });
  await FavoriteSpot.create({ userId: user.id, spotId: CARCAVELOS });
  if (availability) await SurferAvailability.create({ userId: user.id, ...availability });
  return user;
}

before(async () => {
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());
  const email = testEmail('public-viewer');
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

beforeEach(() => {
  mock.method(clock, 'now', () => NOW);
});

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('public profile availability', () => {
  test('no availability record → availability null', async () => {
    const user = await surfer(null);
    const response = await viewProfile(user.id);
    assert.equal(response.status, 200);
    assert.equal(response.body.profile.availability, null);
  });

  test('Active with a preferred spot: status, spot (id, name, area), no arrival', async () => {
    const user = await surfer({ status: 'active', spotId: CARCAVELOS, expiresAt: later(13 * HOUR) });
    const { availability } = (await viewProfile(user.id)).body.profile;
    assert.deepEqual(availability, {
      status: 'ACTIVE',
      spot: { id: CARCAVELOS, name: 'Praia de Carcavelos', area: 'Carcavelos' },
      arrival: null,
    });
  });

  test('Active without a spot', async () => {
    const user = await surfer({ status: 'active', expiresAt: later(13 * HOUR) });
    assert.deepEqual((await viewProfile(user.id)).body.profile.availability, { status: 'ACTIVE', spot: null, arrival: null });
  });

  test('Coming Soon, relative: the stored estimated arrival only', async () => {
    const user = await surfer({
      status: 'coming_soon',
      spotId: GUINCHO,
      arrivalType: 'relative',
      arrivalOffsetMinutes: 60,
      arrivalAt: later(HOUR),
      expiresAt: later(2 * HOUR),
    });
    const { availability } = (await viewProfile(user.id)).body.profile;
    assert.deepEqual(Object.keys(availability).sort(), AVAILABILITY_KEYS);
    assert.equal(availability.status, 'COMING_SOON');
    assert.equal(availability.spot.id, GUINCHO);
    assert.deepEqual(availability.arrival, { type: 'relative', arrivesAt: later(HOUR).toISOString() });
  });

  test('Coming Soon, window: start and end only', async () => {
    const user = await surfer({
      status: 'coming_soon',
      spotId: GUINCHO,
      arrivalType: 'window',
      windowStartsAt: new Date('2030-07-15T12:00:00Z'),
      windowEndsAt: new Date('2030-07-15T14:00:00Z'),
      expiresAt: new Date('2030-07-15T15:00:00Z'),
    });
    assert.deepEqual((await viewProfile(user.id)).body.profile.availability.arrival, {
      type: 'window',
      startsAt: '2030-07-15T12:00:00.000Z',
      endsAt: '2030-07-15T14:00:00.000Z',
    });
  });

  test('At the Spot', async () => {
    const user = await surfer({ status: 'at_spot', spotId: GUINCHO, expiresAt: later(3 * HOUR) });
    const { availability } = (await viewProfile(user.id)).body.profile;
    assert.equal(availability.status, 'AT_SPOT');
    assert.equal(availability.spot.name, 'Praia do Guincho');
    assert.equal(availability.arrival, null);
  });

  test('Off → null', async () => {
    const user = await surfer({ status: 'off' });
    assert.equal((await viewProfile(user.id)).body.profile.availability, null);
  });

  test('expired → null, also exactly at the expiry time', async () => {
    const user = await surfer({ status: 'at_spot', spotId: GUINCHO, expiresAt: later(HOUR) });
    mock.method(clock, 'now', () => new Date(later(HOUR).getTime() - 1));
    assert.equal((await viewProfile(user.id)).body.profile.availability.status, 'AT_SPOT');
    mock.method(clock, 'now', () => later(HOUR));
    assert.equal((await viewProfile(user.id)).body.profile.availability, null);
    mock.method(clock, 'now', () => later(2 * HOUR));
    assert.equal((await viewProfile(user.id)).body.profile.availability, null);
  });

  test('no private or internal availability data', async () => {
    const user = await surfer({
      status: 'coming_soon',
      spotId: GUINCHO,
      arrivalType: 'relative',
      arrivalOffsetMinutes: 120,
      arrivalAt: later(2 * HOUR),
      expiresAt: later(3 * HOUR),
    });
    const response = await viewProfile(user.id);
    for (const hidden of ['expiresAt', 'expires_at', later(3 * HOUR).toISOString(), 'arrivalOffsetMinutes', 'minutes', 'startHour', 'updatedAt', 'createdAt', 'avatarPublicId', 'private-public-id', 'not-a-real-hash', '@sesh-test.invalid']) {
      assert.ok(!response.text.includes(hidden), hidden);
    }
  });

  test('the own profile (/profile/me) is unchanged: no availability field', async () => {
    const response = await call('/api/v1/profile/me', { cookie: viewer.token });
    assert.equal(response.status, 200);
    assert.ok(!('availability' in response.body.profile));
  });
});
