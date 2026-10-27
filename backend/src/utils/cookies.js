// Reads one cookie from the request's Cookie header, e.g.
// "theme=dark; sesh_session=eyJ..." -> readCookie(req, 'sesh_session') === 'eyJ...'
// (A small helper instead of adding a cookie-parsing dependency.)
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}
