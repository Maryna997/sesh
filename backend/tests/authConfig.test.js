// Unit tests for authentication settings, cookie reading and startup checks
// (no database needed).
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadAuthConfig } from '../src/config/auth.js';
import { readCookie } from '../src/utils/cookies.js';

const SECRET = 'x'.repeat(48);
const base = { JWT_SECRET: SECRET, CLIENT_URL: 'http://localhost:5173' };

describe('loadAuthConfig', () => {
  test('development defaults: 7-day tokens, HttpOnly, SameSite=Lax, not Secure', () => {
    const config = loadAuthConfig(base);
    assert.equal(config.jwt.expiresInSeconds, 7 * 24 * 60 * 60);
    assert.equal(config.jwt.algorithm, 'HS256');
    assert.deepEqual(config.cookie.options, { httpOnly: true, secure: false, sameSite: 'lax', path: '/api' });
    assert.deepEqual(config.allowedOrigins, ['http://localhost:5173']);
  });

  test('production: cookies are Secure', () => {
    const config = loadAuthConfig({ ...base, NODE_ENV: 'production', CLIENT_URL: 'https://sesh.example' });
    assert.equal(config.cookie.options.secure, true);
    assert.throws(() => loadAuthConfig({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }), /secure in production/);
  });

  test('JWT_EXPIRES_IN_HOURS is configurable within 1-720 hours', () => {
    assert.equal(loadAuthConfig({ ...base, JWT_EXPIRES_IN_HOURS: '24' }).jwt.expiresInSeconds, 86400);
    for (const value of ['0', '721', '1.5', 'week']) {
      assert.throws(() => loadAuthConfig({ ...base, JWT_EXPIRES_IN_HOURS: value }), /JWT_EXPIRES_IN_HOURS/, value);
    }
  });

  test('JWT_SECRET is required, long and not a placeholder', () => {
    assert.throws(() => loadAuthConfig({ ...base, JWT_SECRET: undefined }), /JWT_SECRET is not set/);
    assert.throws(() => loadAuthConfig({ ...base, JWT_SECRET: 'short-secret' }), /too short/);
    assert.throws(() => loadAuthConfig({ ...base, JWT_SECRET: 'change-me-change-me-change-me-change-me' }), /placeholder/);
  });

  test('CLIENT_URL is required and cannot be a wildcard; lists are supported', () => {
    assert.throws(() => loadAuthConfig({ ...base, CLIENT_URL: undefined }), /CLIENT_URL is not set/);
    assert.throws(() => loadAuthConfig({ ...base, CLIENT_URL: '*' }), /cannot be "\*"/);
    assert.deepEqual(
      loadAuthConfig({ ...base, CLIENT_URL: 'https://sesh.example/, https://preview.sesh.example' }).allowedOrigins,
      ['https://sesh.example', 'https://preview.sesh.example'],
    );
  });

  test('SameSite: lax/strict/none; none requires Secure', () => {
    assert.equal(loadAuthConfig({ ...base, COOKIE_SAME_SITE: 'Strict' }).cookie.options.sameSite, 'strict');
    assert.throws(() => loadAuthConfig({ ...base, COOKIE_SAME_SITE: 'none' }), /requires secure/);
    assert.equal(loadAuthConfig({ ...base, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'true' }).cookie.options.sameSite, 'none');
    assert.throws(() => loadAuthConfig({ ...base, COOKIE_SAME_SITE: 'sometimes' }), /COOKIE_SAME_SITE/);
  });
});

describe('readCookie', () => {
  const req = (cookie) => ({ headers: cookie === undefined ? {} : { cookie } });

  test('finds a cookie among others', () => {
    assert.equal(readCookie(req('theme=dark; sesh_session=abc.def.ghi; other=1'), 'sesh_session'), 'abc.def.ghi');
    assert.equal(readCookie(req('sesh_session=abc'), 'sesh_session'), 'abc');
  });

  test('returns null when missing or unreadable', () => {
    assert.equal(readCookie(req(undefined), 'sesh_session'), null);
    assert.equal(readCookie(req('theme=dark'), 'sesh_session'), null);
    assert.equal(readCookie(req('xsesh_session=abc'), 'sesh_session'), null);
    assert.equal(readCookie(req('sesh_session=%E0%A4%A'), 'sesh_session'), null);
  });
});

describe('server startup', () => {
  test('refuses to start without JWT_SECRET', () => {
    const backendDir = fileURLToPath(new URL('..', import.meta.url));
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: backendDir,
      // An empty value stops dotenv from loading one from .env
      env: { ...process.env, JWT_SECRET: '', NODE_ENV: 'development', PORT: '0' },
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET is not set/);
    assert.ok(!result.stderr.includes(process.env.DATABASE_URL ?? '<<none>>'), 'no connection string in the output');
  });
});
