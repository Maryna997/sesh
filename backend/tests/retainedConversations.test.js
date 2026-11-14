// Conversations kept after one participant deletes their account
// (retain-conversations migration + DELETE /api/v1/account + messaging API).
//
// Real database (accounts under @sesh-test.invalid only, removed afterwards;
// run against the isolated TEST_DATABASE_URL). Cloudinary is never called.
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { Conversation, Message, User } from '../src/models/index.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';

let server;
let baseUrl;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);
const send = (user, method, path, body) => call(path, { method, cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body });
const messagesOf = (user, id, query = '') => send(user, 'GET', `/api/v1/conversations/${id}/messages${query}`);

async function surfer(name) {
  counter += 1;
  const email = testEmail(`${name}-${counter}`);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  const user = { id: registered.body.user.id, email, name: `${name} ${counter}` };
  user.token = sessionToken(await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } }));
  const profile = await send(user, 'PUT', '/api/v1/profile/me', { displayName: user.name, skillLevel: 'beginner' });
  assert.equal(profile.status, 201);
  return user;
}

async function conversation(a, b, texts = []) {
  const started = await send(a, 'POST', '/api/v1/conversations', { recipientUserId: b.id });
  const id = started.body.conversation.id;
  for (const [who, body] of texts) {
    assert.equal((await send(who === 'a' ? a : b, 'POST', `/api/v1/conversations/${id}/messages`, { body })).status, 201);
  }
  return id;
}

const deleteAccount = (user) => send(user, 'DELETE', '/api/v1/account', { confirmation: 'DELETE' });

before(async () => {
  await sequelize.authenticate();
  ({ server, baseUrl } = await startServer());
});

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

let kai;
let mia;
let outsider;
let retained;

