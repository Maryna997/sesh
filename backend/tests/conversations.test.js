// API tests for messaging: /api/v1/conversations and
// /api/v1/conversations/:conversationId/messages (Task 9.2).
//
// They need the messaging tables (migration 20261107120000); on a database
// without them this file is skipped. Only @sesh-test.invalid users are
// created (through the real register / login / profile endpoints) and they
// are deleted afterwards; their conversations and messages go with them
// (ON DELETE CASCADE). Messages that need exact timestamps (equal times,
// long histories) are inserted directly.
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { Conversation, Message } from '../src/models/index.js';
import { decodeCursor, encodeCursor } from '../src/utils/messaging.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const [[{ ready }]] = await sequelize.query(
  "SELECT to_regclass('public.conversations') IS NOT NULL AND to_regclass('public.messages') IS NOT NULL AS ready",
);
const skip = ready ? false : 'messaging tables not migrated in this database';

const PASSWORD = 'correct horse battery';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const AUTH_REQUIRED = { status: 'error', message: 'Authentication required.' };
const NOT_FOUND = { status: 'error', message: 'Conversation not found.' };

let server;
let baseUrl;
let counter = 0;
const call = (path, options) => request(baseUrl, path, options);

// A registered, signed-in surfer (with a profile unless withProfile is false)
async function surfer(name = 'Surfer', { withProfile = true } = {}) {
  counter += 1;
  const email = testEmail(`conversations-${counter}`);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const user = { id: registered.body.user.id, email, token: sessionToken(loggedIn), name };
  if (withProfile) {
    const saved = await call('/api/v1/profile/me', {
      method: 'PUT',
      cookie: user.token,
      origin: TEST_CLIENT_ORIGIN,
      body: { displayName: name, skillLevel: 'intermediate', about: 'Private-ish bio' },
    });
    assert.equal(saved.status, 201);
  }
  return user;
}

const start = (user, recipientUserId, options = {}) =>
  call('/api/v1/conversations', { method: 'POST', cookie: user?.token, origin: TEST_CLIENT_ORIGIN, body: { recipientUserId }, ...options });
