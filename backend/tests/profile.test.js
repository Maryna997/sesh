// API tests for surfer profiles, profile completion and surf spots.
//
// Like the auth tests, these use the test database (TEST_DATABASE_URL, or
// DATABASE_URL when that isn't set) and only create @sesh-test.invalid
// accounts. Deleting those accounts afterwards also deletes their profiles
// and favourite spots (ON DELETE CASCADE). Surf spots are read-only here.
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { once } from 'node:events';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sequelize } from '../src/db/index.js';
import { FavoriteSpot, SurferProfile } from '../src/models/index.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { requireCompletedProfile } from '../src/middleware/requireCompletedProfile.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';
const AUTH_REQUIRED = { status: 'error', message: 'Authentication required.' };
const CARCAVELOS = 'pt-cascais-carcavelos';
const GUINCHO = 'pt-cascais-guincho';
const SUPERTUBOS = 'pt-peniche-supertubos';
const PRAIA_GRANDE = 'pt-sintra-praia-grande';
const VALID_PROFILE = { displayName: 'Kai Silva', skillLevel: 'intermediate' };
const OWN_PROFILE_KEYS = ['about', 'avatarUrl', 'boardType', 'createdAt', 'displayName', 'favoriteSpots', 'skillLevel', 'updatedAt', 'userId'];
const PUBLIC_PROFILE_KEYS = ['about', 'avatarUrl', 'boardType', 'displayName', 'favoriteSpots', 'skillLevel', 'userId'];

let server;
let baseUrl;
const call = (path, options) => request(baseUrl, path, options);

// A registered, signed-in test user: { id, email, token }
async function signedInUser(name) {
  const email = testEmail(name);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(registered.status, 201, `register ${email}`);
  const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(loggedIn.status, 200, `login ${email}`);
  return { id: registered.body.user.id, email, token: sessionToken(loggedIn) };
}

const getMine = (user) => call('/api/v1/profile/me', { cookie: user?.token });
const putMine = (user, body, options = {}) =>
  call('/api/v1/profile/me', { method: 'PUT', cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body, ...options });
const getPublic = (viewer, userId) => call(`/api/v1/profiles/${userId}`, { cookie: viewer?.token });
const authMe = (user) => call('/api/v1/auth/me', { cookie: user.token });
const profileCount = (userId) => SurferProfile.count({ where: { userId } });

