import { UniqueConstraintError, ValidationError } from 'sequelize';
import { sequelize } from '../db/index.js';
import { Conversation, Message, SurferProfile } from '../models/index.js';
import { orderParticipants } from '../models/Conversation.js';
import {
  UUID_PATTERN,
  encodeCursor,
  parseConversationListQuery,
  parseMessagesQuery,
  previewOf,
  toMessageResponse,
  toParticipantResponse,
  validateSendMessage,
  validateStartConversation,
} from '../utils/messaging.js';

// Private one-to-one messaging (REST, polled by the frontend every few
// seconds; no real-time infrastructure). Every handler runs after requireAuth
// and requireCompletedProfile; the POSTs also pass the global Origin check.
//
// Access rule: a conversation exists for a user only if they are one of its
// two participants. Unknown, malformed and other people's conversation ids
// all get the same 404, so nobody can learn which conversations exist.

const CONVERSATION_NOT_FOUND = { status: 'error', message: 'Conversation not found.' };
const PROFILE_FIELDS = ['userId', 'displayName', 'avatarUrl'];

// The exact (microsecond) UTC timestamp of a message, for cursors
const CURSOR_TIME_SQL = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const MESSAGE_COLUMNS = `id, conversation_id, sender_id, body, created_at, ${CURSOR_TIME_SQL} AS cursor_time`;

function rejectQuery(res, errors) {
  return res.status(400).json({ status: 'error', message: 'Please check the request options.', errors });
}

// The conversation if the user takes part in it, otherwise null (one indexed lookup)
async function findOwnConversation(conversationId, userId) {
  if (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId)) return null;
  const [rows] = await sequelize.query(
    'SELECT id FROM conversations WHERE id = $1 AND (user_one_id = $2 OR user_two_id = $2)',
    { bind: [conversationId.toLowerCase(), userId] },
  );
  return rows[0] ?? null;
}

function toConversationResponse(conversation, otherProfile, otherUserId) {
  return {
    id: conversation.id,
    otherParticipant: toParticipantResponse(otherUserId, otherProfile),
    createdAt: conversation.createdAt.toISOString(),
  };
}

// POST /api/v1/conversations  { recipientUserId }
// Starts the conversation with another surfer, or returns the existing one:
// 201 when it was created, 200 when it already existed (also when it was
// created by a simultaneous request a moment earlier).
export async function startConversation(req, res) {
  const me = req.auth.userId;
  const input = validateStartConversation(req.body);
  if (input.errors) {
    return res.status(400).json({ status: 'error', message: 'Please check who you want to message.', errors: input.errors });
  }
  const { recipientUserId } = input;

  if (recipientUserId === me) {
    return res.status(400).json({
      status: 'error',
      message: 'Please check who you want to message.',
      errors: { recipientUserId: 'You can’t start a conversation with yourself.' },
    });
  }

  // Only surfers with a completed profile can be messaged (availability isn't needed)
  const recipient = await SurferProfile.findByPk(recipientUserId, { attributes: PROFILE_FIELDS });
  if (!recipient) return res.status(404).json({ status: 'error', message: 'Surfer not found.' });

  const pair = orderParticipants(me, recipientUserId);
  let conversation = await Conversation.findOne({ where: pair });
  let created = false;
  if (!conversation) {
    try {
      conversation = await Conversation.create(pair);
      created = true;
    } catch (error) {
      // Another request created the same pair first: the unique index
      // refused this one, so return that conversation instead.
      if (!(error instanceof UniqueConstraintError)) throw error;
      conversation = await Conversation.findOne({ where: pair });
      if (!conversation) throw error;
    }
  }

  return res.status(created ? 201 : 200).json({ conversation: toConversationResponse(conversation, recipient, recipientUserId) });
}

