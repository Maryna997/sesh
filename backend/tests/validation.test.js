// Unit tests for registration validation (no database needed).
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateRegistration } from '../src/utils/validation.js';

const VALID_PASSWORD = 'correct horse';

describe('normalizeEmail', () => {
  test('trims whitespace and lowercases', () => {
    assert.equal(normalizeEmail('  Surfer@Example.COM \n'), 'surfer@example.com');
  });
});

describe('validateRegistration', () => {
  test('accepts valid input and returns the normalized email', () => {
    const result = validateRegistration({ email: ' Surfer@Example.com ', password: VALID_PASSWORD });
    assert.deepEqual(result, { data: { email: 'surfer@example.com', password: VALID_PASSWORD } });
  });

  test('does not trim the password', () => {
    const result = validateRegistration({ email: 'a@b.pt', password: '  spaces  ' });
    assert.equal(result.data.password, '  spaces  ');
  });

  test('rejects a body that is not an object', () => {
    for (const body of [undefined, null, 'text', 42, ['a@b.pt', 'password']]) {
      assert.ok(validateRegistration(body).errors.body, `body ${JSON.stringify(body)}`);
    }
  });

  test('requires email and password', () => {
    for (const value of [undefined, null, '']) {
      const { errors } = validateRegistration({ email: value, password: value });
      assert.equal(errors.email, 'Email is required.');
      assert.equal(errors.password, 'Password is required.');
    }
    assert.equal(validateRegistration({ email: '   ', password: VALID_PASSWORD }).errors.email, 'Email is required.');
  });

  test('rejects wrong types', () => {
    for (const value of [123, true, ['a@b.pt'], { address: 'a@b.pt' }]) {
      const { errors } = validateRegistration({ email: value, password: value });
      assert.equal(errors.email, 'Email must be a string.');
      assert.equal(errors.password, 'Password must be a string.');
    }
  });

  test('rejects malformed emails', () => {
    for (const email of ['plainaddress', 'no-at-sign.pt', 'x@y', '@example.com', 'a b@c.pt', 'a@b c.pt', 'two@@example.com']) {
      assert.equal(
        validateRegistration({ email, password: VALID_PASSWORD }).errors?.email,
        'Enter a valid email address, like you@example.com.',
        email,
      );
    }
  });

  test('rejects emails longer than 254 characters', () => {
    const email = `${'a'.repeat(245)}@example.pt`; // 256 characters
    assert.match(validateRegistration({ email, password: VALID_PASSWORD }).errors.email, /at most 254/);
  });

  test('requires at least 8 characters, counting emoji as one', () => {
    assert.equal(validateRegistration({ email: 'a@b.pt', password: '1234567' }).errors.password, 'Password must be at least 8 characters.');
    assert.ok(validateRegistration({ email: 'a@b.pt', password: '12345678' }).data);
    assert.ok(validateRegistration({ email: 'a@b.pt', password: '🌊🌊🌊🌊🌊🌊🌊' }).errors.password); // 7 characters
    assert.ok(validateRegistration({ email: 'a@b.pt', password: 'alllowercase' }).data); // no complexity rules
  });

  test('rejects passwords longer than 72 bytes (bcrypt limit)', () => {
    assert.ok(validateRegistration({ email: 'a@b.pt', password: 'a'.repeat(72) }).data);
    assert.match(validateRegistration({ email: 'a@b.pt', password: 'a'.repeat(73) }).errors.password, /at most 72 bytes/);
    // 18 emoji = 72 bytes (OK), 19 emoji = 76 bytes (too long) although only 19 characters
    assert.ok(validateRegistration({ email: 'a@b.pt', password: '😀'.repeat(18) }).data);
    assert.ok(validateRegistration({ email: 'a@b.pt', password: '😀'.repeat(19) }).errors.password);
  });

  test('measures bytes after Unicode normalization', () => {
    // "e" + combining accent = 3 bytes; normalized "é" = 2 bytes.
    // 30 decomposed letters = 90 bytes raw, but 60 bytes once normalized.
    assert.ok(validateRegistration({ email: 'a@b.pt', password: 'é'.repeat(30) }).data);
  });
});
