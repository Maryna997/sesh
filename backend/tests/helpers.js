// Helpers shared by the API tests. Import './setup.js' before this file.
import { once } from 'node:events';
import { Op } from 'sequelize';
import app from '../src/app.js';
import { User } from '../src/models/User.js';

// Reserved test domain (.invalid never exists), so tests can only ever
// create and delete their own accounts. Deleting a user also deletes its
// sessions (ON DELETE CASCADE).
export const TEST_DOMAIN = '@sesh-test.invalid';
const RUN_ID = Date.now().toString(36);
export const testEmail = (name) => `${name}-${RUN_ID}${TEST_DOMAIN}`;

export function deleteTestUsers() {
  return User.destroy({ where: { email: { [Op.like]: `%${TEST_DOMAIN}` } } });
}

export async function startServer() {
  const server = app.listen(0);
  await once(server, 'listening');
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

// Small fetch wrapper: sends JSON, an optional session cookie and Origin,
// and returns status, parsed body, raw text and Set-Cookie headers.
export async function request(baseUrl, path, { method = 'GET', body, cookie, origin, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(cookie !== undefined && { Cookie: `sesh_session=${cookie}` }),
      ...(origin && { Origin: origin }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text, headers: response.headers, setCookies: response.headers.getSetCookie() };
}

// The sesh_session Set-Cookie header from a response (or undefined)
export function sessionSetCookie(response) {
  return response.setCookies.find((header) => header.startsWith('sesh_session='));
}

// The token value from the sesh_session Set-Cookie header
export function sessionToken(response) {
  const header = sessionSetCookie(response);
  return header ? header.slice('sesh_session='.length).split(';')[0] : undefined;
}