// GET /api/v1/conversations?page&limit
// The signed-in surfer's conversations, most recent activity first (a new
// message moves its conversation to the top), with the other participant
// and a preview of the last message (null when there is none yet).
// One query for the page (latest message via an indexed LATERAL lookup per
// row, no N+1) and one for the total.
export async function listConversations(req, res) {
  const parsed = parseConversationListQuery(req.query);
  if (parsed.errors) return rejectQuery(res, parsed.errors);
  const { page, limit } = parsed;
  const me = req.auth.userId;

  const [rows] = await sequelize.query(
    `SELECT c.id, c.created_at, c.updated_at,
            other.user_id AS other_user_id, p.display_name, p.avatar_url,
            m.id AS last_id, m.sender_id AS last_sender_id, m.body AS last_body, m.created_at AS last_created_at
       FROM conversations c
       CROSS JOIN LATERAL (SELECT CASE WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END AS user_id) other
       LEFT JOIN surfer_profiles p ON p.user_id = other.user_id
       LEFT JOIN LATERAL (
         SELECT id, sender_id, body, created_at FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) m ON true
      WHERE c.user_one_id = $1 OR c.user_two_id = $1
      ORDER BY c.updated_at DESC, c.id ASC
      LIMIT $2 OFFSET $3`,
    { bind: [me, limit, (page - 1) * limit] },
  );
  const [[{ total }]] = await sequelize.query(
    'SELECT count(*)::int AS total FROM conversations WHERE user_one_id = $1 OR user_two_id = $1',
    { bind: [me] },
  );

  return res.status(200).json({
    conversations: rows.map((row) => ({
      id: row.id,
      otherParticipant: toParticipantResponse(row.other_user_id, { displayName: row.display_name, avatarUrl: row.avatar_url }),
      createdAt: new Date(row.created_at).toISOString(),
      lastActivityAt: new Date(row.updated_at).toISOString(),
      lastMessage: row.last_id
        ? {
            id: row.last_id,
            senderId: row.last_sender_id,
            preview: previewOf(row.last_body),
            createdAt: new Date(row.last_created_at).toISOString(),
          }
        : null,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// GET /api/v1/conversations/:conversationId/messages?limit&before|after
//
// Three modes, all keyset pagination on (created_at, id) using the index
// messages (conversation_id, created_at, id):
// - latest (no cursor): the newest `limit` messages, newest first.
//   pagination.nextCursor → pass as ?before= to load older messages (null when
//   there are none); pagination.pollCursor → pass as ?after= to poll for new
//   messages (null for an empty conversation: poll without a cursor).
// - before=<cursor>: messages strictly older than the cursor, newest first.
//   nextCursor continues toward older messages; null when hasMore is false.
// - after=<cursor> (polling): messages strictly newer than the cursor, OLDEST
//   first (ready to append). nextCursor is the newest returned message, or the
//   same cursor when nothing is new, so the next poll can always use it.
//   hasMore: true means more new messages are waiting: fetch again right away.
export async function getMessages(req, res) {
  const me = req.auth.userId;
  const conversation = await findOwnConversation(req.params.conversationId, me);
  if (!conversation) return res.status(404).json(CONVERSATION_NOT_FOUND);

  const parsed = parseMessagesQuery(req.query);
  if (parsed.errors) return rejectQuery(res, parsed.errors);
  const { limit, mode, cursor } = parsed;

  const bind = [conversation.id, limit + 1]; // one extra row tells whether there is more
  let condition = '';
  let order = 'created_at DESC, id DESC';
  if (mode !== 'latest') {
    bind.push(cursor.time, cursor.id);
    condition = `AND (created_at, id) ${mode === 'before' ? '<' : '>'} ($3::timestamptz, $4::uuid)`;
    if (mode === 'after') order = 'created_at ASC, id ASC';
  }

  const [rows] = await sequelize.query(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = $1 ${condition} ORDER BY ${order} LIMIT $2`,
    { bind },
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const cursorOf = (row) => (row ? encodeCursor(row.cursor_time, row.id) : null);
  const last = page.at(-1);

  let pagination;
  if (mode === 'latest') pagination = { hasMore, nextCursor: hasMore ? cursorOf(last) : null, pollCursor: cursorOf(page[0]) };
  else if (mode === 'before') pagination = { hasMore, nextCursor: hasMore ? cursorOf(last) : null };
  else pagination = { hasMore, nextCursor: last ? cursorOf(last) : req.query.after };

  return res.status(200).json({ messages: page.map(toMessageResponse), pagination });
}

// POST /api/v1/conversations/:conversationId/messages  { body }
// Sends a message as the signed-in surfer (the sender is never taken from
// the request). The text rules are the Message model's: 1–2,000 characters,
// not only whitespace, no NUL; the text is stored exactly as sent.
//
// Ordering guarantee for polling: in one transaction the conversation row is
// locked (the UPDATE, which also records the activity time for the inbox and
// only matches when the sender is a participant) and the message gets the
// database clock time while the lock is held. Messages of one conversation
// are therefore committed in (created_at, id) order, so a poll never sees a
// later message while an earlier one is still invisible.
export async function sendMessage(req, res) {
  const me = req.auth.userId;
  const { conversationId } = req.params;
  if (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId)) {
    return res.status(404).json(CONVERSATION_NOT_FOUND);
  }

  const input = validateSendMessage(req.body);
  if (input.errors) {
    return res.status(400).json({ status: 'error', message: 'Please check your message.', errors: input.errors });
  }

  try {
    await Message.build({ conversationId, senderId: me, body: input.body }).validate({ fields: ['body'] });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return res.status(400).json({
      status: 'error',
      message: 'Please check your message.',
      errors: { body: error.errors[0]?.message ?? 'Message isn’t valid.' },
    });
  }

  const message = await sequelize.transaction(async (transaction) => {
    const [locked] = await sequelize.query(
      `UPDATE conversations SET updated_at = clock_timestamp()
        WHERE id = $1 AND (user_one_id = $2 OR user_two_id = $2)
        RETURNING id`,
      { bind: [conversationId.toLowerCase(), me], transaction },
    );
    if (locked.length === 0) return null;
    return Message.create(
      { conversationId: locked[0].id, senderId: me, body: input.body, createdAt: sequelize.fn('clock_timestamp') },
      { transaction },
    );
  });
  if (!message) return res.status(404).json(CONVERSATION_NOT_FOUND);

  return res.status(201).json({ message: toMessageResponse(message.get({ plain: true })) });
}
