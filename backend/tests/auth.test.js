// API tests for login, logout, sessions and GET /api/v1/auth/me.
//
// Like register.test.js, these use the test database (TEST_DATABASE_URL, or
// DATABASE_URL when that isn't set) and only touch @sesh-test.invalid accounts,
// which are deleted before and after the run together with their sessions.
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { sequelize } from '../src/db/index.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { deleteTestUsers, request, sessionSetCookie, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;
const EVIL_ORIGIN = 'https://evil.example';
const AUTH_REQUIRED = { status: 'error', message: 'Authentication required.' };
const BAD_CREDENTIALS = { status: 'error', message: 'Incorrect email or password.' };

let server;
let baseUrl;
const call = (path, options) => request(baseUrl, path, options);

async function createAccount(name, password = PASSWORD) {
  const email = testEmail(name);
  const response = await call('/api/v1/auth/register', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 201, `register ${email}`);
  return { email, id: response.body.user.id };
}

async function login(email, password = PASSWORD, options = {}) {
  const response = await call('/api/v1/auth/login', { method: 'POST', body: { email, password }, ...options });
  return { response, token: sessionToken(response) };
}

const me = (token, options = {}) => call('/api/v1/auth/me', { cookie: token, ...options });
const logout = (token, options = {}) => call('/api/v1/auth/logout', { method: 'POST', cookie: token, ...options });

// Signs a token with arbitrary claims, to test tampered or expired tokens
function signToken(claims, { secret = process.env.JWT_SECRET, ...options } = {}) {
  return jwt.sign(claims, secret, { algorithm: 'HS256', issuer: 'sesh-api', audience: 'sesh-web', ...options });
}

before(async () => {
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());
});

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('POST /api/v1/auth/login', () => {
  test('1. valid credentials: 200, safe user data and a session cookie', async () => {
    const account = await createAccount('login-ok');
    const { response, token } = await login(account.email);

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ['user']);
    assert.deepEqual(Object.keys(response.body.user).sort(), ['createdAt', 'email', 'id']);
    assert.equal(response.body.user.id, account.id);
    assert.equal(response.body.user.email, account.email);
    assert.ok(token, 'session cookie set');
    assert.ok(!response.text.includes(token), 'token is not in the JSON body');

    // One session row, expiring in about a week
    const sessions = await Session.findAll({ where: { userId: account.id } });
    assert.equal(sessions.length, 1);
    const secondsLeft = (sessions[0].expiresAt.getTime() - Date.now()) / 1000;
    assert.ok(Math.abs(secondsLeft - ONE_WEEK_SECONDS) < 60, `expires in ${secondsLeft}s`);
  });

  test('session cookie is HttpOnly, SameSite=Lax, scoped to /api, 7 days', async () => {
    const account = await createAccount('cookie-flags');
    const { response } = await login(account.email);
    const header = sessionSetCookie(response);

    assert.match(header, /; HttpOnly/);
    assert.match(header, /; SameSite=Lax/);
    assert.match(header, /; Path=\/api(;|$)/);
    assert.match(header, new RegExp(`; Max-Age=${ONE_WEEK_SECONDS}(;|$)`));
    assert.doesNotMatch(header, /; Secure/, 'Secure is only added in production (see authConfig tests)');
  });

  test('2. wrong password: 401 with a generic message, no cookie', async () => {
    const account = await createAccount('wrong-pw');
    const { response, token } = await login(account.email, 'not the password');
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, BAD_CREDENTIALS);
    assert.equal(token, undefined);
    assert.equal(await Session.count({ where: { userId: account.id } }), 0);
  });

  test('3. unknown email: exactly the same 401 response', async () => {
    const { response, token } = await login(testEmail('nobody'));
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, BAD_CREDENTIALS);
    assert.equal(token, undefined);
  });

  test('4. email is normalized (case and spaces)', async () => {
    const account = await createAccount('normalize-login');
    const { response } = await login(`   ${account.email.toUpperCase()}  `);
    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, account.email);
  });

  test('5. missing email or password: 400', async () => {
    const noEmail = await call('/api/v1/auth/login', { method: 'POST', body: { password: PASSWORD } });
    assert.equal(noEmail.status, 400);
    assert.equal(noEmail.body.errors.email, 'Email is required.');

    const noPassword = await call('/api/v1/auth/login', { method: 'POST', body: { email: testEmail('x') } });
    assert.equal(noPassword.status, 400);
    assert.equal(noPassword.body.errors.password, 'Password is required.');

    const noBody = await call('/api/v1/auth/login', { method: 'POST' });
    assert.equal(noBody.status, 400);
    assert.ok(noBody.body.errors.body);

    const badEmail = await call('/api/v1/auth/login', { method: 'POST', body: { email: 'not-an-email', password: PASSWORD } });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.body.errors.email, 'Enter a valid email address, like you@example.com.');
  });

  test('6. invalid input types: 400', async () => {
    const cases = [
      [{ email: 42, password: PASSWORD }, 'email', 'Email must be a string.'],
      [{ email: [testEmail('a')], password: PASSWORD }, 'email', 'Email must be a string.'],
      [{ email: testEmail('a'), password: 12345678 }, 'password', 'Password must be a string.'],
      [{ email: testEmail('a'), password: { value: PASSWORD } }, 'password', 'Password must be a string.'],
    ];
    for (const [body, field, message] of cases) {
      const response = await call('/api/v1/auth/login', { method: 'POST', body });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.errors[field], message);
    }
    const arrayBody = await call('/api/v1/auth/login', { method: 'POST', body: [testEmail('a'), PASSWORD] });
    assert.equal(arrayBody.status, 400);
  });

  test('7. Unicode passwords: both spellings of "é" work, as in registration', async () => {
    const composed = 'café au lait surf'; // é as one character
    const decomposed = 'café au lait surf'; // e + combining accent

    const a = await createAccount('unicode-a', decomposed);
    assert.equal((await login(a.email, composed)).response.status, 200);
    assert.equal((await login(a.email, decomposed)).response.status, 200);

    const b = await createAccount('unicode-b', composed);
    assert.equal((await login(b.email, decomposed)).response.status, 200);
  });

  test('8. responses never contain the password, hash or token', async () => {
    const account = await createAccount('no-leak-login');
    const ok = await login(account.email);
    const bad = await login(account.email, 'wrong password!');
    for (const { text } of [ok.response, bad.response]) {
      assert.ok(!text.includes(PASSWORD));
      assert.ok(!/passwordHash|password_hash|\$2[aby]\$/.test(text));
      assert.ok(!/eyJ/.test(text), 'no JWT in the body');
    }
  });

  test('passwords over 72 bytes never log in (no bcrypt truncation)', async () => {
    const seventyTwo = 'a'.repeat(72);
    const account = await createAccount('truncation', seventyTwo);
    assert.equal((await login(account.email, seventyTwo)).response.status, 200);
    // bcrypt alone would accept this, because it ignores bytes after 72
    const { response } = await login(account.email, `${seventyTwo}EXTRA`);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, BAD_CREDENTIALS);
  });
});

