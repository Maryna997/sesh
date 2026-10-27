// Small wrapper around fetch for talking to the Sesh API.
//
// - All requests use relative paths under /api/v1. In development, Vite
//   forwards /api to the Express backend (see vite.config.js); in production,
//   the hosting platform will forward /api to the deployed backend. The
//   browser only ever talks to the frontend's own origin, so the session
//   cookie stays first-party.
// - credentials: 'include' makes the browser send and accept the HttpOnly
//   session cookie. JavaScript never sees or stores the token itself.
// - Every failure becomes an ApiError with a `kind`, so forms can show a
//   clear message without exposing technical details.

const API_BASE = '/api/v1'

export class ApiError extends Error {
  // kind: 'network'    - the request never got a response (offline, server down)
  //       'http'       - the server answered with an error status (400, 401, 409, 500...)
  //       'unexpected' - the response wasn't the JSON we expected
  constructor(kind, { status = null, message = '', fieldErrors = null } = {}) {
    super(message || kind)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function readJson(response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function apiRequest(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network')
  }

  const data = await readJson(response)

  if (!response.ok) {
    throw new ApiError('http', {
      status: response.status,
      message: data?.message ?? '',
      fieldErrors: data?.errors ?? null,
    })
  }

  // A successful response must be JSON. Anything else (e.g. an HTML page
  // returned because the API isn't reachable at /api) is treated as an error.
  if (data === null) {
    throw new ApiError('unexpected', { status: response.status })
  }

  return data
}