const list = (user, query = '') => call(`/api/v1/conversations${query}`, { cookie: user?.token });
const messages = (user, conversationId, query = '') => call(`/api/v1/conversations/${conversationId}/messages${query}`, { cookie: user?.token });
const send = (user, conversationId, body, options = {}) =>
  call(`/api/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    cookie: user?.token,
    origin: TEST_CLIENT_ORIGIN,
    body: typeof body === 'string' ? { body } : body,
    ...options,
  });

async function conversationOf(a, b) {
  const response = await start(a, b.id);
  assert.ok([200, 201].includes(response.status), JSON.stringify(response.body));
  return response.body.conversation.id;
}

// Inserts messages with exact timestamps (ISO strings, microseconds allowed)
async function insertAt(conversationId, senderId, body, createdAt) {
  const [[row]] = await sequelize.query(
    'INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4::timestamptz) RETURNING id',
    { bind: [conversationId, senderId, body, createdAt] },
  );
  return row.id;
}
const bodies = (response) => response.body.messages.map((message) => message.body);

before(async () => {
  if (skip) return;
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());
});

after(async () => {
  if (!skip) {
    await deleteTestUsers();
    server.close();
  }
  await sequelize.close();
});

describe('POST /api/v1/conversations', { skip }, () => {
  test('creates a conversation (201), then reuses it in either direction (200)', async () => {
    const [a, b] = [await surfer('Ana'), await surfer('Bea')];
    const created = await start(a, b.id);
    assert.equal(created.status, 201);
    assert.deepEqual(Object.keys(created.body.conversation).sort(), ['createdAt', 'id', 'otherParticipant']);
    assert.deepEqual(created.body.conversation.otherParticipant, { userId: b.id, displayName: 'Bea', avatarUrl: null });

    const again = await start(a, b.id);
    const reversed = await start(b, a.id);
    assert.equal(again.status, 200);
    assert.equal(reversed.status, 200);
    assert.equal(again.body.conversation.id, created.body.conversation.id);
    assert.equal(reversed.body.conversation.id, created.body.conversation.id);
    assert.equal(reversed.body.conversation.otherParticipant.displayName, 'Ana');
    assert.ok(!created.text.includes(b.email) && !created.text.includes('Private-ish bio'));
  });

  test('simultaneous requests (both directions) produce one conversation: one 201, the rest 200', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => (index % 2 ? start(a, b.id) : start(b, a.id))));
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 201]);
    assert.equal(new Set(responses.map((response) => response.body.conversation.id)).size, 1);
  });

  // Deterministic version of the race: the first lookup misses, as when
  // another request creates the pair in between; the unique index then
  // refuses the insert and the API must return the existing conversation.
  test('a pair created in between is recovered from the unique violation (200, same conversation)', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const existing = await conversationOf(a, b);
    const realFindOne = Conversation.findOne.bind(Conversation);
    let lookups = 0;
    const findOne = mock.method(Conversation, 'findOne', (...args) => (++lookups === 1 ? Promise.resolve(null) : realFindOne(...args)));
    try {
      const response = await start(b, a.id);
      assert.equal(response.status, 200);
      assert.equal(response.body.conversation.id, existing);
      assert.equal(lookups, 2); // missed once, found after the refused insert
    } finally {
      findOne.mock.restore();
    }
  });

  test('validation: self, missing, malformed, unknown, no profile, extra fields', async () => {
    const [a, noProfile] = [await surfer(), await surfer('x', { withProfile: false })];
    const self = await start(a, a.id);
    assert.equal(self.status, 400);
    assert.equal(self.body.errors.recipientUserId, 'You can’t start a conversation with yourself.');

    for (const body of [{}, { recipientUserId: '' }, { recipientUserId: null }]) {
      const response = await call('/api/v1/conversations', { method: 'POST', cookie: a.token, origin: TEST_CLIENT_ORIGIN, body });
      assert.equal(response.status, 400);
      assert.equal(response.body.errors.recipientUserId, 'Choose a surfer to message.');
    }
    for (const recipientUserId of ['not-a-uuid', 42, `${a.id}x`]) {
      const response = await start(a, recipientUserId);
      assert.equal(response.status, 400);
      assert.equal(response.body.errors.recipientUserId, 'This surfer id isn’t valid.');
    }
    const extra = await call('/api/v1/conversations', {
      method: 'POST', cookie: a.token, origin: TEST_CLIENT_ORIGIN, body: { recipientUserId: noProfile.id, senderId: noProfile.id },
    });
    assert.equal(extra.status, 400);
    assert.equal(extra.body.errors.senderId, 'This field can’t be set.');

    for (const recipientUserId of [MISSING_ID, noProfile.id]) {
      const response = await start(a, recipientUserId);
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { status: 'error', message: 'Surfer not found.' });
    }
    const array = await call('/api/v1/conversations', { method: 'POST', cookie: a.token, origin: TEST_CLIENT_ORIGIN, body: [a.id] });
    assert.equal(array.status, 400);
  });

  test('needs a session, a completed profile and a trusted Origin', async () => {
    const [a, b, noProfile] = [await surfer(), await surfer(), await surfer('x', { withProfile: false })];
    const anonymous = await start(undefined, b.id);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.body, AUTH_REQUIRED);
    const incomplete = await start(noProfile, b.id);
    assert.equal(incomplete.status, 403);
    assert.equal(incomplete.body.code, 'PROFILE_REQUIRED');
    const foreign = await start(a, b.id, { origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);
    assert.equal((await list(a)).body.pagination.total, 0); // nothing was created
  });
});

describe('GET /api/v1/conversations', { skip }, () => {
  test('only my conversations, with the other participant and the last message', async () => {
    const [a, b, c, d] = [await surfer('Ana'), await surfer('Bea'), await surfer('Cai'), await surfer('Dan')];
    const ab = await conversationOf(a, b);
    const ac = await conversationOf(c, a);
    await conversationOf(b, d); // not Ana's
    await send(b, ab, 'first');
    await send(a, ab, 'second, the latest');

    const response = await list(a);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.pagination, { page: 1, limit: 20, total: 2, totalPages: 1 });
    const byId = Object.fromEntries(response.body.conversations.map((row) => [row.id, row]));
    assert.deepEqual(Object.keys(byId).sort(), [ab, ac].sort());
    assert.deepEqual(byId[ab].otherParticipant, { userId: b.id, displayName: 'Bea', avatarUrl: null });
    assert.equal(byId[ac].otherParticipant.displayName, 'Cai');
    assert.equal(byId[ab].lastMessage.preview, 'second, the latest');
    assert.equal(byId[ab].lastMessage.senderId, a.id);
    assert.equal(byId[ac].lastMessage, null); // no messages yet
    for (const text of [b.email, c.email, 'Private-ish bio', 'passwordHash', 'user_one_id']) assert.ok(!response.text.includes(text), text);
  });

  test('most recent activity first: a new message moves a conversation to the top', async () => {
    const [a, b, c] = [await surfer(), await surfer(), await surfer()];
    const ab = await conversationOf(a, b);
    const ac = await conversationOf(a, c);
    assert.deepEqual((await list(a)).body.conversations.map((row) => row.id), [ac, ab]); // newest conversation first
    await send(b, ab, 'hello again');
    assert.deepEqual((await list(a)).body.conversations.map((row) => row.id), [ab, ac]);
  });

  test('long last messages are previewed (120 characters, emoji kept whole)', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const ab = await conversationOf(a, b);
    await send(a, ab, '🌊'.repeat(300));
    const preview = (await list(b)).body.conversations[0].lastMessage.preview;
    assert.equal([...preview].length, 120);
    assert.equal(preview, '🌊'.repeat(120));
  });

  test('page / limit pagination, empty inbox, invalid parameters', async () => {
    const [a, ...others] = [await surfer(), await surfer(), await surfer(), await surfer()];
    const empty = await list(a);
    assert.deepEqual(empty.body, { conversations: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    for (const other of others) await conversationOf(a, other);

    const first = await list(a, '?limit=2');
    const second = await list(a, '?limit=2&page=2');
    assert.deepEqual(first.body.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
    assert.equal(first.body.conversations.length, 2);
    assert.equal(second.body.conversations.length, 1);
    const ids = [...first.body.conversations, ...second.body.conversations].map((row) => row.id);
    assert.equal(new Set(ids).size, 3);

    assert.equal((await list(a, '?limit=50')).status, 200);
    for (const query of ['?limit=51', '?limit=0', '?page=-1', '?limit=1.5', '?page=1&page=2', '?sort=name']) {
      assert.equal((await list(a, query)).status, 400, query);
    }
    assert.equal((await list(undefined)).status, 401);
  });

  test('a constant number of queries, however many conversations (no N+1)', async () => {
    const countQueries = async (user) => {
      let queries = 0;
      const original = sequelize.options.logging;
      sequelize.options.logging = () => (queries += 1);
      try {
        assert.equal((await list(user)).status, 200);
      } finally {
        sequelize.options.logging = original;
      }
      return queries;
    };
    const [one, many] = [await surfer(), await surfer()];
    await conversationOf(one, await surfer());
    for (let index = 0; index < 5; index += 1) {
      const other = await surfer();
      const id = await conversationOf(many, other);
      await send(other, id, `message ${index}`);
    }
    assert.equal(await countQueries(many), await countQueries(one));
  });
});

describe('GET /api/v1/conversations/:id/messages', { skip }, () => {
  // 7 past messages (2020): 10:00:01 … 10:00:05, plus two sharing exactly the same time
  async function history() {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    for (let index = 1; index <= 5; index += 1) {
      await insertAt(id, index % 2 ? a.id : b.id, `m${index}`, `2020-07-15T10:00:0${index}.000000Z`);
    }
    // Two messages at exactly the same microsecond: ordered by id
    await insertAt(id, a.id, 'tie-1', '2020-07-15T10:00:06.123456Z');
    await insertAt(id, b.id, 'tie-2', '2020-07-15T10:00:06.123456Z');
    const [ties] = await sequelize.query("SELECT body FROM messages WHERE conversation_id = $1 AND body LIKE 'tie-%' ORDER BY id", { bind: [id] });
    const chronological = ['m1', 'm2', 'm3', 'm4', 'm5', ...ties.map((row) => row.body)];
    return { a, b, id, chronological };
  }

  test('latest messages, newest first, with a cursor for older ones and one for polling', async () => {
    const { a, id, chronological } = await history();
    const response = await messages(a, id, '?limit=3');
    assert.equal(response.status, 200);
    assert.deepEqual(bodies(response), chronological.slice(-3).reverse());
    assert.deepEqual(Object.keys(response.body.messages[0]).sort(), ['body', 'conversationId', 'createdAt', 'id', 'senderId']);
    assert.equal(response.body.pagination.hasMore, true);
    assert.ok(decodeCursor(response.body.pagination.nextCursor));
    assert.ok(decodeCursor(response.body.pagination.pollCursor));

    const all = await messages(a, id);
    assert.deepEqual(bodies(all), [...chronological].reverse());
    assert.deepEqual(all.body.pagination.hasMore, false);
    assert.equal(all.body.pagination.nextCursor, null);
  });

  test('default limit 30, maximum 50', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    await sequelize.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at)
       SELECT $1, $2, 'n' || g, timestamptz '2030-07-15 10:00:00+00' + g * interval '1 second' FROM generate_series(1, 60) g`,
      { bind: [id, a.id] },
    );
    const defaults = await messages(a, id);
    assert.equal(defaults.body.messages.length, 30);
    assert.equal(defaults.body.messages[0].body, 'n60');
    assert.equal((await messages(a, id, '?limit=50')).body.messages.length, 50);
    assert.equal((await messages(a, id, '?limit=51')).status, 400);
  });

  test('empty conversation: no messages, no cursors', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    const response = await messages(b, id);
    assert.deepEqual(response.body, { messages: [], pagination: { hasMore: false, nextCursor: null, pollCursor: null } });
  });

  test('before: walks back through older pages without duplicates or gaps (also across equal timestamps)', async () => {
    const { a, id, chronological } = await history();
    const seen = [];
    let response = await messages(a, id, '?limit=2');
    seen.push(...bodies(response));
    while (response.body.pagination.hasMore) {
      response = await messages(a, id, `?limit=2&before=${response.body.pagination.nextCursor}`);
      assert.equal(response.status, 200);
      seen.push(...bodies(response));
    }
    assert.deepEqual(seen, [...chronological].reverse());
    assert.equal(response.body.pagination.nextCursor, null);
  });

  test('before: new messages arriving meanwhile don’t shift older pages', async () => {
    const { a, b, id, chronological } = await history();
    const firstPage = await messages(a, id, '?limit=3');
    await send(b, id, 'brand new 1');
    await send(a, id, 'brand new 2');
    const older = await messages(a, id, `?limit=3&before=${firstPage.body.pagination.nextCursor}`);
    assert.deepEqual(bodies(older), chronological.slice(-6, -3).reverse());
  });

  test('after (polling): only newer messages, oldest first; nothing new → empty with the same cursor', async () => {
    const { a, b, id } = await history();
    const opened = await messages(a, id, '?limit=3');
    let cursor = opened.body.pagination.pollCursor;

    const quiet = await messages(a, id, `?after=${cursor}`);
    assert.deepEqual(quiet.body, { messages: [], pagination: { hasMore: false, nextCursor: cursor } });

    await send(b, id, 'new 1');
    await send(b, id, 'new 2');
    await send(a, id, 'new 3');
    const polled = await messages(a, id, `?after=${cursor}`);
    assert.deepEqual(bodies(polled), ['new 1', 'new 2', 'new 3']);
    assert.equal(polled.body.pagination.hasMore, false);
    cursor = polled.body.pagination.nextCursor;

    const repeat = await messages(a, id, `?after=${cursor}`);
    assert.deepEqual(bodies(repeat), []); // never the same messages twice
    assert.equal(repeat.body.pagination.nextCursor, cursor);
  });

  test('after: more new messages than one page → hasMore, and continuing loses nothing', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    const opened = await messages(a, id);
    assert.equal(opened.body.pagination.pollCursor, null); // empty: poll without a cursor first
    await send(b, id, 'start');
    let cursor = (await messages(a, id)).body.pagination.pollCursor;

    // 35 messages arrive between two polls, 5 of them at exactly the same time
    await sequelize.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at)
       SELECT $1, $2, 'burst ' || lpad(g::text, 2, '0'), clock_timestamp() + LEAST(g, 30) * interval '1 millisecond'
         FROM generate_series(1, 35) g`,
      { bind: [id, b.id] },
    );
    const received = [];
    let polls = 0;
    let response;
    do {
      response = await messages(a, id, `?limit=10&after=${cursor}`);
      received.push(...bodies(response));
      cursor = response.body.pagination.nextCursor;
      polls += 1;
    } while (response.body.pagination.hasMore);
    assert.equal(polls, 4);
    assert.equal(received.length, 35);
    assert.equal(new Set(received).size, 35);
    const [ordered] = await sequelize.query(
      "SELECT body FROM messages WHERE conversation_id = $1 AND body LIKE 'burst%' ORDER BY created_at, id",
      { bind: [id] },
    );
    assert.deepEqual(received, ordered.map((row) => row.body));
  });

  test('cursors keep PostgreSQL’s microseconds (no repeat or skip within one millisecond)', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    await insertAt(id, a.id, 'µ1', '2030-07-15T10:00:00.000100Z');
    await insertAt(id, a.id, 'µ2', '2030-07-15T10:00:00.000200Z');
    await insertAt(id, a.id, 'µ3', '2030-07-15T10:00:00.000300Z');
    const first = await messages(a, id, `?limit=1&after=${encodeCursor('2030-07-15T10:00:00.000000Z', MISSING_ID)}`);
    assert.deepEqual(bodies(first), ['µ1']);
    assert.equal(decodeCursor(first.body.pagination.nextCursor).time, '2030-07-15T10:00:00.000100Z');
    const second = await messages(a, id, `?limit=1&after=${first.body.pagination.nextCursor}`);
    assert.deepEqual(bodies(second), ['µ2']);
  });

  test('invalid requests: cursors, before + after, unknown or repeated parameters, limits', async () => {
    const { a, id } = await history();
    const cursor = (await messages(a, id)).body.pagination.pollCursor;
    const cases = {
      '?before=nonsense': 'before',
      '?after=%2B%2B%2B': 'after',
      [`?after=${Buffer.from('2030-07-15T10:00:00Z|x').toString('base64url')}`]: 'after',
      [`?after=${Buffer.from(`2030-07-15T10:00:00.000000Z|${MISSING_ID}|x`).toString('base64url')}`]: 'after',
      [`?before=${cursor}&after=${cursor}`]: 'after',
      [`?after=${cursor}&after=${cursor}`]: 'after',
      '?limit=0': 'limit',
      '?offset=10': 'offset',
    };
    for (const [query, field] of Object.entries(cases)) {
      const response = await messages(a, id, query);
      assert.equal(response.status, 400, query);
      assert.ok(response.body.errors[field], `${query} → ${JSON.stringify(response.body.errors)}`);
    }
  });

  test('only participants: others, unknown and malformed ids all get the same 404; visitors 401', async () => {
    const { a, id } = await history();
    const outsider = await surfer();
    for (const [user, conversationId] of [[outsider, id], [a, MISSING_ID], [a, 'not-a-uuid']]) {
      for (const query of ['', `?after=${encodeCursor('2030-07-15T10:00:00.000000Z', MISSING_ID)}`]) {
        const response = await messages(user, conversationId, query);
        assert.equal(response.status, 404);
        assert.deepEqual(response.body, NOT_FOUND);
      }
    }
    assert.equal((await messages(undefined, id)).status, 401);
    const noProfile = await surfer('x', { withProfile: false });
    assert.equal((await messages(noProfile, id)).status, 403);
  });
});

describe('POST /api/v1/conversations/:id/messages', { skip }, () => {
  test('sends as the signed-in surfer (201) and keeps the text exactly', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    const text = '  Olá! Ondas às 7h 🌊🏄‍♀️\n\nSee you at Ribeira d’Ilhas  \n';
    const response = await send(a, id, text);
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body.message).sort(), ['body', 'conversationId', 'createdAt', 'id', 'senderId']);
    assert.equal(response.body.message.body, text); // not trimmed
    assert.equal(response.body.message.senderId, a.id);
    assert.equal(response.body.message.conversationId, id);
    const stored = await Message.findByPk(response.body.message.id);
    assert.equal(stored.body, text);
    assert.equal(stored.senderId, a.id);
    // Stamped by the database clock after the conversation row was locked
    // (same transaction), not by the app server beforehand
    const [[order]] = await sequelize.query(
      'SELECT m.created_at >= c.updated_at AS after_lock FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = $1',
      { bind: [stored.id] },
    );
    assert.equal(order.after_lock, true);
    assert.deepEqual(bodies(await messages(b, id)), [text]);
  });

  test('the sender can’t be chosen: senderId and other fields are refused', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    for (const extra of [{ senderId: b.id }, { conversationId: id }, { createdAt: '2020-01-01T00:00:00Z' }]) {
      const response = await send(a, id, { body: 'hi', ...extra });
      assert.equal(response.status, 400);
      assert.equal(response.body.errors[Object.keys(extra)[0]], 'This field can’t be set.');
    }
    assert.equal(await Message.count({ where: { conversationId: id } }), 0);
  });

  test('message rules: empty, whitespace only, 2,000 / 2,001 characters, emoji, NUL, not text', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    const cases = [
      ['', 400, 'Message can’t be empty.'],
      ['   \n\t ', 400, 'Message can’t be empty.'],
      [' 　', 400, 'Message can’t be empty.'],
      ['a'.repeat(2000), 201],
      ['🌊'.repeat(2000), 201],
      ['é'.repeat(1000), 201],
      ['a'.repeat(2001), 400, 'Message must be at most 2000 characters.'],
      ['🌊'.repeat(2001), 400, 'Message must be at most 2000 characters.'],
      ['hi\u0000there', 400, 'Message contains a character that can’t be sent.'],
    ];
    for (const [body, status, error] of cases) {
      const response = await send(a, id, body);
      assert.equal(response.status, status, JSON.stringify(body).slice(0, 40));
      if (error) assert.equal(response.body.errors.body, error);
    }
    for (const body of [{}, { body: null }, { body: 42 }, { body: ['hi'] }]) {
      const response = await send(a, id, body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    assert.equal(await Message.count({ where: { conversationId: id } }), 3);
  });

  test('only participants can send; unknown and malformed ids get the same 404', async () => {
    const [a, b, outsider] = [await surfer(), await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    for (const [user, conversationId] of [[outsider, id], [a, MISSING_ID], [a, 'not-a-uuid']]) {
      const response = await send(user, conversationId, 'let me in');
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, NOT_FOUND);
    }
    assert.equal(await Message.count({ where: { conversationId: id } }), 0);
  });

  test('needs a session, a completed profile and a trusted Origin', async () => {
    const [a, b, noProfile] = [await surfer(), await surfer(), await surfer('x', { withProfile: false })];
    const id = await conversationOf(a, b);
    assert.equal((await send(undefined, id, 'hi')).status, 401);
    assert.equal((await send(noProfile, id, 'hi')).status, 403);
    assert.equal((await send(a, id, 'hi', { origin: 'https://evil.example' })).status, 403);
    assert.equal(await Message.count({ where: { conversationId: id } }), 0);
  });

  test('simultaneous sends are stored in a gap-free order that polling follows', async () => {
    const [a, b] = [await surfer(), await surfer()];
    const id = await conversationOf(a, b);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => send(index % 2 ? a : b, id, `parallel ${index}`)));
    assert.ok(responses.every((response) => response.status === 201));
    const polled = await messages(a, id, `?after=${encodeCursor('2000-01-01T00:00:00.000000Z', MISSING_ID)}&limit=50`);
    assert.equal(polled.body.messages.length, 10);
    const times = polled.body.messages.map((message) => message.createdAt);
    assert.deepEqual(times, [...times].sort());
  });
});
