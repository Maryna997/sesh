// API tests for account settings: PUT /api/v1/account/email,
// PUT /api/v1/account/password and DELETE /api/v1/account.
//
// Real database (accounts under @sesh-test.invalid only, removed afterwards;
// run against the isolated TEST_DATABASE_URL). Cloudinary is never called:
// avatarStorage is mocked.
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { Conversation, Message, Session, SurferAvailability, SurferProfile, User } from '../src/models/index.js';
import { avatarStorage } from '../src/services/avatarStorage.js';
import { clock } from '../src/utils/clock.js';
import { deleteTestUsers, request, sessionSetCookie, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'new wave every morning';
const CARCAVELOS = 'pt-cascais-carcavelos';
const GUINCHO = 'pt-cascais-guincho';

let server;
let baseUrl;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);
const send = (user, method, path, body, options = {}) =>
  call(path, { method, cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body, ...options });

const changeEmail = (user, body, options) => send(user, 'PUT', '/api/v1/account/email', body, options);
const changePassword = (user, body, options) => send(user, 'PUT', '/api/v1/account/password', body, options);
const deleteAccount = (user, body = { confirmation: 'DELETE' }, options) => send(user, 'DELETE', '/api/v1/account', body, options);
const login = (email, password) => call('/api/v1/auth/login', { method: 'POST', body: { email, password } });
const me = (token) => call('/api/v1/auth/me', { cookie: token });

async function signedInUser(name, { withProfile = false } = {}) {
  counter += 1;
  const email = testEmail(`${name}-${counter}`);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(registered.status, 201);
  const loggedIn = await login(email, PASSWORD);
  const user = { id: registered.body.user.id, email, token: sessionToken(loggedIn) };
  if (withProfile) {
    const created = await send(user, 'PUT', '/api/v1/profile/me', {
      displayName: `Surfer ${counter}`,
      skillLevel: 'intermediate',
      favoriteSpotIds: [CARCAVELOS, GUINCHO],
    });
    assert.equal(created.status, 201);
  }
  return user;
}

before(async () => {
  await sequelize.authenticate();
  ({ server, baseUrl } = await startServer());
});

afterEach(() => mock.restoreAll());

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

// ---------- Email ----------

describe('PUT /api/v1/account/email', () => {
  test('changes the email at once (normalized); the session stays; login works only with the new email', async () => {
    const user = await signedInUser('email-ok');
    const newEmail = testEmail(`moved-${counter}`);
    const response = await changeEmail(user, { newEmail: `  ${newEmail.toUpperCase()} ` });

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.user).sort(), ['createdAt', 'email', 'id']);
    assert.equal(response.body.user.email, newEmail);
    assert.equal(response.body.user.id, user.id);
    assert.ok(!response.text.includes('passwordHash') && !response.text.includes('$2'));

    assert.equal((await me(user.token)).body.user.email, newEmail); // same session
    assert.equal((await login(user.email, PASSWORD)).status, 401);
    assert.equal((await login(newEmail, PASSWORD)).status, 200);
  });

  test('invalid or missing email: 400 with the registration messages', async () => {
    const user = await signedInUser('email-invalid');
    for (const [body, message] of [
      [{ newEmail: 'not-an-email' }, 'Enter a valid email address, like you@example.com.'],
      [{ newEmail: '   ' }, 'Email is required.'],
      [{}, 'Email is required.'],
      [{ newEmail: 42 }, 'Email must be a string.'],
      [{ newEmail: `${'a'.repeat(250)}@x.io` }, 'Email must be at most 254 characters.'],
    ]) {
      const response = await changeEmail(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.errors.newEmail, message);
    }
    assert.equal((await changeEmail(user, ['x'])).status, 400);
    assert.equal((await me(user.token)).body.user.email, user.email);
  });

  test('an email used by another account (any letter case): 409', async () => {
    const user = await signedInUser('email-dup-a');
    const other = await signedInUser('email-dup-b');
    const response = await changeEmail(user, { newEmail: other.email.toUpperCase() });
    assert.equal(response.status, 409);
    assert.equal(response.body.errors.newEmail, 'An account with this email already exists.');
    assert.equal((await me(user.token)).body.user.email, user.email);
  });

  test('the same email: 400', async () => {
    const user = await signedInUser('email-same');
    const response = await changeEmail(user, { newEmail: user.email.toUpperCase() });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors.newEmail, 'This is already your email address.');
  });

  test('two accounts claiming one new email at the same time: one 200, one 409', async () => {
    const first = await signedInUser('email-race-a');
    const second = await signedInUser('email-race-b');
    const target = testEmail(`race-target-${counter}`);
    const results = await Promise.all([changeEmail(first, { newEmail: target }), changeEmail(second, { newEmail: target })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(await User.count({ where: { email: target } }), 1);
  });

  test('a user id in the body is ignored: only the signed-in account changes', async () => {
    const user = await signedInUser('email-id-a');
    const other = await signedInUser('email-id-b');
    const newEmail = testEmail(`id-ignored-${counter}`);
    const response = await changeEmail(user, { newEmail, id: other.id, userId: other.id });
    assert.equal(response.status, 200);
    assert.equal(response.body.user.id, user.id);
    assert.equal((await User.findByPk(other.id)).email, other.email);
  });

  test('not signed in: 401; another website (Origin): 403', async () => {
    const user = await signedInUser('email-guards');
    assert.equal((await changeEmail(null, { newEmail: testEmail('x') })).status, 401);
    const crossSite = await changeEmail(user, { newEmail: testEmail(`csrf-${counter}`) }, { origin: 'https://evil.example' });
    assert.equal(crossSite.status, 403);
    assert.equal((await me(user.token)).body.user.email, user.email);
  });
});