describe('session token (JWT)', () => {
  test('contains only sub, jti and standard claims, signed with HS256', async () => {
    const account = await createAccount('claims');
    const { token } = await login(account.email);
    const { header, payload } = jwt.decode(token, { complete: true });

    assert.equal(header.alg, 'HS256');
    assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'sub']);
    assert.equal(payload.sub, account.id);
    assert.equal(payload.iss, 'sesh-api');
    assert.equal(payload.aud, 'sesh-web');
    assert.equal(payload.exp - payload.iat, ONE_WEEK_SECONDS);
    assert.ok(await Session.findByPk(payload.jti), 'jti is the session id');
    assert.ok(!JSON.stringify(payload).includes(account.email));
  });

  test('9. a valid session cookie authenticates', async () => {
    const account = await createAccount('valid-token');
    const { token } = await login(account.email);
    const response = await me(token);
    assert.equal(response.status, 200);
  });

  test('10. missing credentials: 401', async () => {
    const response = await me(undefined);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, AUTH_REQUIRED);
  });

  test('11. malformed credentials: 401 and the cookie is cleared', async () => {
    for (const token of ['not-a-jwt', 'a.b.c', '', 'eyJhbGciOiJIUzI1NiJ9.e30', '%E0%A4%A']) {
      const response = await me(token);
      assert.equal(response.status, 401, JSON.stringify(token));
      assert.deepEqual(response.body, AUTH_REQUIRED);
    }
    const response = await me('not-a-jwt');
    assert.match(sessionSetCookie(response), /^sesh_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  test('12. invalid signature, wrong algorithm, issuer or audience: 401', async () => {
    const account = await createAccount('tampered');
    const { token } = await login(account.email);
    const { sub, jti } = jwt.decode(token);
    const claims = { sub, jti };

    const forged = [
      signToken(claims, { secret: 'a-completely-different-secret-value-1234567890', expiresIn: 3600 }),
      signToken(claims, { issuer: 'someone-else', expiresIn: 3600 }),
      signToken(claims, { audience: 'another-app', expiresIn: 3600 }),
      jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS512', issuer: 'sesh-api', audience: 'sesh-web', expiresIn: 3600 }),
      jwt.sign(claims, null, { algorithm: 'none', issuer: 'sesh-api', audience: 'sesh-web', expiresIn: 3600 }),
      // Same payload, signature of a different token
      `${token.split('.').slice(0, 2).join('.')}.${signToken({ other: 1 }, { expiresIn: 60 }).split('.')[2]}`,
    ];
    for (const forgedToken of forged) {
      assert.equal((await me(forgedToken)).status, 401, jwt.decode(forgedToken, { complete: true })?.header.alg);
    }
    // The genuine token still works
    assert.equal((await me(token)).status, 200);
  });

  test('13. expired token: 401', async () => {
    const account = await createAccount('expired');
    const { token } = await login(account.email);
    const { sub, jti } = jwt.decode(token);

    const expired = signToken({ sub, jti, exp: Math.floor(Date.now() / 1000) - 60 });
    assert.equal((await me(expired)).status, 401);
  });

  test('session expired in the database: 401 even if the JWT is still valid', async () => {
    const account = await createAccount('db-expired');
    const { token } = await login(account.email);
    await Session.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { userId: account.id } });
    assert.equal((await me(token)).status, 401);
  });

  test('token for a session that does not exist: 401', async () => {
    const account = await createAccount('no-session');
    const madeUp = signToken({ sub: account.id, jti: '6f1c9d1e-0000-4000-8000-000000000000' }, { expiresIn: 3600 });
    assert.equal((await me(madeUp)).status, 401);
  });

  test('token whose user id does not match the session: 401', async () => {
    const a = await createAccount('owner-a');
    const b = await createAccount('owner-b');
    const { token } = await login(a.email);
    const { jti } = jwt.decode(token);
    const swapped = signToken({ sub: b.id, jti }, { expiresIn: 3600 });
    assert.equal((await me(swapped)).status, 401);
  });

  test('14. revoked session (after logout): 401', async () => {
    const account = await createAccount('revoked');
    const { token } = await login(account.email);
    assert.equal((await logout(token)).status, 200);
    const response = await me(token);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, AUTH_REQUIRED);
  });

  test('15. deleted user: sessions are removed and the token stops working', async () => {
    const account = await createAccount('deleted');
    const { token } = await login(account.email);
    assert.equal((await me(token)).status, 200);

    await User.destroy({ where: { id: account.id } });
    assert.equal(await Session.count({ where: { userId: account.id } }), 0, 'sessions cascade-deleted');
    assert.equal((await me(token)).status, 401);
  });
});

