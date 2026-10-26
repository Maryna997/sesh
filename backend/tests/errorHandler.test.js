// Unit tests for the error handler (no database needed).
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';

// Minimal stand-in for Express's response object
function fakeResponse() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('errorHandler', () => {
  test('malformed JSON -> 400', () => {
    const res = fakeResponse();
    errorHandler(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' }), {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { status: 'error', message: 'Request body must be valid JSON.' });
  });

  test('unexpected error -> generic 500 without internal details', () => {
    const res = fakeResponse();
    const error = new Error('connect ECONNREFUSED postgres://postgres:Secret123@db.example.com:5432/postgres');
    error.stack = 'Error: at Database.query (/app/src/db/index.js:10:5)';
    error.sql = 'INSERT INTO "users" ("password_hash") VALUES ($1)';
    errorHandler(error, { body: { password: 'my secret password' } }, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { status: 'error', message: 'Something went wrong. Please try again later.' });
  });

  test('server log never includes the request body or SQL', () => {
    const logged = [];
    const originalError = console.error;
    const originalEnv = process.env.NODE_ENV;
    console.error = (...args) => logged.push(args.join(' '));
    process.env.NODE_ENV = 'development'; // logging is silenced in tests otherwise

    try {
      const error = Object.assign(new Error('relation "users" does not exist'), {
        name: 'SequelizeDatabaseError',
        sql: 'INSERT INTO "users" ...',
        parameters: ['surfer@example.com', '$2b$12$abcdefghijklmnopqrstuv'],
      });
      errorHandler(error, { body: { email: 'surfer@example.com', password: 'my secret password' } }, fakeResponse(), () => {});
    } finally {
      console.error = originalError;
      process.env.NODE_ENV = originalEnv;
    }

    assert.equal(logged.length, 1);
    assert.equal(logged[0], 'Unexpected error: SequelizeDatabaseError: relation "users" does not exist');
    assert.ok(!/my secret password|\$2b\$|INSERT INTO/.test(logged[0]));
  });
});
