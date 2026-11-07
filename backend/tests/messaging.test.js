// Model and schema tests for private messaging (conversations, messages).
//
// They need the messaging tables (migration 20261107120000). Until that
// migration has been applied to the database the tests use, this file is
// skipped with a message instead of failing, so the rest of the suite still
// runs against a database that hasn't been migrated yet.
//
// Like the other database tests, only @sesh-test.invalid users are created
// and deleted afterwards; their conversations and messages go with them
// (ON DELETE CASCADE).
import './setup.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { Conversation, Message, SurferProfile, User } from '../src/models/index.js';
import { orderParticipants, participantWhere } from '../src/models/Conversation.js';
import { MESSAGE_MAX_LENGTH } from '../src/models/Message.js';
import { deleteTestUsers, testEmail } from './helpers.js';

const [[{ ready }]] = await sequelize.query(
  "SELECT to_regclass('public.conversations') IS NOT NULL AND to_regclass('public.messages') IS NOT NULL AS ready",
);
const skip = ready ? false : 'messaging tables not migrated in this database (run the 20261107120000 migration on a test database)';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let counter = 0;
async function testUser() {
  counter += 1;
  return User.create({ email: testEmail(`messaging-${counter}`), passwordHash: 'not-a-real-hash' });
}

// Two users and their conversation (canonical order)
async function conversationBetween(first, second) {
  return Conversation.create(orderParticipants(first.id, second.id));
}

// PostgreSQL error code of a rejected promise (23514 check, 23505 unique, 23503 foreign key)
async function pgCode(promise) {
  try {
    await promise;
  } catch (error) {
    return error.original?.code ?? error.parent?.code ?? error.code ?? error.name;
  }
  return 'no error';
}

// Inserts directly with SQL, skipping the models' own checks, so the
// database constraints are what's being tested.
const insertConversation = (userOneId, userTwoId) =>
  sequelize.query('INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1, $2)', {
    bind: [userOneId, userTwoId],
  });
// Messages go through the pg driver's own connection, so the body reaches
// PostgreSQL byte for byte (Sequelize rewrites a NUL character as the text
// "\0" before sending, which would hide what PostgreSQL really does).
async function insertMessage(conversationId, senderId, body, createdAt = new Date()) {
  const client = await sequelize.connectionManager.getConnection();
  try {
    await client.query('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4)', [
      conversationId,
      senderId,
      body,
      createdAt,
    ]);
  } finally {
    sequelize.connectionManager.releaseConnection(client);
  }
}

before(async () => {
  if (!skip) await deleteTestUsers();
});

after(async () => {
  if (!skip) await deleteTestUsers();
  await sequelize.close();
});

