import { Op } from 'sequelize';
import { authConfig } from '../config/auth.js';
import { Session } from '../models/Session.js';
import { readCookie } from '../utils/cookies.js';
import { verifySessionToken } from '../utils/token.js';

const { name: COOKIE_NAME, options: COOKIE_OPTIONS } = authConfig.cookie;

// Same response for every kind of failure (no cookie, bad token, expired,
// logged out...), so callers can't tell the cases apart.
export function rejectUnauthenticated(req, res) {
  // If the browser sent a cookie that no longer works, ask it to remove it
  if (readCookie(req, COOKIE_NAME)) {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  }
  return res.status(401).json({ status: 'error', message: 'Authentication required.' });
}

// Protects a route: only signed-in users get through.
//
// 1. Reads the session token from the HttpOnly cookie.
// 2. Checks the JWT signature, algorithm, issuer, audience and expiry.
// 3. Checks the session still exists in the database and hasn't expired
//    (logging out deletes it, so old tokens stop working).
// 4. Adds req.auth = { userId, sessionId } for the route handler.
//
// Usage: router.get('/me', requireAuth, handler)
export async function requireAuth(req, res, next) {
  const claims = verifySessionToken(readCookie(req, COOKIE_NAME));
  if (!claims) return rejectUnauthenticated(req, res);

  const session = await Session.findOne({
    where: {
      id: claims.sessionId,
      userId: claims.userId,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
  if (!session) return rejectUnauthenticated(req, res);

  req.auth = { userId: claims.userId, sessionId: claims.sessionId };
  return next();
}
