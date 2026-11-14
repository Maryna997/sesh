// Account settings (Settings & Privacy). The account is always the signed-in
// user's; no user id is ever sent.
import { apiRequest } from './client'

// PUT /api/v1/account/email { newEmail } -> { user }. Immediate, no verification email.
export function changeEmail(newEmail) {
  return apiRequest('/account/email', { method: 'PUT', body: { newEmail } })
}

// PUT /api/v1/account/password { currentPassword, newPassword } -> { status, message }.
// The server replaces this browser's session cookie (the user stays signed in)
// and signs out every other session.
export function changePassword({ currentPassword, newPassword }) {
  return apiRequest('/account/password', { method: 'PUT', body: { currentPassword, newPassword } })
}

// DELETE /api/v1/account { confirmation: "DELETE" } -> { status, message }.
// Permanently deletes the account and clears the session cookie.
export function deleteAccount(confirmation) {
  return apiRequest('/account', { method: 'DELETE', body: { confirmation } })
}