describe('conversations', { skip }, () => {
  test('a conversation between two users, with both participants loadable', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    const loaded = await Conversation.findByPk(conversation.id, { include: ['userOne', 'userTwo'] });
    assert.deepEqual([loaded.userOne.id, loaded.userTwo.id].sort(), [a.id, b.id].sort());
    assert.ok(loaded.userOneId < loaded.userTwoId, 'canonical order');
    assert.ok(loaded.hasParticipant(a.id) && loaded.hasParticipant(b.id));
    assert.equal(loaded.otherParticipantId(a.id), b.id);
    assert.equal(loaded.hasParticipant(MISSING_ID), false);
  });

  test('orderParticipants gives the same pair in either order, and refuses the same user twice', async () => {
    const [a, b] = [await testUser(), await testUser()];
    assert.deepEqual(orderParticipants(a.id, b.id), orderParticipants(b.id, a.id));
    assert.deepEqual(orderParticipants(a.id.toUpperCase(), b.id), orderParticipants(a.id, b.id));
    assert.throws(() => orderParticipants(a.id, a.id), /two different users/);
  });

  test('self-conversations are rejected by the database (and the model)', async () => {
    const a = await testUser();
    assert.equal(await pgCode(insertConversation(a.id, a.id)), '23514');
    await assert.rejects(Conversation.create({ userOneId: a.id, userTwoId: a.id }), /two different users/);
  });

  test('the reversed order is rejected, so B + A can never be stored next to A + B', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const { userOneId, userTwoId } = orderParticipants(a.id, b.id);
    assert.equal(await pgCode(insertConversation(userTwoId, userOneId)), '23514');
  });

  test('one conversation per pair: a repeat is rejected (unique)', async () => {
    const [a, b] = [await testUser(), await testUser()];
    await conversationBetween(a, b);
    const { userOneId, userTwoId } = orderParticipants(b.id, a.id);
    assert.equal(await pgCode(insertConversation(userOneId, userTwoId)), '23505');
    assert.equal(await Conversation.count({ where: orderParticipants(a.id, b.id) }), 1);
  });

  test('simultaneous creation attempts for the same pair: exactly one succeeds', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) => Conversation.create(index % 2 ? orderParticipants(a.id, b.id) : orderParticipants(b.id, a.id))),
    );
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    for (const failed of attempts.filter((attempt) => attempt.status === 'rejected')) {
      assert.equal(failed.reason.original?.code, '23505');
    }
    assert.equal(await Conversation.count({ where: orderParticipants(a.id, b.id) }), 1);
  });

  test('both participants must be existing users', async () => {
    const a = await testUser();
    const [low, high] = [a.id, MISSING_ID].sort();
    assert.equal(await pgCode(insertConversation(low, high)), '23503');
  });

  test('a user’s conversations: participantWhere and the two User aliases', async () => {
    const [a, b, c] = [await testUser(), await testUser(), await testUser()];
    const ab = await conversationBetween(a, b);
    const ac = await conversationBetween(a, c);
    await conversationBetween(b, c);
    const ofA = await Conversation.findAll({ where: participantWhere(a.id) });
    assert.deepEqual(ofA.map((row) => row.id).sort(), [ab.id, ac.id].sort());

    const loaded = await User.findByPk(a.id, { include: ['conversationsAsUserOne', 'conversationsAsUserTwo'] });
    const viaAliases = [...loaded.conversationsAsUserOne, ...loaded.conversationsAsUserTwo].map((row) => row.id);
    assert.deepEqual(viaAliases.sort(), [ab.id, ac.id].sort());
  });
});

