// Call to the Discover endpoint (see docs for the contract).
import { apiRequest } from './client'

// GET /api/v1/discover?page&limit&spotId&skillLevel&status&arrivalFrom&arrivalTo
// -> { surfers, pagination: { page, limit, total, totalPages } }
// `query` holds only the parameters to send (see utils/discoverFilters.js).
export function getDiscoverSurfers(query = {}) {
  const params = new URLSearchParams(query).toString()
  return apiRequest(`/discover${params ? `?${params}` : ''}`)
}
