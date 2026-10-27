// Authentication and browser-security settings, read from environment
// variables and checked once when the server starts. If something is missing
// or unsafe, the server refuses to start with a clear message instead of
// running with weak settings.

const DEFAULT_JWT_EXPIRES_IN_HOURS = 168; // 7 days

function parseExpiresInHours(value) {
  if (value === undefined || value === '') return DEFAULT_JWT_EXPIRES_IN_HOURS;
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    throw new Error('JWT_EXPIRES_IN_HOURS must be a whole number of hours between 1 and 720 (30 days).');
  }
  return hours;
}

function parseSecret(value) {
  if (!value) {
    throw new Error(
      'JWT_SECRET is not set. Add a long random value to backend/.env, for example the output of: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  if (value.length < 32) {
    throw new Error('JWT_SECRET is too short. Use at least 32 random characters.');
  }
  if (/change[-_ ]?me|your[-_ ]?secret|replace/i.test(value)) {
    throw new Error('JWT_SECRET still looks like a placeholder. Generate a real random value.');
  }
  return value;
}

// CLIENT_URL may list several origins separated by commas
// (e.g. the production site and a preview deployment).
function parseAllowedOrigins(value) {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CLIENT_URL is not set. Add the frontend URL to backend/.env, e.g. http://localhost:5173');
  }
  if (origins.includes('*')) {
    // Browsers refuse credentialed requests with a wildcard origin anyway
    throw new Error('CLIENT_URL cannot be "*" because login uses cookies. List the exact frontend URL(s).');
  }
  return origins;
}

function parseSameSite(value) {
  const sameSite = (value || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('COOKIE_SAME_SITE must be lax, strict or none.');
  }
  return sameSite;
}

// Builds the settings from an environment object (process.env in the app;
// tests pass their own objects).
export function loadAuthConfig(env) {
  const isProduction = env.NODE_ENV === 'production';
  const secure = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction;
  const sameSite = parseSameSite(env.COOKIE_SAME_SITE);

  if (sameSite === 'none' && !secure) {
    throw new Error('COOKIE_SAME_SITE=none requires secure cookies (COOKIE_SECURE=true / HTTPS).');
  }
  if (isProduction && !secure) {
    throw new Error('Cookies must be secure in production. Remove COOKIE_SECURE=false.');
  }

  const expiresInHours = parseExpiresInHours(env.JWT_EXPIRES_IN_HOURS);

  return {
    jwt: {
      secret: parseSecret(env.JWT_SECRET),
      algorithm: 'HS256',
      issuer: 'sesh-api',
      audience: 'sesh-web',
      expiresInSeconds: expiresInHours * 60 * 60,
    },
    cookie: {
      name: 'sesh_session',
      options: {
        httpOnly: true, // JavaScript in the page can't read it
        secure, // only sent over HTTPS (production)
        sameSite, // lax: not sent with cross-site POST requests
        path: '/api', // only sent to the API, not to other paths
      },
    },
    allowedOrigins: parseAllowedOrigins(env.CLIENT_URL),
  };
}

// Settings used by the app. Throws (and stops the server) if they are invalid.
export const authConfig = loadAuthConfig(process.env);
