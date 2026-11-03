// Calls to the availability endpoints (see docs for contracts).
import { apiRequest } from './client'

// GET /api/v1/availability/me -> { availability } (null if never set)
export function getMyAvailability() {
  return apiRequest('/availability/me')
}

// POST /api/v1/availability/me -> { availability } (201). Only for the first
// status; 409 AVAILABILITY_EXISTS when one already exists.
export function createMyAvailability(body) {
  return apiRequest('/availability/me', { method: 'POST', body })
}

// PUT /api/v1/availability/me -> { availability } (200). Changes, switches
// off or reactivates an existing status; 404 when there is none yet.
export function updateMyAvailability(body) {
  return apiRequest('/availability/me', { method: 'PUT', body })
}
