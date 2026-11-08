// Request parsing, cursors and response shapes for the messaging API
// (/api/v1/conversations). The rules for message text itself live in the
// Message model, so the API and the database always agree.

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CONVERSATIONS_DEFAULT_LIMIT = 20;
export const MESSAGES_DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 50;
export const PREVIEW_LENGTH = 120; // characters of the last message shown in the inbox

const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Collects "unknown parameter" and "repeated parameter" problems, the same
// convention as Discover. Repeated parameters (?limit=1&limit=2) arrive as arrays.
function checkQueryFields(query, allowed, errors) {
  for (const field of Object.keys(query)) {
    if (!allowed.includes(field)) errors[field] = 'This parameter isn’t supported.';
    else if (typeof query[field] !== 'string') errors[field] = 'Use this parameter only once.';
  }
}

function positiveInteger(query, field, fallback, errors) {
  const raw = query[field];
  if (raw === undefined || errors[field]) return fallback;
  if (!POSITIVE_INTEGER.test(raw)) {
    errors[field] = `${field === 'page' ? 'Page' : 'Limit'} must be a whole number of 1 or more.`;
    return fallback;
  }
  return Number(raw);
}

function limitWithin(query, fallback, errors) {
  const limit = positiveInteger(query, 'limit', fallback, errors);
  if (!errors.limit && limit > MAX_LIMIT) errors.limit = `Limit must be at most ${MAX_LIMIT}.`;
  return limit;
}

// ---------- Cursors ----------
//
// A cursor marks one message's position in the (created_at, id) order. It is
// "<timestamp>|<message id>" encoded as base64url, where the timestamp is
// PostgreSQL's exact value in UTC with microseconds (JavaScript dates only
// keep milliseconds, which could repeat or skip messages). Treat it as an
// opaque string: it contains no private data, and it gives no access by
// itself (the conversation is always checked for the signed-in user).

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeCursor(time, id) {
  return Buffer.from(`${time}|${id}`, 'utf8').toString('base64url');
}

// { time, id } or null for anything that isn't a cursor made by encodeCursor
export function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(cursor)) return null;
  const [time, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (extra !== undefined || !CURSOR_TIME.test(time ?? '') || !UUID_PATTERN.test(id ?? '')) return null;
  if (Number.isNaN(Date.parse(time))) return null;
  return { time, id: id.toLowerCase() };
}

// ---------- Query parameters ----------

// GET /conversations: ?page&limit → { errors } or { page, limit }
export function parseConversationListQuery(query) {
  const errors = {};
  checkQueryFields(query, ['page', 'limit'], errors);
  const page = positiveInteger(query, 'page', 1, errors);
  const limit = limitWithin(query, CONVERSATIONS_DEFAULT_LIMIT, errors);
  return Object.keys(errors).length > 0 ? { errors } : { page, limit };
}

// GET /conversations/:id/messages: ?limit and at most one of before / after
// → { errors } or { limit, mode: 'latest' | 'before' | 'after', cursor }
export function parseMessagesQuery(query) {
  const errors = {};
  checkQueryFields(query, ['limit', 'before', 'after'], errors);
  const limit = limitWithin(query, MESSAGES_DEFAULT_LIMIT, errors);

  if (query.before !== undefined && query.after !== undefined) {
    errors.after = 'Use either before or after, not both.';
    return { errors };
  }
  const mode = query.before !== undefined ? 'before' : query.after !== undefined ? 'after' : 'latest';
  let cursor = null;
  if (mode !== 'latest' && !errors[mode]) {
    cursor = decodeCursor(query[mode]);
    if (!cursor) errors[mode] = 'This cursor isn’t valid. Use a nextCursor or pollCursor from a previous response.';
  }
  return Object.keys(errors).length > 0 ? { errors } : { limit, mode, cursor };
}

// ---------- Request bodies ----------

// POST /conversations: { recipientUserId } → { errors } or { recipientUserId }
export function validateStartConversation(body) {
  if (!isPlainObject(body)) return { errors: { body: 'Request body must be a JSON object with recipientUserId.' } };
  const errors = {};
  for (const field of Object.keys(body)) {
    if (field !== 'recipientUserId') errors[field] = 'This field can’t be set.';
  }
  const { recipientUserId } = body;
  if (recipientUserId === undefined || recipientUserId === null || recipientUserId === '') {
    errors.recipientUserId = 'Choose a surfer to message.';
  } else if (typeof recipientUserId !== 'string' || !UUID_PATTERN.test(recipientUserId)) {
    errors.recipientUserId = 'This surfer id isn’t valid.';
  }
  return Object.keys(errors).length > 0 ? { errors } : { recipientUserId: recipientUserId.toLowerCase() };
}

// POST /conversations/:id/messages: { body } → { errors } or { body }.
// Only the shape is checked here (the sender always comes from the session,
// so senderId and other fields are refused); the text rules are the Message
// model's (see the controller).
export function validateSendMessage(requestBody) {
  if (!isPlainObject(requestBody)) return { errors: { body: 'Request body must be a JSON object with the message body.' } };
  const errors = {};
  for (const field of Object.keys(requestBody)) {
    if (field !== 'body') errors[field] = 'This field can’t be set.';
  }
  if (requestBody.body === undefined || requestBody.body === null) errors.body = 'Message can’t be empty.';
  else if (typeof requestBody.body !== 'string') errors.body = 'Message must be text.';
  return Object.keys(errors).length > 0 ? { errors } : { body: requestBody.body };
}

// ---------- Responses ----------

const iso = (value) => (value instanceof Date ? value : new Date(value)).toISOString();

export function toMessageResponse(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? row.conversationId,
    senderId: row.sender_id ?? row.senderId,
    body: row.body,
    createdAt: iso(row.created_at ?? row.createdAt),
  };
}

// The other participant's public identity only (never email or account data)
export function toParticipantResponse(userId, profile) {
  return { userId, displayName: profile?.displayName ?? null, avatarUrl: profile?.avatarUrl ?? null };
}

// The first PREVIEW_LENGTH characters (code points, never cutting an emoji in half)
export function previewOf(body) {
  const characters = [...body];
  return characters.length > PREVIEW_LENGTH ? characters.slice(0, PREVIEW_LENGTH).join('') : body;
}