before(async () => {
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());
});

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('profile creation', () => {
  test('registration and login do not create a profile', async () => {
    const user = await signedInUser('no-auto-profile');
    assert.equal(await profileCount(user.id), 0);

    const me = await authMe(user);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, user.id);
  });

  test('GET /profile/me without a profile returns profile: null and creates nothing', async () => {
    const user = await signedInUser('get-none');
    const response = await getMine(user);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { profile: null });
    assert.equal(await profileCount(user.id), 0);
  });

  test('the first valid submission creates exactly one profile (201)', async () => {
    const user = await signedInUser('create');
    const response = await putMine(user, {
      ...VALID_PROFILE,
      boardType: 'fish',
      about: 'Dawn patrol fan.',
      favoriteSpotIds: [GUINCHO, CARCAVELOS],
    });

    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body), ['profile']);
    const { profile } = response.body;
    assert.deepEqual(Object.keys(profile).sort(), OWN_PROFILE_KEYS);
    assert.equal(profile.userId, user.id);
    assert.equal(profile.displayName, 'Kai Silva');
    assert.equal(profile.skillLevel, 'intermediate');
    assert.equal(profile.boardType, 'fish');
    assert.equal(profile.about, 'Dawn patrol fan.');
    assert.equal(profile.avatarUrl, null);
    // Spots come back with their details, alphabetically
    assert.deepEqual(profile.favoriteSpots.map((spot) => spot.id), [CARCAVELOS, GUINCHO]);
    assert.deepEqual(Object.keys(profile.favoriteSpots[0]).sort(), ['area', 'country', 'id', 'kind', 'municipality', 'name', 'region']);

    assert.equal(await profileCount(user.id), 1);
    assert.equal(await FavoriteSpot.count({ where: { userId: user.id } }), 2);
  });

  test('only the mandatory fields are needed; optional fields stay empty', async () => {
    const user = await signedInUser('minimal');
    const response = await putMine(user, VALID_PROFILE);

    assert.equal(response.status, 201);
    assert.equal(response.body.profile.boardType, null);
    assert.equal(response.body.profile.about, null);
    assert.deepEqual(response.body.profile.favoriteSpots, []);
  });

  test('incomplete or invalid first submissions create nothing', async () => {
    const user = await signedInUser('incomplete');

    const cases = [
      [{}, ['displayName', 'skillLevel']],
      [{ displayName: 'Kai' }, ['skillLevel']],
      [{ skillLevel: 'beginner' }, ['displayName']],
      [{ ...VALID_PROFILE, displayName: '   ' }, ['displayName']],
      [{ ...VALID_PROFILE, skillLevel: 'pro' }, ['skillLevel']],
      [{ ...VALID_PROFILE, boardType: 'surfboard' }, ['boardType']],
      [{ ...VALID_PROFILE, about: 'a'.repeat(501) }, ['about']],
      [{ ...VALID_PROFILE, avatarUrl: 'https://example.com/me.jpg' }, ['avatarUrl']],
      [{ ...VALID_PROFILE, avatarPublicId: 'sesh/avatars/someone' }, ['avatarPublicId']],
      // Valid fields but an unknown spot: the profile is not created either
      [{ ...VALID_PROFILE, favoriteSpotIds: [CARCAVELOS, 'pt-nowhere'] }, ['favoriteSpotIds']],
    ];

    for (const [body, fields] of cases) {
      const response = await putMine(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.message, 'Please check the profile details.');
      assert.deepEqual(Object.keys(response.body.errors).sort(), fields, JSON.stringify(body));
    }

    assert.equal(await profileCount(user.id), 0);
    assert.equal(await FavoriteSpot.count({ where: { userId: user.id } }), 0);
  });

  test('repeated submissions update the same profile (200), never a duplicate', async () => {
    const user = await signedInUser('repeat');
    assert.equal((await putMine(user, VALID_PROFILE)).status, 201);
    const first = await SurferProfile.findByPk(user.id);

    const second = await putMine(user, { ...VALID_PROFILE, displayName: 'Kai S.' });
    const third = await putMine(user, VALID_PROFILE);

    assert.equal(second.status, 200);
    assert.equal(third.status, 200);
    assert.equal(await profileCount(user.id), 1);
    assert.equal(third.body.profile.createdAt, first.createdAt.toISOString());
  });

  test('concurrent first submissions create exactly one profile', async () => {
    const user = await signedInUser('race');
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, i) => putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [i % 2 ? CARCAVELOS : GUINCHO] })),
    );

    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 201], `statuses ${statuses}`);
    assert.equal(await profileCount(user.id), 1);
    assert.equal(await FavoriteSpot.count({ where: { userId: user.id } }), 1);
  });
});

