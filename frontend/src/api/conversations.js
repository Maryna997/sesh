// Calls to the messaging endpoints (see docs for the contracts).
import { apiRequest } from './client'

// GET /api/v1/conversations?page&limit -> { conversations, pagination }
// Most recent activity first; each item has the other participant and the
// last message preview (or null). Default limit 20 (max 50).
export function getConversations({ page = 1 } = {}) {
  return apiRequest(page > 1 ? `/conversations?page=${page}` : '/conversations')
}