describe('after a participant deleted their account', () => {
  beforeEach(async () => {
    [kai, mia, outsider] = [await surfer('kai'), await surfer('mia'), await surfer('outsider')];
    retained = await conversation(kai, mia, [['a', 'Surf at 4?'], ['b', 'Yes! See you at Carcavelos'], ['a', 'Bring wax']]);
    assert.equal((await deleteAccount(kai)).status, 200);
  });

  test('the inbox keeps it: inactive, no participant details, last message and time kept', async () => {
    const inbox = await send(mia, 'GET', '/api/v1/conversations');
    assert.equal(inbox.status, 200);
    const item = inbox.body.conversations.find((c) => c.id === retained);
    assert.equal(item.isActive, false);
    assert.equal(item.otherParticipant, null);
    assert.equal(item.lastMessage.preview, 'Bring wax');
    assert.equal(item.lastMessage.senderId, null);
    assert.ok(item.lastMessage.createdAt);
    assert.ok(!inbox.text.includes(kai.id) && !inbox.text.includes(kai.name) && !inbox.text.includes(kai.email));
  });

  test('the remaining surfer reads the whole history in order; deleted sender = null; conversation inactive', async () => {
    const latest = await messagesOf(mia, retained);
    assert.equal(latest.status, 200);
    assert.deepEqual(latest.body.conversation, { id: retained, isActive: false, otherParticipant: null });
    assert.deepEqual(
      [...latest.body.messages].reverse().map((m) => [m.body, m.senderId === mia.id ? 'mia' : m.senderId]),
      [['Surf at 4?', null], ['Yes! See you at Carcavelos', 'mia'], ['Bring wax', null]],
    );
    assert.ok(!latest.text.includes(kai.id));
    // Polling from the newest message still works (nothing new)
    const polled = await messagesOf(mia, retained, `?after=${latest.body.pagination.pollCursor}`);
    assert.equal(polled.status, 200);
    assert.deepEqual(polled.body.messages, []);
    assert.equal(polled.body.conversation.isActive, false);
  });

  test('older-message pagination still works on a retained conversation', async () => {
    for (let index = 1; index <= 4; index += 1) {
      // Inserted directly: the API refuses new messages now
      await Message.create({ conversationId: retained, senderId: mia.id, body: `Later ${index}` });
    }
    const first = await messagesOf(mia, retained, '?limit=3');
    assert.equal(first.body.pagination.hasMore, true);
    const second = await messagesOf(mia, retained, `?limit=3&before=${first.body.pagination.nextCursor}`);
    const third = await messagesOf(mia, retained, `?limit=3&before=${second.body.pagination.nextCursor}`);
    const all = [...third.body.messages, ...second.body.messages, ...first.body.messages].reverse().map((m) => m.body);
    assert.equal(all.length, 7);
    assert.equal(new Set(all).size, 7);
    assert.equal(third.body.pagination.hasMore, false);
  });

  test('nobody else can read it; the remaining surfer can’t send (409 CONVERSATION_INACTIVE)', async () => {
    assert.equal((await messagesOf(outsider, retained)).status, 404);
    assert.equal((await send(outsider, 'POST', `/api/v1/conversations/${retained}/messages`, { body: 'hi' })).status, 404);
    assert.equal((await messagesOf(null, retained)).status, 401);

    const refused = await send(mia, 'POST', `/api/v1/conversations/${retained}/messages`, { body: 'Are you there?' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'CONVERSATION_INACTIVE');
    assert.equal(await Message.count({ where: { conversationId: retained } }), 3);
  });

  test('the deleted account can’t sign in, use its old session or be messaged again', async () => {
    assert.equal((await call('/api/v1/auth/login', { method: 'POST', body: { email: kai.email, password: PASSWORD } })).status, 401);
    assert.equal((await messagesOf(kai, retained)).status, 401);
    const again = await send(mia, 'POST', '/api/v1/conversations', { recipientUserId: kai.id });
    assert.equal(again.status, 404);
    // No conversation was created with the deleted id
    const [[row]] = await sequelize.query('SELECT count(*)::int AS n FROM conversations WHERE user_one_id = $1 OR user_two_id = $1', { bind: [kai.id] });
    assert.equal(row.n, 0);
  });

  test('inbox pagination includes it; asking again (refresh / new session) still returns it', async () => {
    const active = await conversation(mia, outsider, [['a', 'Newer chat']]);
    const first = await send(mia, 'GET', '/api/v1/conversations?limit=1');
    const second = await send(mia, 'GET', '/api/v1/conversations?limit=1&page=2');
    assert.deepEqual(first.body.pagination, { page: 1, limit: 1, total: 2, totalPages: 2 });
    assert.deepEqual([...first.body.conversations, ...second.body.conversations].map((c) => [c.id, c.isActive]), [
      [active, true],
      [retained, false],
    ]);

    // A new login session of the remaining surfer still sees it
    const relogin = await call('/api/v1/auth/login', { method: 'POST', body: { email: mia.email, password: PASSWORD } });
    const again = await call('/api/v1/conversations', { cookie: sessionToken(relogin) });
    assert.ok(again.body.conversations.some((c) => c.id === retained && c.isActive === false && c.otherParticipant === null));
  });

  test('other conversations keep working normally', async () => {
    const active = await conversation(mia, outsider, [['a', 'Hello']]);
    const reply = await send(outsider, 'POST', `/api/v1/conversations/${active}/messages`, { body: 'Hi Mia' });
    assert.equal(reply.status, 201);
    const history = await messagesOf(mia, active);
    assert.equal(history.body.conversation.isActive, true);
    assert.equal(history.body.conversation.otherParticipant.userId, outsider.id);
    assert.equal(history.body.conversation.otherParticipant.displayName, outsider.name);
    const inbox = await send(mia, 'GET', '/api/v1/conversations');
    assert.equal(inbox.body.conversations.find((c) => c.id === active).isActive, true);
  });

  test('when the remaining surfer deletes their account too, the conversation is removed; no invalid references remain', async () => {
    assert.equal((await deleteAccount(mia)).status, 200);
    assert.equal(await Conversation.count({ where: { id: retained } }), 0);
    assert.equal(await Message.count({ where: { conversationId: retained } }), 0);
    const [[orphans]] = await sequelize.query(`
      SELECT (SELECT count(*) FROM conversations WHERE user_one_id IS NULL AND user_two_id IS NULL)
           + (SELECT count(*) FROM conversations c WHERE (c.user_one_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_one_id))
                                                     OR (c.user_two_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_two_id)))
           + (SELECT count(*) FROM messages m WHERE m.sender_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.sender_id))
           + (SELECT count(*) FROM messages m WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.id = m.conversation_id)) AS n`);
    assert.equal(Number(orphans.n), 0);
    assert.equal(await User.count({ where: { id: outsider.id } }), 1);
  });
});