describe('GET /api/v1/auth/me', () => {
  test('16. returns the signed-in user (and only that user)', async () => {
    const a = await createAccount('me-a');
    const b = await createAccount('me-b');
    const tokenA = (await login(a.email)).token;
    const tokenB = (await login(b.email)).token;

    const responseA = await me(tokenA);
    assert.equal(responseA.status, 200);
    assert.deepEqual(Object.keys(responseA.body.user).sort(), ['createdAt', 'email', 'id']);
    assert.equal(responseA.body.user.id, a.id);
    assert.equal(responseA.body.user.email, a.email);
    assert.ok(!/passwordHash|password_hash|\$2[aby]\$/.test(responseA.text));

    assert.equal((await me(tokenB)).body.user.email, b.email);
  });

  test('17. 401 without valid authentication', async () => {
    assert.deepEqual((await me(undefined)).body, AUTH_REQUIRED);
    assert.equal((await me('garbage')).status, 401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  test('18. logs out: 200, session deleted, cookie cleared', async () => {
    const account = await createAccount('logout');
    const { token } = await login(account.email);
    const { jti } = jwt.decode(token);

    const response = await logout(token);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', message: 'Logged out.' });
    assert.match(sessionSetCookie(response), /^sesh_session=;.*Path=\/api;.*Expires=Thu, 01 Jan 1970/);
    assert.equal(await Session.findByPk(jti), null);
  });

  test('19. the old cookie cannot be reused after logout', async () => {
    const account = await createAccount('reuse');
    const { token } = await login(account.email);
    await logout(token);
    assert.equal((await me(token)).status, 401);
  });

  test('20. repeated or anonymous logout is safe', async () => {
    const account = await createAccount('repeat');
    const { token } = await login(account.email);
    assert.equal((await logout(token)).status, 200);
    assert.equal((await logout(token)).status, 200);
    assert.equal((await logout(undefined)).status, 200);
    assert.equal((await logout('garbage')).status, 200);
  });

  test('logging out one device keeps other sessions signed in', async () => {
    const account = await createAccount('two-devices');
    const phone = (await login(account.email)).token;
    const laptop = (await login(account.email)).token;
    await logout(phone);
    assert.equal((await me(phone)).status, 401);
    assert.equal((await me(laptop)).status, 200);
  });

  test('an expired token still removes its session on logout', async () => {
    const account = await createAccount('expired-logout');
    const { token } = await login(account.email);
    const { sub, jti } = jwt.decode(token);
    const expired = signToken({ sub, jti, exp: Math.floor(Date.now() / 1000) - 60 });
    assert.equal((await logout(expired)).status, 200);
    assert.equal(await Session.findByPk(jti), null);
  });

  test('a forged token cannot delete someone else\'s session', async () => {
    const account = await createAccount('forged-logout');
    const { token } = await login(account.email);
    const { sub, jti } = jwt.decode(token);
    const forged = signToken({ sub, jti }, { secret: 'attacker-secret-attacker-secret-attacker!', expiresIn: 3600 });
    await logout(forged);
    assert.equal((await me(token)).status, 200);
  });

  test('login cleans up the user\'s expired sessions', async () => {
    const account = await createAccount('cleanup');
    await login(account.email);
    await Session.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { userId: account.id } });
    await login(account.email);
    assert.equal(await Session.count({ where: { userId: account.id } }), 1);
  });
});

describe('CSRF and CORS', () => {
  test('state-changing requests from another website are rejected (403)', async () => {
    const account = await createAccount('csrf');
    const { token } = await login(account.email);

    const crossSiteLogout = await logout(token, { origin: EVIL_ORIGIN });
    assert.equal(crossSiteLogout.status, 403);
    assert.deepEqual(crossSiteLogout.body, { status: 'error', message: 'Request origin not allowed.' });
    assert.equal((await me(token)).status, 200, 'session survived');

    const crossSiteLogin = await login(account.email, PASSWORD, { origin: EVIL_ORIGIN });
    assert.equal(crossSiteLogin.response.status, 403);
    assert.equal(crossSiteLogin.token, undefined);

    const crossSiteRegister = await call('/api/v1/auth/register', {
      method: 'POST',
      origin: 'null',
      body: { email: testEmail('csrf-register'), password: PASSWORD },
    });
    assert.equal(crossSiteRegister.status, 403);
  });

  test('requests from the frontend origin are allowed', async () => {
    const account = await createAccount('same-origin');
    const { response, token } = await login(account.email, PASSWORD, { origin: TEST_CLIENT_ORIGIN });
    assert.equal(response.status, 200);
    assert.equal((await logout(token, { origin: TEST_CLIENT_ORIGIN })).status, 200);
  });

  test('CORS allows credentials for the frontend origin only', async () => {
    const preflight = (origin) =>
      call('/api/v1/auth/login', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });

    const allowed = await preflight(TEST_CLIENT_ORIGIN);
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), TEST_CLIENT_ORIGIN);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

    const denied = await preflight(EVIL_ORIGIN);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);

    const meFromEvil = await me(undefined, { origin: EVIL_ORIGIN });
    assert.equal(meFromEvil.headers.get('access-control-allow-origin'), null, 'other sites cannot read /me');
  });
});

