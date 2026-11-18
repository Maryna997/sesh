'use strict';

// Removes every privilege of Supabase's Data API roles (`anon`,
// `authenticated`) on the tables and sequences in the public schema, and
// stops tables and sequences created later by the migration role from
// granting them privileges automatically (Supabase's default privileges).
//
// Sesh doesn't use the Data API: Express connects as the table owner, whose
// own privileges are untouched. `service_role`, Supabase's internal roles,
// other schemas and the schema's USAGE privilege are not changed.
//
// Default privileges belong to the role that creates objects, so only those
// of the role running this migration (on Supabase: `postgres`, which runs
// every Sesh migration) are changed. Roles that don't exist are skipped:
// plain PostgreSQL (CI, local development) has neither role.
//
// "down" restores nothing: granting these roles access again would reopen
// the tables to anyone with the project's public API key. To undo it on
// purpose, grant only what is needed, explicitly, in a new migration.

const API_ROLES = ['anon', 'authenticated'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  API_ROLES,

  async up(queryInterface) {
    const sql = queryInterface.sequelize;
    await sql.transaction(async (transaction) => {
      const [rows] = await sql.query('SELECT rolname FROM pg_roles WHERE rolname IN (:roles)', {
        replacements: { roles: API_ROLES },
        transaction,
      });
      const existing = new Set(rows.map((row) => row.rolname));

      for (const role of API_ROLES) {
        if (!existing.has(role)) {
          console.log(`Role "${role}" does not exist; no privileges to restrict.`);
          continue;
        }
        await sql.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`, { transaction });
        await sql.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`, { transaction });
        await sql.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`, { transaction });
        await sql.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`, { transaction });
      }
    });
  },

  async down() {
    // Intentionally empty: see the note above.
  },
};
