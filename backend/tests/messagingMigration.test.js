// Rollback tests for the messaging migrations:
// - 20261107120000 (create tables): down removes only the two messaging
//   tables, up recreates them with their constraints, other data untouched.
//   The later retain-conversations migration is rolled back first and
//   re-applied afterwards, so the test database ends in its full state.
// - 20261114120000 (retain conversations): down restores NOT NULL + CASCADE
//   (deleting retained history), up restores SET NULL.
//
// It drops tables, so it ONLY runs against a separate test database
// (TEST_DATABASE_URL set) where the migration has been applied. Against the
// development database (no TEST_DATABASE_URL) it is skipped.
import './setup.js';
import { createRequire } from 'node:module';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { sequelize } from '../src/db/index.js';

const require = createRequire(import.meta.url);
const migration = require('../src/db/migrations/20261107120000-create-conversations-and-messages.cjs');
const retainMigration = require('../src/db/migrations/20261114120000-retain-conversations-after-account-deletion.cjs');
const rlsMigration = require('../src/db/migrations/20261118120000-enable-row-level-security.cjs');

const exists = async (table) => {
  const [[row]] = await sequelize.query('SELECT to_regclass(:table) IS NOT NULL AS present', { replacements: { table: `public.${table}` } });
  return row.present;
};

// ON DELETE rule of conversations.user_one_id, user_two_id and messages.sender_id
const deleteRules = async () => {
  const [rows] = await sequelize.query(`
    SELECT rc.delete_rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage k ON k.constraint_name = rc.constraint_name
     WHERE (k.table_name, k.column_name) IN (('conversations', 'user_one_id'), ('conversations', 'user_two_id'), ('messages', 'sender_id'))
     ORDER BY k.table_name, k.column_name`);
  return rows.map((row) => row.delete_rule).join(',');
};

let skip = 'only with a separate test database (TEST_DATABASE_URL)';
if (process.env.TEST_DATABASE_URL) {
  skip = (await exists('conversations')) && (await exists('messages')) ? false : 'messaging migration not applied to the test database';
}

after(async () => {
  await sequelize.close();
});

describe('messaging migration', { skip }, () => {
  test('down removes only the messaging tables; up restores them; other data is untouched', async () => {
    const counts = async () => {
      const [[row]] = await sequelize.query(
        'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM surf_spots) AS spots, (SELECT count(*) FROM surfer_profiles) AS profiles, (SELECT count(*) FROM surfer_availability) AS availability',
      );
      return row;
    };
    const before = await counts();
    const queryInterface = sequelize.getQueryInterface();

    await retainMigration.down(queryInterface, Sequelize);
    await migration.down(queryInterface, Sequelize);
    assert.equal(await exists('messages'), false);
    assert.equal(await exists('conversations'), false);
    assert.deepEqual(await counts(), before);
    for (const table of ['users', 'sessions', 'surf_spots', 'surfer_profiles', 'surfer_favorite_spots', 'surfer_availability']) {
      assert.equal(await exists(table), true, table);
    }

    await migration.up(queryInterface, Sequelize);
    assert.equal(await exists('conversations'), true);
    assert.equal(await exists('messages'), true);
    const [constraints] = await sequelize.query(
      "SELECT conname FROM pg_constraint WHERE conname IN ('conversations_participants_order_check', 'messages_body_check')",
    );
    assert.equal(constraints.length, 2);
    assert.deepEqual(await counts(), before);
    await retainMigration.up(queryInterface, Sequelize);
    assert.equal(await deleteRules(), 'SET NULL,SET NULL,SET NULL');
    await rlsMigration.up(queryInterface, Sequelize);
  });
});

describe('retain-conversations migration', { skip }, () => {
  test('down deletes retained history and restores CASCADE; up restores SET NULL; other data untouched', async () => {
    const queryInterface = sequelize.getQueryInterface();
    const email = (name) => `${name}-${Date.now().toString(36)}@sesh-test.invalid`;
    const [[a], [b]] = await Promise.all(
      ['retain-a', 'retain-b'].map((name) =>
        sequelize.query("INSERT INTO users (email, password_hash, created_at, updated_at) VALUES ($1, 'x', now(), now()) RETURNING id", {
          bind: [email(name)],
          type: Sequelize.QueryTypes.SELECT,
        }).then((rows) => rows),
      ),
    );
    const [one, two] = [a.id, b.id].sort();
    const [[conversation]] = await sequelize.query(
      'INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1, $2) RETURNING id',
      { bind: [one, two] },
    );
    await sequelize.query("INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, 'kept'), ($1, $3, 'reply')", {
      bind: [conversation.id, a.id, b.id],
    });
    await sequelize.query('DELETE FROM users WHERE id = $1', { bind: [a.id] });
    const [[kept]] = await sequelize.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', { bind: [conversation.id] });
    assert.equal(kept.n, 2); // retained, sender of 'kept' is NULL

    assert.equal(await deleteRules(), 'SET NULL,SET NULL,SET NULL');
    await retainMigration.down(queryInterface, Sequelize);
    assert.equal(await deleteRules(), 'CASCADE,CASCADE,CASCADE');
    const [[gone]] = await sequelize.query('SELECT count(*)::int AS n FROM conversations WHERE id = $1', { bind: [conversation.id] });
    assert.equal(gone.n, 0); // rollback can't keep a conversation without both participants

    await retainMigration.up(queryInterface, Sequelize);
    assert.equal(await deleteRules(), 'SET NULL,SET NULL,SET NULL');
    await sequelize.query('DELETE FROM users WHERE id = $1', { bind: [b.id] });
  });
});
