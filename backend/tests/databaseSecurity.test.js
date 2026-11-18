// Row-level security and Data API role privileges (migrations 20261118120000
// and 20261118120100):
// - every Sesh table has RLS enabled and no policies, so a role without
//   BYPASSRLS sees no rows and can't write any, while the table owner (the
//   app's own connection) keeps full access;
// - `anon` and `authenticated` lose all table and sequence privileges, also
//   for tables and sequences created later;
// - RLS down/up and the privilege migration's deliberately empty down.
//
// It changes roles and privileges, so it ONLY runs against a separate test
// database (TEST_DATABASE_URL). Roles missing there (plain PostgreSQL) are
// created for the test and dropped afterwards; existing roles are never
// dropped.
import './setup.js';
import { createRequire } from 'node:module';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { sequelize } from '../src/db/index.js';

const require = createRequire(import.meta.url);
const rls = require('../src/db/migrations/20261118120000-enable-row-level-security.cjs');
const privileges = require('../src/db/migrations/20261118120100-restrict-data-api-role-privileges.cjs');

const queryInterface = sequelize.getQueryInterface();
const skip = process.env.TEST_DATABASE_URL ? false : 'only with a separate test database (TEST_DATABASE_URL)';

const rlsState = async () => {
  const [rows] = await sequelize.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relname IN (:tables)`,
    { replacements: { tables: rls.TABLES } },
  );
  return rows;
};

const policyCount = async () => {
  const [[row]] = await sequelize.query(
    'SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = current_schema() AND tablename IN (:tables)',
    { replacements: { tables: rls.TABLES } },
  );
  return row.n;
};

const roleExists = async (role) => {
  const [rows] = await sequelize.query('SELECT 1 FROM pg_roles WHERE rolname = :role', { replacements: { role } });
  return rows.length === 1;
};

const createdRoles = [];

before(async () => {
  if (skip) return;
  // Earlier test files may have re-created tables; bring them to the migrated state
  await rls.up(queryInterface, Sequelize);
});

after(async () => {
  for (const role of createdRoles) {
    await sequelize.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await sequelize.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
    await sequelize.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`);
    await sequelize.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`);
    await sequelize.query(`DROP ROLE IF EXISTS ${role}`);
  }
  await sequelize.close();
});

describe('row-level security', { skip }, () => {
  test('all nine tables have RLS enabled (not forced) and no policies', async () => {
    const rows = await rlsState();
    assert.equal(rows.length, 9);
    for (const row of rows) {
      assert.equal(row.relrowsecurity, true, row.relname);
      assert.equal(row.relforcerowsecurity, false, row.relname);
    }
    assert.equal(await policyCount(), 0);
  });

  test('a role without BYPASSRLS sees no rows and cannot write, even with table privileges; the owner keeps full access', async () => {
    const [[owner]] = await sequelize.query('SELECT count(*)::int AS n FROM surf_spots');
    assert.ok(owner.n > 0, 'the owner reads the seeded surf spots');

    await sequelize.transaction(async (transaction) => {
      const run = (query) => sequelize.query(query, { transaction });
      await run('CREATE ROLE sesh_rls_probe NOLOGIN NOBYPASSRLS');
      await run('GRANT sesh_rls_probe TO CURRENT_USER');
      await run('GRANT SELECT, INSERT, UPDATE, DELETE ON surf_spots, users, messages TO sesh_rls_probe');
      await run('SET LOCAL ROLE sesh_rls_probe');

      for (const table of ['surf_spots', 'users', 'messages']) {
        const [[row]] = await run(`SELECT count(*)::int AS n FROM ${table}`);
        assert.equal(row.n, 0, `${table} rows visible to the probe role`);
      }
      const [, updated] = await run("UPDATE surf_spots SET name = name WHERE id <> ''");
      assert.equal(updated.rowCount, 0);

      await run('SAVEPOINT before_insert');
      await assert.rejects(
        run(
          "INSERT INTO surf_spots (id, name, kind, area, municipality, region, country, created_at, updated_at) VALUES ('pt-rls-probe', 'Probe', 'beach', 'A', 'M', 'R', 'Portugal', now(), now())",
        ),
        (error) => error.parent?.code === '42501', // insufficient_privilege: the RLS check (message text depends on locale)
      );
      await run('ROLLBACK TO SAVEPOINT before_insert');
      throw new Error('rollback');
    }).catch((error) => {
      if (error.message !== 'rollback') throw error;
    });

    assert.equal(await roleExists('sesh_rls_probe'), false, 'the probe role was rolled back');
  });

  test('down disables RLS on the same tables and up enables it again; down refuses while a policy exists', async () => {
    await rls.down(queryInterface, Sequelize);
    assert.ok((await rlsState()).every((row) => row.relrowsecurity === false));

    await rls.up(queryInterface, Sequelize);
    assert.ok((await rlsState()).every((row) => row.relrowsecurity === true));

    await sequelize.query('CREATE POLICY sesh_test_policy ON surf_spots FOR SELECT USING (true)');
    try {
      await assert.rejects(rls.down(queryInterface, Sequelize), /surf_spots\.sesh_test_policy/);
      assert.ok((await rlsState()).every((row) => row.relrowsecurity === true), 'nothing was disabled');
    } finally {
      await sequelize.query('DROP POLICY sesh_test_policy ON surf_spots');
    }
  });
});

describe('Data API role privileges', { skip }, () => {
  const tablePrivileges = async (role) => {
    const [[row]] = await sequelize.query(
      `SELECT count(*)::int AS n
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) a
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S') AND a.grantee = :role::regrole`,
      { replacements: { role } },
    );
    return row.n;
  };

  const defaultPrivileges = async (role) => {
    const [[row]] = await sequelize.query(
      `SELECT count(*)::int AS n
         FROM pg_default_acl d, aclexplode(d.defaclacl) a
        WHERE d.defaclrole = current_user::text::regrole AND d.defaclnamespace = 'public'::regnamespace
          AND d.defaclobjtype IN ('r', 'S') AND a.grantee = :role::regrole`,
      { replacements: { role } },
    );
    return row.n;
  };

  test('anon and authenticated lose every table and sequence privilege, now and for objects created later', async () => {
    // Reproduce Supabase's starting point: broad grants and default privileges
    for (const role of privileges.API_ROLES) {
      if (!(await roleExists(role))) {
        await sequelize.query(`CREATE ROLE ${role} NOLOGIN`);
        createdRoles.push(role);
      }
      await sequelize.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`);
      await sequelize.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
      await sequelize.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`);
      assert.ok((await tablePrivileges(role)) > 0);
      assert.ok((await defaultPrivileges(role)) > 0);
    }

    await privileges.up(queryInterface, Sequelize);

    for (const role of privileges.API_ROLES) {
      assert.equal(await tablePrivileges(role), 0, `${role} table privileges`);
      assert.equal(await defaultPrivileges(role), 0, `${role} default privileges`);
    }

    // Objects created afterwards don't grant anything to the API roles
    await sequelize.transaction(async (transaction) => {
      const run = (query) => sequelize.query(query, { transaction });
      await run('CREATE TABLE sesh_future_table (id integer)');
      await run('CREATE SEQUENCE sesh_future_sequence');
      for (const role of privileges.API_ROLES) {
        const [[row]] = await run(
          `SELECT has_table_privilege('${role}', 'sesh_future_table', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS t,
                  has_sequence_privilege('${role}', 'sesh_future_sequence', 'USAGE,SELECT,UPDATE') AS s`,
        );
        assert.equal(row.t, false, `${role} on a new table`);
        assert.equal(row.s, false, `${role} on a new sequence`);
      }
      throw new Error('rollback');
    }).catch((error) => {
      if (error.message !== 'rollback') throw error;
    });

    // Running it again changes nothing; down deliberately restores nothing
    await privileges.up(queryInterface, Sequelize);
    await privileges.down(queryInterface, Sequelize);
    for (const role of privileges.API_ROLES) {
      assert.equal(await tablePrivileges(role), 0);
      assert.equal(await defaultPrivileges(role), 0);
    }
  });
});