describe('profile retrieval and updates', () => {
  test('GET /profile/me returns the own profile', async () => {
    const user = await signedInUser('get-own');
    await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [SUPERTUBOS] });

    const response = await getMine(user);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.profile).sort(), OWN_PROFILE_KEYS);
    assert.equal(response.body.profile.displayName, 'Kai Silva');
    assert.equal(response.body.profile.favoriteSpots[0].name, 'Supertubos');
  });

  test('partial update: omitted fields keep their values', async () => {
    const user = await signedInUser('partial');
    await putMine(user, { ...VALID_PROFILE, boardType: 'longboard', about: 'Hi', favoriteSpotIds: [CARCAVELOS] });

    const response = await putMine(user, { skillLevel: 'advanced' });
    assert.equal(response.status, 200);
    const { profile } = response.body;
    assert.equal(profile.skillLevel, 'advanced');
    assert.equal(profile.displayName, 'Kai Silva');
    assert.equal(profile.boardType, 'longboard');
    assert.equal(profile.about, 'Hi');
    assert.deepEqual(profile.favoriteSpots.map((spot) => spot.id), [CARCAVELOS]);
  });

  test('optional fields are cleared with null or []', async () => {
    const user = await signedInUser('clear');
    await putMine(user, { ...VALID_PROFILE, boardType: 'gun', about: 'Big waves', favoriteSpotIds: [CARCAVELOS] });

    const response = await putMine(user, { boardType: null, about: null, favoriteSpotIds: [] });
    assert.equal(response.status, 200);
    assert.equal(response.body.profile.boardType, null);
    assert.equal(response.body.profile.about, null);
    assert.deepEqual(response.body.profile.favoriteSpots, []);
    assert.equal(response.body.profile.displayName, 'Kai Silva');
  });

  test('favourite spots are replaced as a whole', async () => {
    const user = await signedInUser('replace-spots');
    await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [CARCAVELOS, GUINCHO] });

    const response = await putMine(user, { favoriteSpotIds: [SUPERTUBOS] });
    assert.deepEqual(response.body.profile.favoriteSpots.map((spot) => spot.id), [SUPERTUBOS]);
    assert.equal(await FavoriteSpot.count({ where: { userId: user.id } }), 1);
  });

  test('required fields cannot be cleared; a failed update changes nothing', async () => {
    const user = await signedInUser('no-clear');
    await putMine(user, { ...VALID_PROFILE, about: 'Before', favoriteSpotIds: [CARCAVELOS] });

    for (const body of [
      { displayName: null },
      { displayName: '' },
      { skillLevel: null },
      { skillLevel: '' },
      // A valid change together with an invalid one: neither is applied
      { about: 'After', favoriteSpotIds: ['pt-nowhere'] },
    ]) {
      const response = await putMine(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }

    const { profile } = (await getMine(user)).body;
    assert.equal(profile.displayName, 'Kai Silva');
    assert.equal(profile.skillLevel, 'intermediate');
    assert.equal(profile.about, 'Before');
    assert.deepEqual(profile.favoriteSpots.map((spot) => spot.id), [CARCAVELOS]);
  });

  test('duplicate favourite spots are rejected', async () => {
    const user = await signedInUser('dup-spots');
    const response = await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [CARCAVELOS, CARCAVELOS] });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors.favoriteSpotIds, 'Each surf spot can only be added once.');
  });

  test('another user\'s public profile, without private data', async () => {
    const owner = await signedInUser('public-owner');
    const viewer = await signedInUser('public-viewer');
    await putMine(owner, { ...VALID_PROFILE, about: 'Say hi!', favoriteSpotIds: [CARCAVELOS] });
    await putMine(viewer, VALID_PROFILE);

    const response = await getPublic(viewer, owner.id);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.profile).sort(), PUBLIC_PROFILE_KEYS);
    assert.equal(response.body.profile.userId, owner.id);
    assert.equal(response.body.profile.about, 'Say hi!');
    assert.ok(!response.text.includes(owner.email), 'no email');
    assert.ok(!/password|session|\$2[aby]\$/i.test(response.text), 'no password hash or session data');
  });

  test('public profile: users without a profile and unknown ids get the same 404', async () => {
    const viewer = await signedInUser('lookup-viewer');
    await putMine(viewer, VALID_PROFILE);
    const noProfile = await signedInUser('lookup-none');
    const notFound = { status: 'error', message: 'Surfer profile not found.' };

    for (const id of [noProfile.id, '00000000-0000-4000-8000-000000000000', 'not-a-uuid', "1' OR '1'='1"]) {
      const response = await getPublic(viewer, encodeURIComponent(id));
      assert.equal(response.status, 404, id);
      assert.deepEqual(response.body, notFound);
    }
  });
});

describe('security', () => {
  test('profile endpoints require authentication', async () => {
    const someone = await signedInUser('anon-target');
    for (const response of [
      await getMine(undefined),
      await putMine(undefined, VALID_PROFILE),
      await putMine({ token: 'garbage' }, VALID_PROFILE),
      await getPublic(undefined, someone.id),
    ]) {
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, AUTH_REQUIRED);
    }
    assert.equal(await profileCount(someone.id), 0);
  });

  test('a client-sent userId cannot target another user\'s profile', async () => {
    const victim = await signedInUser('victim');
    const attacker = await signedInUser('attacker');
    await putMine(victim, { displayName: 'Victim', skillLevel: 'advanced' });

    const response = await putMine(attacker, { userId: victim.id, displayName: 'Hacked', skillLevel: 'beginner' });
    assert.equal(response.status, 201);
    assert.equal(response.body.profile.userId, attacker.id);

    const victimProfile = await SurferProfile.findByPk(victim.id);
    assert.equal(victimProfile.displayName, 'Victim');
  });

  test('PUT from an untrusted origin is rejected (CSRF) and changes nothing', async () => {
    const user = await signedInUser('csrf');
    const response = await putMine(user, VALID_PROFILE, { origin: 'https://evil.example' });
    assert.equal(response.status, 403);
    assert.equal(await profileCount(user.id), 0);
  });

  test('hasCompletedProfile cannot be set by the client', async () => {
    const user = await signedInUser('no-override');
    await putMine(user, { hasCompletedProfile: true });
    assert.equal((await authMe(user)).body.hasCompletedProfile, false);
    assert.equal(await profileCount(user.id), 0);
  });
});

