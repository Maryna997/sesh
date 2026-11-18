'use strict';

// Enables row-level security (RLS) on every Sesh table, without policies.
//
// Browsers never query the database: the frontend only calls the Express
// API, and Express (like sequelize-cli) connects as the role that owns the
// tables. On Supabase that is `postgres`, which has BYPASSRLS; RLS is not
// FORCEd, so the owner is not affected either way. Any other role, such as
// Supabase's Data API roles `anon` and `authenticated`, sees no rows and
// can't insert, update or delete any, even if a table privilege is granted
// to it again later. This is a second layer behind the revoked privileges
// (next migration) and the Data API exposure settings.
//
// No data, columns, owners or privileges change. "down" disables RLS on the
// same tables; it refuses when a policy has been added to one of them since,
// because disabling RLS would then silently stop enforcing that policy.

const TABLES = [
  'SequelizeMeta',
  'users',
  'sessions',
  'surf_spots',
  'surfer_profiles',
  'surfer_favorite_spots',
  'surfer_availability',
  'conversations',
  'messages',
];

const quote = (name) => `"${name.replace(/"/g, '""')}"`;

async function assertTablesExist(sql, transaction) {
  const [rows] = await sql.query(
    `SELECT name FROM unnest(ARRAY[:tables]::text[]) AS name
      WHERE to_regclass(format('%I.%I', current_schema(), name)) IS NULL`,
    { replacements: { tables: TABLES }, transaction },
  );
  if (rows.length > 0) {
    throw new Error(`Row-level security: table(s) not found: ${rows.map((row) => row.name).join(', ')}.`);
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  TABLES,

  async up(queryInterface) {
    const sql = queryInterface.sequelize;
    await sql.transaction(async (transaction) => {
      await assertTablesExist(sql, transaction);
      for (const table of TABLES) {
        await sql.query(`ALTER TABLE ${quote(table)} ENABLE ROW LEVEL SECURITY`, { transaction });
      }
    });
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;
    await sql.transaction(async (transaction) => {
      await assertTablesExist(sql, transaction);
      const [policies] = await sql.query(
        `SELECT tablename, policyname FROM pg_policies
          WHERE schemaname = current_schema() AND tablename IN (:tables)`,
        { replacements: { tables: TABLES }, transaction },
      );
      if (policies.length > 0) {
        const names = policies.map((policy) => `${policy.tablename}.${policy.policyname}`).join(', ');
        throw new Error(`Row-level security not disabled: remove these policies first: ${names}.`);
      }
      for (const table of TABLES) {
        await sql.query(`ALTER TABLE ${quote(table)} DISABLE ROW LEVEL SECURITY`, { transaction });
      }
    });
  },
};
