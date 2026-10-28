// Calls to the backend authentication endpoints (see docs for contracts).
// The session itself lives in an HttpOnly cookie managed by the browser.
import { apiRequest } from './client'

// POST /api/v1/auth/register -> { user }. Creates the account; does not log in.
export function registerAccount({ email, password }) {
  return apiRequest('/auth/register', { method: 'POST', body: { email, password } })
}

// POST /api/v1/auth/login -> { user }, and sets the session cookie.
export function logIn({ email, password }) {
  return apiRequest('/auth/login', { method: 'POST', body: { email, password } })
}

// POST /api/v1/auth/logout -> ends the session on the server and clears the cookie.
export function logOut() {
  return apiRequest('/auth/logout', { method: 'POST' })
}

// GET /api/v1/auth/me -> { user, hasCompletedProfile } when signed in; 401 otherwise.
export function getCurrentUser() {
  return apiRequest('/auth/me')
}