describe('profile completion (GET /api/v1/auth/me)', () => {
  test('false without a profile, true after creating one', async () => {
    const user = await signedInUser('completion');

    const before = await authMe(user);
    assert.equal(before.status, 200);
    assert.equal(before.body.hasCompletedProfile, false);
    // The user object itself is unchanged
    assert.deepEqual(Object.keys(before.body.user).sort(), ['createdAt', 'email', 'id']);
    // No profile details leak into the auth response
    assert.deepEqual(Object.keys(before.body).sort(), ['hasCompletedProfile', 'user']);

    await putMine(user, VALID_PROFILE);
    assert.equal((await authMe(user)).body.hasCompletedProfile, true);

    // Still true after an update
    await putMine(user, { about: 'Updated' });
    assert.equal((await authMe(user)).body.hasCompletedProfile, true);
  });

  test('session restoration works with and without a profile', async () => {
    const withProfile = await signedInUser('restore-with');
    const without = await signedInUser('restore-without');
    await putMine(withProfile, VALID_PROFILE);

    // A fresh request with only the cookie, as after a page reload
    const a = await authMe(withProfile);
    const b = await authMe(without);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.hasCompletedProfile, true);
    assert.equal(b.body.hasCompletedProfile, false);
  });

  test('auth endpoints work without a profile', async () => {
    const user = await signedInUser('auth-no-profile');
    assert.equal((await authMe(user)).status, 200);

    const logout = await call('/api/v1/auth/logout', { method: 'POST', cookie: user.token, origin: TEST_CLIENT_ORIGIN });
    assert.equal(logout.status, 200);
    assert.equal((await authMe(user)).status, 401);

    const again = await call('/api/v1/auth/login', { method: 'POST', body: { email: user.email, password: PASSWORD } });
    assert.equal(again.status, 200);
    assert.deepEqual(Object.keys(again.body), ['user'], 'login response unchanged');
    assert.equal(await profileCount(user.id), 0);
  });
});

describe('requireCompletedProfile middleware', () => {
  // A small app with one route protected the way future features will be
  // (no placeholder route is added to the real API)
  let guardedUrl;
  let guardedServer;

  before(async () => {
    const guarded = express();
    guarded.get('/needs-profile', requireAuth, requireCompletedProfile, (req, res) => res.json({ ok: true }));
    guarded.use(errorHandler);
    guardedServer = guarded.listen(0);
    await once(guardedServer, 'listening');
    guardedUrl = `http://127.0.0.1:${guardedServer.address().port}`;
  });

  after(() => guardedServer.close());

  const callGuarded = (user) => request(guardedUrl, '/needs-profile', { cookie: user?.token });

  test('rejects users without a profile with PROFILE_REQUIRED', async () => {
    const user = await signedInUser('guard-none');
    const response = await callGuarded(user);
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      status: 'error',
      code: 'PROFILE_REQUIRED',
      message: 'Complete your surfer profile to use this feature.',
    });
    assert.equal(await profileCount(user.id), 0);
  });

  test('lets users with a completed profile through', async () => {
    const user = await signedInUser('guard-ok');
    await putMine(user, VALID_PROFILE);
    const response = await callGuarded(user);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
  });

  test('checks authentication first', async () => {
    const response = await callGuarded(undefined);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, AUTH_REQUIRED);
  });
});

