// Rollback test for the messaging migration (20261107120000): down removes
// only the two messaging tables, up recreates them with their constraints,
// and existing tables and data are untouched.
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

const exists = async (table) => {
  const [[row]] = await sequelize.query('SELECT to_regclass(:table) IS NOT NULL AS present', { replacements: { table: `public.${table}` } });
  return row.present;
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
  });
});
