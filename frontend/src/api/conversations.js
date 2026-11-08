// Calls to the messaging endpoints (see docs for the contracts).
import { apiRequest } from './client'

const messagesPath = (conversationId) => `/conversations/${encodeURIComponent(conversationId)}/messages`

// GET /api/v1/conversations?page&limit -> { conversations, pagination }
// Most recent activity first; each item has the other participant and the
// last message preview (or null). Default limit 20 (max 50).
export function getConversations({ page = 1, limit } = {}) {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  return apiRequest(query ? `/conversations?${query}` : '/conversations')
}

// GET /api/v1/conversations/:id/messages -> { messages, pagination }
// - no cursor: the latest messages, newest first; pagination has nextCursor
//   (older messages, or null) and pollCursor (newest message, or null when
//   the conversation has no messages yet)
// - before: older messages than the cursor, newest first
// - after: newer messages than the cursor, OLDEST first; nextCursor is the
//   newest returned message (or the same cursor), hasMore: fetch again now
// 30 messages per request (the backend default, sent explicitly).
export const MESSAGES_PAGE_SIZE = 30

export function getMessages(conversationId, { before, after } = {}) {
  const params = new URLSearchParams()
  if (before) params.set('before', before)
  if (after) params.set('after', after)
  params.set('limit', String(MESSAGES_PAGE_SIZE))
  return apiRequest(`${messagesPath(conversationId)}?${params}`)
}

// POST /api/v1/conversations/:id/messages { body } -> { message }
// The sender is always the signed-in user (taken from the session).
export function sendMessage(conversationId, body) {
  return apiRequest(messagesPath(conversationId), { method: 'POST', body: { body } })
}