describe('favourite spots limit (at most 3)', () => {
  const SPOTS = [CARCAVELOS, GUINCHO, SUPERTUBOS, PRAIA_GRANDE];
  const savedSpotIds = async (user) => (await getMine(user)).body.profile.favoriteSpots.map((spot) => spot.id).sort();

  test('0, 1, 2 or 3 favourite spots are accepted', async () => {
    const user = await signedInUser('spots-ok');
    assert.equal((await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [] })).status, 201);

    for (const count of [1, 2, 3, 0]) {
      const ids = SPOTS.slice(0, count);
      const response = await putMine(user, { favoriteSpotIds: ids });
      assert.equal(response.status, 200, `${count} spots`);
      assert.deepEqual(await savedSpotIds(user), [...ids].sort());
      assert.equal(await FavoriteSpot.count({ where: { userId: user.id } }), count);
    }
  });

  test('4 favourite spots are rejected and change nothing', async () => {
    const user = await signedInUser('spots-four');

    // Not on creation...
    const create = await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: SPOTS });
    assert.equal(create.status, 400);
    assert.equal(create.body.errors.favoriteSpotIds, 'Choose a maximum of 3 favorite spots.');
    assert.equal(await profileCount(user.id), 0);

    // ...nor on update
    await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [CARCAVELOS] });
    const update = await putMine(user, { about: 'Changed', favoriteSpotIds: SPOTS });
    assert.equal(update.status, 400);
    assert.equal(update.body.errors.favoriteSpotIds, 'Choose a maximum of 3 favorite spots.');
    assert.deepEqual(await savedSpotIds(user), [CARCAVELOS]);
    assert.equal((await getMine(user)).body.profile.about, null);
  });

  test('duplicate or unknown spots in an update leave the saved spots unchanged', async () => {
    const user = await signedInUser('spots-invalid');
    await putMine(user, { ...VALID_PROFILE, favoriteSpotIds: [CARCAVELOS, GUINCHO] });

    for (const ids of [[SUPERTUBOS, SUPERTUBOS], [SUPERTUBOS, 'pt-nowhere']]) {
      const response = await putMine(user, { favoriteSpotIds: ids });
      assert.equal(response.status, 400, JSON.stringify(ids));
    }
    assert.deepEqual(await savedSpotIds(user), [CARCAVELOS, GUINCHO]);
  });
});

describe('editing mandatory fields', () => {
  test('display name can be changed to another valid value (normalized)', async () => {
    const user = await signedInUser('rename');
    await putMine(user, VALID_PROFILE);

    const response = await putMine(user, { displayName: '  Kai   Dawn Patrol  Silva ' });
    assert.equal(response.status, 200);
    assert.equal(response.body.profile.displayName, 'Kai Dawn Patrol Silva');
    assert.equal(response.body.profile.skillLevel, 'intermediate');
  });

  test('skill level can move up and down between all levels', async () => {
    const user = await signedInUser('level-change');
    await putMine(user, { ...VALID_PROFILE, skillLevel: 'beginner' });

    for (const level of ['intermediate', 'advanced', 'beginner', 'advanced', 'intermediate']) {
      const response = await putMine(user, { skillLevel: level });
      assert.equal(response.status, 200, level);
      assert.equal(response.body.profile.skillLevel, level);
    }
    assert.equal((await authMe(user)).body.hasCompletedProfile, true);
  });

  test('invalid display names and skill levels are rejected and keep the saved values', async () => {
    const user = await signedInUser('mandatory-invalid');
    await putMine(user, VALID_PROFILE);

    const cases = [
      [{ displayName: '' }, 'displayName'],
      [{ displayName: '   ' }, 'displayName'],
      [{ displayName: null }, 'displayName'],
      [{ displayName: 'a'.repeat(51) }, 'displayName'],
      [{ displayName: 42 }, 'displayName'],
      [{ skillLevel: '' }, 'skillLevel'],
      [{ skillLevel: null }, 'skillLevel'],
      [{ skillLevel: 'pro' }, 'skillLevel'],
      [{ skillLevel: 'Advanced' }, 'skillLevel'],
    ];
    for (const [body, field] of cases) {
      const response = await putMine(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(Object.keys(response.body.errors), [field], JSON.stringify(body));
    }

    const saved = await SurferProfile.findByPk(user.id);
    assert.equal(saved.displayName, 'Kai Silva');
    assert.equal(saved.skillLevel, 'intermediate');
  });
});

describe('profile access (GET /api/v1/profiles/:userId)', () => {
  test('viewers with a completed profile can see other surfers', async () => {
    const owner = await signedInUser('access-owner');
    const viewer = await signedInUser('access-viewer');
    await putMine(owner, VALID_PROFILE);
    await putMine(viewer, { displayName: 'Viewer', skillLevel: 'beginner' });

    const response = await getPublic(viewer, owner.id);
    assert.equal(response.status, 200);
    assert.equal(response.body.profile.userId, owner.id);
  });

  test('viewers without a profile get 403 PROFILE_REQUIRED, even for unknown ids', async () => {
    const owner = await signedInUser('access-owner-2');
    const viewer = await signedInUser('access-no-profile');
    await putMine(owner, VALID_PROFILE);

    for (const id of [owner.id, '00000000-0000-4000-8000-000000000000']) {
      const response = await getPublic(viewer, id);
      assert.equal(response.status, 403, id);
      assert.deepEqual(response.body, {
        status: 'error',
        code: 'PROFILE_REQUIRED',
        message: 'Complete your surfer profile to use this feature.',
      });
    }
  });

  test('unauthenticated requests get the usual 401', async () => {
    const owner = await signedInUser('access-owner-3');
    await putMine(owner, VALID_PROFILE);
    const response = await getPublic(undefined, owner.id);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, AUTH_REQUIRED);
  });

  test('users without a profile can still use /profile/me to create one', async () => {
    const user = await signedInUser('access-onboarding');
    assert.equal((await getMine(user)).status, 200);
    assert.equal((await putMine(user, VALID_PROFILE)).status, 201);
    assert.equal((await getMine(user)).body.profile.displayName, 'Kai Silva');
  });
});

