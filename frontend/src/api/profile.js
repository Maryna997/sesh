// Calls to the surfer profile and surf spot endpoints (see docs for contracts).
import { apiRequest } from './client'

// GET /api/v1/profile/me -> { profile } (null when the user has no profile yet)
export function getMyProfile() {
  return apiRequest('/profile/me')
}

// PUT /api/v1/profile/me -> { profile }. The first valid request creates the
// profile (201); later ones update it (200).
export function saveMyProfile(fields) {
  return apiRequest('/profile/me', { method: 'PUT', body: fields })
}

// GET /api/v1/surf-spots -> { spots }, sorted by name. Public.
export function getSurfSpots() {
  return apiRequest('/surf-spots')
}
