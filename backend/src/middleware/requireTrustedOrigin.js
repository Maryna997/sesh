import { authConfig } from '../config/auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF protection for cookie-based login.
//
// Browsers attach the session cookie automatically, so another website could
// try to make a signed-in user's browser send a request to our API (e.g. to
// log them out or, later, change their status). Browsers always send an
// Origin header with such cross-site requests, so we reject any request that
// changes data and comes from an origin that isn't our frontend (CLIENT_URL).
//
// Requests without an Origin header (curl, PowerShell, server-to-server) are
// allowed: they don't carry a victim's browser cookies.
// The SameSite cookie setting is a second layer of protection.
export function requireTrustedOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (origin !== undefined && !authConfig.allowedOrigins.includes(origin)) {
    return res.status(403).json({ status: 'error', message: 'Request origin not allowed.' });
  }
  return next();
}