describe('messages', { skip }, () => {
  test('a message in a conversation, with conversation and sender associations', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    const message = await Message.create({ conversationId: conversation.id, senderId: a.id, body: 'Dawn patrol tomorrow?' });
    assert.equal(message.updatedAt, undefined); // messages are never edited

    const loaded = await Message.findByPk(message.id, { include: ['conversation', 'sender'] });
    assert.equal(loaded.conversation.id, conversation.id);
    assert.equal(loaded.sender.id, a.id);
    const withMessages = await Conversation.findByPk(conversation.id, { include: ['messages'] });
    assert.deepEqual(withMessages.messages.map((row) => row.body), ['Dawn patrol tomorrow?']);
    const sender = await User.findByPk(a.id, { include: ['sentMessages'] });
    assert.deepEqual(sender.sentMessages.map((row) => row.id), [message.id]);
  });

  test('empty and whitespace-only bodies are rejected by the database and the model', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    for (const body of ['', ' ', '   \n\t  \r\n']) {
      assert.equal(await pgCode(insertMessage(conversation.id, a.id, body)), '23514', JSON.stringify(body));
      await assert.rejects(Message.create({ conversationId: conversation.id, senderId: a.id, body }), /can’t be empty/);
    }
    assert.equal(await pgCode(insertMessage(conversation.id, a.id, null)), '23502'); // NOT NULL
  });

  test('at most 2,000 characters (Unicode characters, so emoji count once)', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    const create = (body) => Message.create({ conversationId: conversation.id, senderId: a.id, body });

    await create('a'.repeat(MESSAGE_MAX_LENGTH));
    await create('🌊'.repeat(MESSAGE_MAX_LENGTH)); // 2,000 characters, 4,000 UTF-16 units
    assert.equal(await pgCode(insertMessage(conversation.id, a.id, 'a'.repeat(MESSAGE_MAX_LENGTH + 1))), '23514');
    assert.equal(await pgCode(insertMessage(conversation.id, a.id, '🌊'.repeat(MESSAGE_MAX_LENGTH + 1))), '23514');
    await assert.rejects(create('a'.repeat(MESSAGE_MAX_LENGTH + 1)), /at most 2000 characters/);
  });

  // Regression: the model and PostgreSQL must give the same verdict for every
  // body, whatever the server's locale (PostgreSQL's [:space:] is
  // locale-dependent, so the CHECK lists the whitespace characters itself).
  test('the model and the database agree on tricky bodies (length, Unicode, whitespace)', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    const max = MESSAGE_MAX_LENGTH;
    const cases = [
      // [label, body, valid?]
      ['2,000 ASCII', 'a'.repeat(max), true],
      ['2,001 ASCII', 'a'.repeat(max + 1), false],
      ['2,000 emoji (astral, 2 UTF-16 units each)', '🌊'.repeat(max), true],
      ['2,001 emoji', '🌊'.repeat(max + 1), false],
      ['2,000 astral letters', '𝔸'.repeat(max), true],
      ['2,001 astral letters', '𝔸'.repeat(max + 1), false],
      ['1,000 × e + combining accent = 2,000', 'é'.repeat(max / 2), true],
      ['… plus one more character = 2,001', `${'é'.repeat(max / 2)}e`, false],
      ['500 × surfer ZWJ sequence = 2,000', '🏄‍♀️'.repeat(max / 4), true],
      ['… plus one more character = 2,001', `${'🏄‍♀️'.repeat(max / 4)}!`, false],
      ['spaces, tabs and line breaks only', ' \t\n\r\v\f ', false],
      ['no-break / ideographic / em spaces only', '\u00a0\u3000\u2003\u202f', false],
      ['line / paragraph separators only', '\u2028\u2029', false],
      ['BOM only (whitespace in JavaScript)', '\ufeff', false],
      ['NEL only (not whitespace in JavaScript)', '\u0085', true],
      ['file separator only (not whitespace in JavaScript)', '\u001c', true],
      ['zero-width space only (not whitespace)', '\u200b', true],
      ['one visible character among 1,999 spaces', `${' '.repeat(max - 1)}x`, true],
      ['NUL character (PostgreSQL text can’t store it)', 'hi\u0000there', false],
    ];
    const outcomes = [];
    for (const [label, body, valid] of cases) {
      const modelValid = await Message.build({ conversationId: conversation.id, senderId: a.id, body }).validate().then(
        () => true,
        () => false,
      );
      const databaseValid = await insertMessage(conversation.id, a.id, body).then(
        () => true,
        () => false,
      );
      outcomes.push({ label, valid, modelValid, databaseValid });
    }
    const wrong = outcomes.filter((row) => row.modelValid !== row.valid || row.databaseValid !== row.valid);
    assert.deepEqual(wrong, [], JSON.stringify(wrong, null, 2));
  });

  test('Unicode, emoji, line breaks and HTML-like text are stored exactly as sent', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    const body = 'Olá! Ondas às 7h 🌊🏄‍♀️\nSee you at Praia d’Ilhas\n\n<b>not html</b> & "quotes"';
    const message = await Message.create({ conversationId: conversation.id, senderId: b.id, body });
    assert.equal((await Message.findByPk(message.id)).body, body);
  });

  test('messages come back in stable chronological order (created_at, then id)', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    const sameMoment = new Date('2030-07-15T10:00:00Z');
    await insertMessage(conversation.id, a.id, 'third', new Date('2030-07-15T10:05:00Z'));
    await insertMessage(conversation.id, b.id, 'first-or-second A', sameMoment);
    await insertMessage(conversation.id, a.id, 'first-or-second B', sameMoment);

    const order = [['createdAt', 'ASC'], ['id', 'ASC']];
    const once = await Message.findAll({ where: { conversationId: conversation.id }, order });
    const again = await Message.findAll({ where: { conversationId: conversation.id }, order });
    assert.equal(once.at(-1).body, 'third');
    assert.deepEqual(once.map((row) => row.id), again.map((row) => row.id));
    assert.ok(once[0].id < once[1].id, 'ties broken by id');
  });

  test('conversation and sender must exist', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    assert.equal(await pgCode(insertMessage(MISSING_ID, a.id, 'hello')), '23503');
    assert.equal(await pgCode(insertMessage(conversation.id, MISSING_ID, 'hello')), '23503');
  });

  // Documents a rule the tables do NOT enforce, so nobody relies on it:
  // the messaging API must check participation (sender from the session).
  test('not enforced by the database: a sender outside the conversation (the API must check)', async () => {
    const [a, b, outsider] = [await testUser(), await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    await insertMessage(conversation.id, outsider.id, 'I should not be here');
    assert.equal(conversation.hasParticipant(outsider.id), false); // what the API will use
  });
});