describe('regression', () => {
  test('21. registration still works and returns the same shape', async () => {
    const email = testEmail('regression');
    const response = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body.user).sort(), ['createdAt', 'email', 'id']);
    assert.equal(sessionSetCookie(response), undefined, 'registering does not log in');
  });

  test('22. health endpoint stays public, with or without a cookie', async () => {
    for (const cookie of [undefined, 'garbage']) {
      const response = await call('/api/v1/health', { cookie });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { status: 'ok', message: 'Sesh API is running' });
    }
  });

  test('23. 404 and malformed JSON handling are unchanged', async () => {
    const notFound = await call('/api/v1/nope');
    assert.deepEqual([notFound.status, notFound.body], [404, { status: 'error', message: 'Route not found' }]);

    const malformed = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { status: 'error', message: 'Request body must be valid JSON.' });
  });

  test('unexpected database errors during login return a safe 500', async () => {
    const original = User.findOne;
    User.findOne = async () => {
      throw new Error('connect ECONNREFUSED postgres://postgres:Secret123@db.example.com:5432/postgres');
    };
    try {
      const { response } = await login(testEmail('db-down'));
      assert.equal(response.status, 500);
      assert.deepEqual(response.body, { status: 'error', message: 'Something went wrong. Please try again later.' });
      assert.ok(!/Secret123|postgres:/.test(response.text));
    } finally {
      User.findOne = original;
    }
  });
});
