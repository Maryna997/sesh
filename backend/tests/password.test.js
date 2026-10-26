// Unit tests for password hashing (no database needed).
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DEFAULT_BCRYPT_ROUNDS, hashPassword, parseBcryptRounds } from '../src/utils/password.js';

describe('parseBcryptRounds', () => {
  test('defaults to 12 when not set', () => {
    assert.equal(DEFAULT_BCRYPT_ROUNDS, 12);
    assert.equal(parseBcryptRounds(undefined), 12);
    assert.equal(parseBcryptRounds(''), 12);
  });

  test('accepts whole numbers from 4 to 15', () => {
    assert.equal(parseBcryptRounds('4'), 4);
    assert.equal(parseBcryptRounds('13'), 13);
  });

  test('rejects invalid values', () => {
    for (const value of ['3', '16', '10.5', 'twelve']) {
      assert.throws(() => parseBcryptRounds(value), /BCRYPT_ROUNDS/, value);
    }
  });
});

describe('hashPassword', () => {
  test('returns a bcrypt hash, not the password', async () => {
    const hash = await hashPassword('correct horse');
    assert.match(hash, /^\$2[aby]\$04\$[./A-Za-z0-9]{53}$/);
    assert.ok(!hash.includes('correct horse'));
    assert.equal(await bcrypt.compare('correct horse', hash), true);
    assert.equal(await bcrypt.compare('wrong horse', hash), false);
  });

  test('uses a random salt (same password, different hashes)', async () => {
    assert.notEqual(await hashPassword('same password'), await hashPassword('same password'));
  });

  test('normalizes Unicode so both spellings of "é" match', async () => {
    const hash = await hashPassword('café surfing'); // é as one character
    assert.equal(await bcrypt.compare('café surfing'.normalize('NFC'), hash), true); // e + accent, normalized
  });
});