describe('deletion', { skip }, () => {
  test('deleting a conversation deletes its messages', async () => {
    const [a, b] = [await testUser(), await testUser()];
    const conversation = await conversationBetween(a, b);
    await Message.create({ conversationId: conversation.id, senderId: a.id, body: 'hi' });
    await conversation.destroy();
    assert.equal(await Message.count({ where: { conversationId: conversation.id } }), 0);
  });

  test('deleting a user deletes their conversations and those messages; the other user stays', async () => {
    const [a, b, c] = [await testUser(), await testUser(), await testUser()];
    const ab = await conversationBetween(a, b);
    const bc = await conversationBetween(b, c);
    await Message.create({ conversationId: ab.id, senderId: a.id, body: 'from a' });
    await Message.create({ conversationId: ab.id, senderId: b.id, body: 'from b' });
    await Message.create({ conversationId: bc.id, senderId: c.id, body: 'from c' });

    await a.destroy();
    assert.equal(await Conversation.count({ where: { id: ab.id } }), 0);
    assert.equal(await Message.count({ where: { conversationId: ab.id } }), 0);
    assert.ok(await User.findByPk(b.id));
    assert.equal(await Message.count({ where: { conversationId: bc.id } }), 1); // unrelated conversation untouched
  });
});

describe('schema and existing models', { skip }, () => {
  test('the expected constraints and indexes exist', async () => {
    const [constraints] = await sequelize.query(
      "SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('conversations'::regclass, 'messages'::regclass)",
    );
    const byName = Object.fromEntries(constraints.map((row) => [row.conname, row]));
    assert.match(byName.conversations_participants_order_check.definition, /user_one_id < user_two_id/);
    assert.match(byName.messages_body_check.definition, /char_length\(body\) <= 2000/);
    const foreignKeys = constraints.filter((row) => row.contype === 'f').map((row) => row.definition);
    assert.equal(foreignKeys.length, 4);
    for (const definition of foreignKeys) assert.match(definition, /ON DELETE CASCADE/);

    const [indexes] = await sequelize.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('conversations', 'messages')",
    );
    const index = Object.fromEntries(indexes.map((row) => [row.indexname, row.indexdef]));
    assert.match(index.conversations_participants_unique, /UNIQUE INDEX .*\(user_one_id, user_two_id\)/);
    assert.match(index.conversations_user_two_id_idx, /\(user_two_id\)/);
    assert.match(index.messages_conversation_id_created_at_id_idx, /\(conversation_id, created_at, id\)/);
    assert.match(index.messages_sender_id_idx, /\(sender_id\)/);
  });

  test('existing associations still work next to the new ones', async () => {
    const a = await testUser();
    await SurferProfile.create({ userId: a.id, displayName: 'Kai', skillLevel: 'beginner' });
    const loaded = await User.findByPk(a.id, { include: ['surferProfile', 'availability', 'conversationsAsUserOne', 'sentMessages'] });
    assert.equal(loaded.surferProfile.displayName, 'Kai');
    assert.equal(loaded.availability, null);
    assert.deepEqual(loaded.sentMessages, []);
  });
});
