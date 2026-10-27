// Where to send a user after login, kept safe from "open redirects".
//
// When a signed-out visitor opens a protected page, we send them to
// /login?returnTo=/that/page and bring them back after login. Because
// returnTo comes from the URL, anyone could craft a link with
// returnTo=https://evil.example. Only internal app paths are accepted;
// anything else falls back to /discover.

export const DEFAULT_AFTER_LOGIN = '/discover'

// Pages it makes no sense to return to after logging in
const AUTH_PAGES = new Set(['/login', '/register'])

// A dummy origin used only to parse the path safely
const PARSE_BASE = 'http://sesh.invalid'

// Backslashes and control characters (tabs, newlines...) are rejected:
// browsers may treat "/\host" or "/\t/host" as another website.
function hasUnsafeCharacters(value) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (character === '\\' || code < 32 || code === 127) return true
  }
  return false
}

export function getSafeReturnPath(value) {
  if (typeof value !== 'string' || value === '') return DEFAULT_AFTER_LOGIN

  // Must be a path on this site: "/something", but not "//host"
  // (browsers treat that as another website).
  if (!value.startsWith('/') || value.startsWith('//') || hasUnsafeCharacters(value)) {
    return DEFAULT_AFTER_LOGIN
  }

  let url
  try {
    url = new URL(value, PARSE_BASE)
  } catch {
    return DEFAULT_AFTER_LOGIN
  }
  if (url.origin !== PARSE_BASE || AUTH_PAGES.has(url.pathname)) return DEFAULT_AFTER_LOGIN

  return `${url.pathname}${url.search}${url.hash}`
}

// "/login?returnTo=%2Fmessages" for the page the visitor tried to open
export function buildLoginPath(location) {
  const target = `${location.pathname}${location.search}${location.hash}`
  return `/login?returnTo=${encodeURIComponent(target)}`
}
