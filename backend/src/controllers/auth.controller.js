import { Op, UniqueConstraintError, fn, col, where } from 'sequelize';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { authConfig } from '../config/auth.js';
import { validateLogin, validateRegistration } from '../utils/validation.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signSessionToken, verifySessionToken } from '../utils/token.js';
import { readCookie } from '../utils/cookies.js';
import { rejectUnauthenticated } from '../middleware/requireAuth.js';

const { name: COOKIE_NAME, options: COOKIE_OPTIONS } = authConfig.cookie;
const SESSION_LIFETIME_MS = authConfig.jwt.expiresInSeconds * 1000;

// The only user fields ever sent to the client
function toPublicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

// POST /api/v1/auth/register
// Creates an account from { email, password }. It does not log the user in.
export async function register(req, res) {
  const { errors, data } = validateRegistration(req.body);

  if (errors) {
    return res.status(400).json({
      status: 'error',
      message: 'Please check the registration details.',
      errors,
    });
  }

  const passwordHash = await hashPassword(data.password);

  try {
    // Only email and passwordHash are passed on: any other fields in the
    // request body (e.g. an "id") are ignored.
    const user = await User.create({ email: data.email, passwordHash });

    return res.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    // We don't check "does this email exist?" first: two requests could pass
    // that check at the same time. The database's unique index is the real
    // guard, and this turns its error into a clear 409 response.
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        status: 'error',
        message: 'An account with this email already exists.',
      });
    }

    // Anything else is unexpected: the error handler returns a safe 500.
    throw error;
  }
}

// POST /api/v1/auth/login
// Checks { email, password }, creates a session and sets it as an HttpOnly
// cookie. The token is not included in the JSON response.
export async function login(req, res) {
  const { errors, data } = validateLogin(req.body);

  if (errors) {
    return res.status(400).json({
      status: 'error',
      message: 'Please check the login details.',
      errors,
    });
  }

  // Emails are stored lowercase; matching lower(email) also uses the unique index
  const user = await User.findOne({ where: where(fn('lower', col('email')), data.email) });

  // Same message for "no such email" and "wrong password", so the response
  // doesn't reveal which emails have accounts.
  const passwordMatches = await verifyPassword(data.password, user?.passwordHash ?? null);
  if (!user || !passwordMatches) {
    return res.status(401).json({ status: 'error', message: 'Incorrect email or password.' });
  }

  // Tidy up this user's expired sessions while we're here
  await Session.destroy({ where: { userId: user.id, expiresAt: { [Op.lte]: new Date() } } });

  const session = await Session.create({
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
  });
  const token = signSessionToken({ userId: user.id, sessionId: session.id });

  res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: SESSION_LIFETIME_MS });
  return res.status(200).json({ user: toPublicUser(user) });
}

// POST /api/v1/auth/logout
// Deletes the session in the database (so the token can't be reused) and
// clears the cookie. Safe to call when already logged out.
export async function logout(req, res) {
  // Expired tokens are accepted here too, so their session row is removed.
  // The signature is still checked, so a forged token can't delete anything.
  const claims = verifySessionToken(readCookie(req, COOKIE_NAME), { ignoreExpiration: true });

  if (claims) {
    await Session.destroy({ where: { id: claims.sessionId, userId: claims.userId } });
  }

  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  return res.status(200).json({ status: 'ok', message: 'Logged out.' });
}

// GET /api/v1/auth/me (protected by requireAuth)
// Returns the signed-in user's account details.
export async function me(req, res) {
  const user = await User.findByPk(req.auth.userId);

  // The account was deleted after this session was created
  if (!user) return rejectUnauthenticated(req, res);

  return res.status(200).json({ user: toPublicUser(user) });
}
