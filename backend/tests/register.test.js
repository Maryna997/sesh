// API tests for POST /api/v1/auth/register.
//
// These use the database in backend/.env, so the users migration must have
// been run (npm run db:migrate). They only create accounts under the reserved
// test domain "@sesh-test.invalid" and delete them before and after the run,
// so no real user data is touched.
import './setup.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import app from '../src/app.js';
import { sequelize } from '../src/db/index.js';
import { User } from '../src/models/User.js';

const TEST_DOMAIN = '@sesh-test.invalid';
const RUN_ID = Date.now().toString(36);
const testEmail = (name) => `${name}-${RUN_ID}${TEST_DOMAIN}`;
const PASSWORD = 'correct horse battery';

let server;
let baseUrl;

function deleteTestUsers() {
  return User.destroy({ where: { email: { [Op.like]: `%${TEST_DOMAIN}` } } });
}

// Sends a registration request. `raw` sends the body string as-is.
async function register(body, { raw, contentType = 'application/json' } = {}) {
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: raw ?? JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

// Reads the stored row directly, bypassing the model
async function findStoredUser(email) {
  const [rows] = await sequelize.query('SELECT id, email, password_hash FROM users WHERE email = :email', {
    replacements: { email },
  });
  return rows[0];
}

before(async () => {
  await deleteTestUsers();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('POST /api/v1/auth/register', () => {
  test('1. registers a user: 201 with id, email and createdAt', async () => {
    const email = testEmail('success');
    const { status, body } = await register({ email, password: PASSWORD });

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(body), ['user']);
    assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'email', 'id']);
    assert.match(body.user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(body.user.email, email);
    assert.ok(!Number.isNaN(Date.parse(body.user.createdAt)));
  });

  test('2. missing email -> 400', async () => {
    const { status, body } = await register({ password: PASSWORD });
    assert.equal(status, 400);
    assert.equal(body.status, 'error');
    assert.equal(body.errors.email, 'Email is required.');
    assert.equal(body.errors.password, undefined);
  });

  test('3. missing password -> 400', async () => {
    const { status, body } = await register({ email: testEmail('nopassword') });
    assert.equal(status, 400);
    assert.equal(body.errors.password, 'Password is required.');
    assert.equal(await findStoredUser(testEmail('nopassword')), undefined);
  });

  test('4. invalid email format -> 400', async () => {
    for (const email of ['not-an-email', 'x@y', `spaces in${TEST_DOMAIN}`]) {
      const { status, body } = await register({ email, password: PASSWORD });
      assert.equal(status, 400, email);
      assert.equal(body.errors.email, 'Enter a valid email address, like you@example.com.');
    }
  });

  test('5. password shorter than 8 characters -> 400', async () => {
    const email = testEmail('short');
    const { status, body } = await register({ email, password: '1234567' });
    assert.equal(status, 400);
    assert.equal(body.errors.password, 'Password must be at least 8 characters.');
    assert.equal(await findStoredUser(email), undefined);
  });

  test('6. duplicate email -> 409', async () => {
    const email = testEmail('duplicate');
    assert.equal((await register({ email, password: PASSWORD })).status, 201);
    const { status, body } = await register({ email, password: 'another password' });
    assert.equal(status, 409);
    assert.deepEqual(body, { status: 'error', message: 'An account with this email already exists.' });
  });

  test('7. duplicate email with different capitalization -> 409', async () => {
    const email = testEmail('casing');
    assert.equal((await register({ email, password: PASSWORD })).status, 201);
    const { status } = await register({ email: email.toUpperCase(), password: PASSWORD });
    assert.equal(status, 409);
  });

  test('7b. the database itself rejects a differently-cased duplicate', async () => {
    const email = testEmail('dbcasing');
    assert.equal((await register({ email, password: PASSWORD })).status, 201);
    // Bypass the API and the model: insert a mixed-case copy with raw SQL
    await assert.rejects(
      sequelize.query("INSERT INTO users (email, password_hash) VALUES (:email, 'not-a-real-hash')", {
        replacements: { email: email.replace('dbcasing', 'DBCasing') },
      }),
      (error) => error.name === 'SequelizeUniqueConstraintError',
    );
  });

  test('8. email is trimmed and lowercased before saving', async () => {
    const email = testEmail('normalize');
    const { status, body } = await register({ email: `  ${email.toUpperCase()}  `, password: PASSWORD });
    assert.equal(status, 201);
    assert.equal(body.user.email, email);
    assert.equal((await findStoredUser(email)).email, email);
  });

  test('9. incorrect input types -> 400', async () => {
    const cases = [
      [{ email: 12345, password: PASSWORD }, 'email', 'Email must be a string.'],
      [{ email: [testEmail('array')], password: PASSWORD }, 'email', 'Email must be a string.'],
      [{ email: { value: testEmail('object') }, password: PASSWORD }, 'email', 'Email must be a string.'],
      [{ email: testEmail('numberpw'), password: 12345678 }, 'password', 'Password must be a string.'],
      [{ email: testEmail('boolpw'), password: true }, 'password', 'Password must be a string.'],
      [{ email: null, password: null }, 'email', 'Email is required.'],
    ];
    for (const [body, field, message] of cases) {
      const response = await register(body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.errors[field], message, JSON.stringify(body));
    }

    const arrayBody = await register([testEmail('arraybody'), PASSWORD]);
    assert.equal(arrayBody.status, 400);
    assert.ok(arrayBody.body.errors.body);
  });

  test('9b. malformed JSON or a non-JSON body -> 400', async () => {
    const malformed = await register(null, { raw: '{"email": "a@b.pt", "password": ' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.body, { status: 'error', message: 'Request body must be valid JSON.' });

    const formBody = await register(null, { raw: 'email=a@b.pt&password=12345678', contentType: 'application/x-www-form-urlencoded' });
    assert.equal(formBody.status, 400);
    assert.ok(formBody.body.errors.body);
  });

  test('10. the password is stored as a bcrypt hash, not plaintext', async () => {
    const email = testEmail('hashed');
    assert.equal((await register({ email, password: PASSWORD })).status, 201);

    const stored = await findStoredUser(email);
    assert.notEqual(stored.password_hash, PASSWORD);
    assert.ok(!stored.password_hash.includes(PASSWORD));
    assert.match(stored.password_hash, /^\$2[aby]\$\d{2}\$.{53}$/);
    assert.equal(await bcrypt.compare(PASSWORD, stored.password_hash), true);
  });

  test('11. responses never contain the password or its hash', async () => {
    const email = testEmail('noleak');
    const created = await register({ email, password: PASSWORD });
    const duplicate = await register({ email, password: PASSWORD });
    const invalid = await register({ email, password: 'short' });
    const storedHash = (await findStoredUser(email)).password_hash;

    for (const { text } of [created, duplicate, invalid]) {
      assert.ok(!text.includes(PASSWORD), 'plaintext password in response');
      assert.ok(!text.includes(storedHash), 'hash in response');
      assert.ok(!/passwordHash|password_hash|\$2[aby]\$/.test(text), 'hash field in response');
    }
    // The model's toJSON also drops the hash if a user is ever serialized
    const user = await User.findOne({ where: { email } });
    assert.ok(!('passwordHash' in JSON.parse(JSON.stringify(user))));
  });

  test('12. passwords over bcrypt\'s 72-byte limit are rejected, 72 bytes is accepted', async () => {
    const tooLong = await register({ email: testEmail('toolong'), password: 'a'.repeat(73) });
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.body.errors.password, /at most 72 bytes/);

    const tooManyBytes = await register({ email: testEmail('emoji'), password: '😀'.repeat(19) }); // 76 bytes
    assert.equal(tooManyBytes.status, 400);

    const exactly72 = await register({ email: testEmail('max'), password: 'a'.repeat(72) });
    assert.equal(exactly72.status, 201);
  });

  test('13. unexpected database errors -> safe 500', async () => {
    const originalCreate = User.create;
    User.create = async () => {
      const error = new Error('connect ECONNREFUSED postgres://postgres:Secret123@db.example.com:5432/postgres');
      error.sql = 'INSERT INTO "users" ("id","email","password_hash") VALUES ($1,$2,$3)';
      throw error;
    };

    try {
      const { status, body, text } = await register({ email: testEmail('dbdown'), password: PASSWORD });
      assert.equal(status, 500);
      assert.deepEqual(body, { status: 'error', message: 'Something went wrong. Please try again later.' });
      assert.ok(!/Secret123|postgres:|INSERT|ECONNREFUSED|stack|at /.test(text));
    } finally {
      User.create = originalCreate;
    }
  });

  test('extra fields such as id or passwordHash are ignored', async () => {
    const email = testEmail('extrafields');
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const { status, body } = await register({ email, password: PASSWORD, id: fakeId, passwordHash: 'plain', createdAt: '2000-01-01' });

    assert.equal(status, 201);
    assert.notEqual(body.user.id, fakeId);
    assert.notEqual(body.user.createdAt.slice(0, 4), '2000');
    assert.equal(await bcrypt.compare(PASSWORD, (await findStoredUser(email)).password_hash), true);
  });

  test('simultaneous duplicate requests create exactly one account', async () => {
    const email = testEmail('race');
    const responses = await Promise.all(Array.from({ length: 5 }, () => register({ email, password: PASSWORD })));
    const statuses = responses.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409]);
    assert.equal(await User.count({ where: { email } }), 1);
  });
});

describe('existing routes', () => {
  test('GET /api/v1/health still works', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', message: 'Sesh API is running' });
  });

  test('unknown routes still return a JSON 404', async () => {
    const response = await fetch(`${baseUrl}/api/v1/nope`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { status: 'error', message: 'Route not found' });
  });
});