// ---------- Password ----------

describe('PUT /api/v1/account/password', () => {
  test('changes the password; this browser stays signed in with a fresh session; other sessions end', async () => {
    const user = await signedInUser('pw-ok');
    const otherDevice = sessionToken(await login(user.email, PASSWORD));
    const response = await changePassword(user, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', message: 'Password updated.' });
    assert.ok(!response.text.includes(NEW_PASSWORD) && !response.text.includes('$2'));

    // The new cookie works; the old tokens (this browser's and another device's) don't
    const cookie = sessionSetCookie(response);
    assert.match(cookie, /HttpOnly/i);
    const fresh = sessionToken(response);
    assert.equal((await me(fresh)).status, 200);
    assert.equal((await me(user.token)).status, 401);
    assert.equal((await me(otherDevice)).status, 401);
    assert.equal(await Session.count({ where: { userId: user.id } }), 1);

    // Stored as a new bcrypt hash; old password refused, new one accepted
    const stored = await User.findByPk(user.id);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
    assert.notEqual(stored.passwordHash, NEW_PASSWORD);
    assert.equal((await login(user.email, PASSWORD)).status, 401);
    assert.equal((await login(user.email, NEW_PASSWORD)).status, 200);
  });

  test('wrong current password: 400 field error (not 401), nothing changes, session kept', async () => {
    const user = await signedInUser('pw-wrong');
    const response = await changePassword(user, { currentPassword: 'not my password', newPassword: NEW_PASSWORD });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors.currentPassword, 'Your current password is incorrect.');
    assert.equal(sessionSetCookie(response), undefined);
    assert.equal((await me(user.token)).status, 200);
    assert.equal((await login(user.email, PASSWORD)).status, 200);
  });

  test('new password breaking the registration rules, or missing fields: 400', async () => {
    const user = await signedInUser('pw-rules');
    const cases = [
      [{ currentPassword: PASSWORD, newPassword: 'short' }, 'newPassword', 'Password must be at least 8 characters.'],
      [{ currentPassword: PASSWORD, newPassword: 'é'.repeat(40) }, 'newPassword', /too long/],
      [{ currentPassword: PASSWORD }, 'newPassword', 'Password is required.'],
      [{ newPassword: NEW_PASSWORD }, 'currentPassword', 'Enter your current password.'],
      [{ currentPassword: 1234, newPassword: NEW_PASSWORD }, 'currentPassword', 'Password must be a string.'],
    ];
    for (const [body, field, message] of cases) {
      const response = await changePassword(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      if (message instanceof RegExp) assert.match(response.body.errors[field], message);
      else assert.equal(response.body.errors[field], message);
    }
    assert.equal((await login(user.email, PASSWORD)).status, 200);
  });

  test('the same password (also after Unicode normalization): 400', async () => {
    const user = await signedInUser('pw-same');
    const response = await changePassword(user, { currentPassword: PASSWORD, newPassword: PASSWORD });
    assert.equal(response.status, 400);
    assert.equal(response.body.errors.newPassword, 'Choose a password different from your current one.');
  });

  test('not signed in: 401; another website (Origin): 403', async () => {
    const user = await signedInUser('pw-guards');
    assert.equal((await changePassword(null, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status, 401);
    const crossSite = await changePassword(user, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, { origin: 'https://evil.example' });
    assert.equal(crossSite.status, 403);
    assert.equal((await login(user.email, PASSWORD)).status, 200);
  });
});

// ---------- Delete account ----------

async function richUser(name) {
  const user = await signedInUser(name, { withProfile: true });
  mock.method(clock, 'now', () => new Date('2026-11-14T10:00:00.000Z'));
  const availability = await send(user, 'POST', '/api/v1/availability/me', { status: 'ACTIVE', spotId: CARCAVELOS });
  assert.equal(availability.status, 201);
  return user;
}

async function conversationBetween(a, b, texts = []) {
  const started = await send(a, 'POST', '/api/v1/conversations', { recipientUserId: b.id });
  const conversationId = started.body.conversation.id;
  for (const [sender, body] of texts) {
    const sent = await send(sender === 'a' ? a : b, 'POST', `/api/v1/conversations/${conversationId}/messages`, { body });
    assert.equal(sent.status, 201);
  }
  return conversationId;
}

const favoriteCount = (userId) =>
  sequelize.query('SELECT count(*)::int AS n FROM surfer_favorite_spots WHERE user_id = $1', { bind: [userId] }).then(([[row]]) => row.n);

describe('DELETE /api/v1/account', () => {
  test('deletes the account and its personal data; shared conversations stay for the other surfer, anonymised', async () => {
    const remove = mock.method(avatarStorage, 'remove', async () => {});
    const user = await richUser('del-ok');
    const friend = await richUser('del-friend');
    const bystander = await richUser('del-bystander');
    const shared = await conversationBetween(user, friend, [['a', 'Surf at 4?'], ['b', 'Yes!']]);
    const unrelated = await conversationBetween(friend, bystander, [['a', 'Hi'], ['b', 'Hey']]);
    const secondSession = sessionToken(await login(user.email, PASSWORD));

    const response = await deleteAccount(user);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', message: 'Account deleted.' });
    assert.match(sessionSetCookie(response), /sesh_session=;/); // cookie cleared
    assert.equal(remove.mock.callCount(), 0); // no profile picture

    // Gone: account, sessions, profile, favorite spots, availability
    assert.equal(await User.count({ where: { id: user.id } }), 0);
    assert.equal(await Session.count({ where: { userId: user.id } }), 0);
    assert.equal(await SurferProfile.count({ where: { userId: user.id } }), 0);
    assert.equal(await favoriteCount(user.id), 0);
    assert.equal(await SurferAvailability.count({ where: { userId: user.id } }), 0);
    // Kept: the shared conversation and both messages, without the deleted id anywhere
    const kept = await Conversation.findByPk(shared);
    assert.deepEqual([kept.userOneId, kept.userTwoId].filter(Boolean), [friend.id]);
    const messages = await Message.findAll({ where: { conversationId: shared }, order: [['createdAt', 'ASC']] });
    assert.deepEqual(messages.map((m) => [m.body, m.senderId]), [['Surf at 4?', null], ['Yes!', friend.id]]);
    const [[mentions]] = await sequelize.query(
      `SELECT (SELECT count(*) FROM conversations WHERE user_one_id = $1 OR user_two_id = $1)
            + (SELECT count(*) FROM messages WHERE sender_id = $1) AS n`,
      { bind: [user.id] },
    );
    assert.equal(Number(mentions.n), 0);

    // Kept: the other accounts, their profiles, spots, availability and their own conversation
    for (const other of [friend, bystander]) {
      assert.equal(await User.count({ where: { id: other.id } }), 1);
      assert.equal(await SurferProfile.count({ where: { userId: other.id } }), 1);
      assert.equal(await favoriteCount(other.id), 2);
      assert.equal(await SurferAvailability.count({ where: { userId: other.id } }), 1);
    }
    assert.equal(await Message.count({ where: { conversationId: unrelated } }), 2);

    // The account can't be used any more
    assert.equal((await me(user.token)).status, 401);
    assert.equal((await me(secondSession)).status, 401);
    assert.equal((await login(user.email, PASSWORD)).status, 401);
    const discover = await send(friend, 'GET', '/api/v1/discover', undefined);
    assert.equal(discover.status, 200);
    assert.ok(!discover.body.surfers.some((surfer) => surfer.userId === user.id));
    assert.equal((await send(friend, 'GET', `/api/v1/profiles/${user.id}`, undefined)).status, 404);
  });

  test('missing or wrong confirmation: 400 and nothing is deleted', async () => {
    const user = await signedInUser('del-confirm');
    const noBody = await send(user, 'DELETE', '/api/v1/account', undefined);
    assert.equal(noBody.status, 400);
    for (const body of [{}, { confirmation: 'delete' }, { confirmation: ' DELETE' }, { confirmation: 'DELETE ' }, { confirmation: true }, ['DELETE']]) {
      const response = await deleteAccount(user, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.errors.confirmation, 'Type DELETE to confirm.');
    }
    assert.equal(await User.count({ where: { id: user.id } }), 1);
  });

  test('a user id in the body is ignored: only the signed-in account is deleted', async () => {
    const user = await signedInUser('del-id-a');
    const other = await signedInUser('del-id-b');
    assert.equal((await deleteAccount(user, { confirmation: 'DELETE', userId: other.id, id: other.id })).status, 200);
    assert.equal(await User.count({ where: { id: user.id } }), 0);
    assert.equal(await User.count({ where: { id: other.id } }), 1);
  });

  test('not signed in: 401; another website (Origin): 403; a second request after deletion: 401', async () => {
    const user = await signedInUser('del-guards');
    assert.equal((await deleteAccount(null)).status, 401);
    assert.equal((await deleteAccount(user, { confirmation: 'DELETE' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal(await User.count({ where: { id: user.id } }), 1);

    assert.equal((await deleteAccount(user)).status, 200);
    assert.equal((await deleteAccount(user)).status, 401);
  });

  test('two simultaneous deletions: one succeeds, the other is refused', async () => {
    const user = await signedInUser('del-race');
    const results = await Promise.all([deleteAccount(user), deleteAccount(user)]);
    assert.ok(results.some((r) => r.status === 200));
    assert.ok(results.every((r) => r.status === 200 || r.status === 401));
    assert.equal(await User.count({ where: { id: user.id } }), 0);
  });

  test('profile picture: deleted from Cloudinary before the account', async () => {
    const user = await signedInUser('del-photo', { withProfile: true });
    await SurferProfile.update({ avatarUrl: 'https://res.cloudinary.com/x/sesh/avatars/abc.jpg', avatarPublicId: 'sesh/avatars/abc' }, { where: { userId: user.id } });
    const calls = [];
    mock.method(avatarStorage, 'remove', async (publicId) => {
      calls.push({ publicId, userStillThere: (await User.count({ where: { id: user.id } })) === 1 });
    });
    assert.equal((await deleteAccount(user)).status, 200);
    assert.deepEqual(calls, [{ publicId: 'sesh/avatars/abc', userStillThere: true }]);
    assert.equal(await User.count({ where: { id: user.id } }), 0);
  });

  test('Cloudinary failure: 502, the account and the picture reference stay; trying again works', async () => {
    const user = await signedInUser('del-photo-fail', { withProfile: true });
    await SurferProfile.update({ avatarUrl: 'https://res.cloudinary.com/x/sesh/avatars/def.jpg', avatarPublicId: 'sesh/avatars/def' }, { where: { userId: user.id } });
    mock.method(avatarStorage, 'remove', async () => {
      throw new Error('Cloudinary is down');
    });
    const response = await deleteAccount(user);
    assert.equal(response.status, 502);
    assert.match(response.body.message, /account wasn’t deleted/);
    assert.ok(!response.text.includes('Cloudinary is down'));
    assert.equal(await User.count({ where: { id: user.id } }), 1);
    assert.equal((await me(user.token)).status, 200);

    mock.restoreAll();
    mock.method(avatarStorage, 'remove', async () => {});
    assert.equal((await deleteAccount(user)).status, 200);
  });

  test('a picture outside Sesh’s avatars folder is never deleted on Cloudinary', async () => {
    const user = await signedInUser('del-foreign', { withProfile: true });
    await SurferProfile.update({ avatarUrl: 'https://example.com/a.jpg', avatarPublicId: 'samples/people/a' }, { where: { userId: user.id } });
    const remove = mock.method(avatarStorage, 'remove', async () => {});
    assert.equal((await deleteAccount(user)).status, 200);
    assert.equal(remove.mock.callCount(), 0);
  });

  test('database failure: 500 without details; the account stays', async () => {
    const user = await signedInUser('del-db-fail');
    mock.method(User.prototype, 'destroy', async () => {
      throw new Error('connection reset by peer');
    });
    const response = await deleteAccount(user);
    assert.equal(response.status, 500);
    assert.ok(!response.text.includes('connection reset'));
    mock.restoreAll();
    assert.equal(await User.count({ where: { id: user.id } }), 1);
    assert.equal((await me(user.token)).status, 200);
  });
});
