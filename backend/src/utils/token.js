// Signing and checking session tokens (JWTs).
//
// The token only contains:
//   sub - the user's id
//   jti - the id of the session row in the database (used for logout)
//   iat, exp, iss, aud - standard timing and "who issued it / for whom" claims
// No email, password, hash or profile data is ever put in a token.

import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';

const { secret, algorithm, issuer, audience, expiresInSeconds } = authConfig.jwt;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signSessionToken({ userId, sessionId }) {
  return jwt.sign({}, secret, {
    algorithm,
    subject: userId,
    jwtid: sessionId,
    issuer,
    audience,
    expiresIn: expiresInSeconds,
  });
}

// Returns { userId, sessionId } for a valid token, or null for a missing,
// malformed, tampered, expired or otherwise invalid one.
// Only HS256 is accepted, which also rules out unsigned ("alg: none") tokens.
// `ignoreExpiration` is only used by logout, so an expired session can still
// be cleaned up.
export function verifySessionToken(token, { ignoreExpiration = false } = {}) {
  if (typeof token !== 'string' || token === '') return null;

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [algorithm],
      issuer,
      audience,
      ignoreExpiration,
    });

    if (!UUID_PATTERN.test(payload.sub ?? '') || !UUID_PATTERN.test(payload.jti ?? '')) return null;
    return { userId: payload.sub, sessionId: payload.jti };
  } catch {
    return null;
  }
}