describe('avatar fields (prepared for Cloudinary uploads)', () => {
  test('profiles are created without an avatar; both avatar columns stay NULL', async () => {
    const user = await signedInUser('avatar-none');
    const response = await putMine(user, VALID_PROFILE);
    assert.equal(response.status, 201);
    assert.equal(response.body.profile.avatarUrl, null);

    const saved = await SurferProfile.findByPk(user.id);
    assert.equal(saved.avatarUrl, null);
    assert.equal(saved.avatarPublicId, null);
  });

  test('clients cannot set avatarUrl or avatarPublicId', async () => {
    const user = await signedInUser('avatar-set');
    await putMine(user, VALID_PROFILE);

    for (const body of [
      { avatarUrl: 'https://res.cloudinary.com/demo/image/upload/me.jpg' },
      { avatarPublicId: 'sesh/avatars/someone-else' },
      { about: 'With avatar', avatarUrl: 'https://example.com/me.jpg', avatarPublicId: 'x' },
    ]) {
      const response = await putMine(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.message, 'Please check the profile details.');
      for (const field of ['avatarUrl', 'avatarPublicId'].filter((name) => name in body)) {
        assert.equal(response.body.errors[field], 'Profile picture uploads are not available yet.');
      }
    }

    const saved = await SurferProfile.findByPk(user.id);
    assert.equal(saved.avatarUrl, null);
    assert.equal(saved.avatarPublicId, null);
    assert.equal(saved.about, null);
  });

  test('avatarPublicId is never included in profile responses', async () => {
    const owner = await signedInUser('avatar-hidden');
    const viewer = await signedInUser('avatar-viewer');
    await putMine(owner, VALID_PROFILE);
    await putMine(viewer, VALID_PROFILE);

    // Simulate a future upload (only the backend writes these fields)
    const publicId = 'sesh/avatars/hidden-id';
    await SurferProfile.update(
      { avatarUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sesh/avatars/photo.jpg', avatarPublicId: publicId },
      { where: { userId: owner.id } },
    );

    for (const response of [await getMine(owner), await getPublic(viewer, owner.id)]) {
      assert.equal(response.status, 200);
      assert.ok(!('avatarPublicId' in response.body.profile));
      assert.ok(!response.text.includes(publicId), 'public id not in the response');
      assert.match(response.body.profile.avatarUrl, /^https:\/\/res\.cloudinary\.com\//);
    }
    assert.equal((await authMe(owner)).body.hasCompletedProfile, true);
  });
});

describe('GET /api/v1/surf-spots', () => {
  test('lists the seeded spots with their details, without coordinates', async () => {
    const response = await call('/api/v1/surf-spots');
    assert.equal(response.status, 200);
    assert.ok(response.body.spots.length >= 29);
    const carcavelos = response.body.spots.find((spot) => spot.id === CARCAVELOS);
    assert.deepEqual(carcavelos, {
      id: CARCAVELOS,
      name: 'Praia de Carcavelos',
      kind: 'beach',
      area: 'Carcavelos',
      municipality: 'Cascais',
      region: 'Lisbon',
      country: 'Portugal',
    });
  });
});
