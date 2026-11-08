import { Router } from 'express';
import { getMessages, listConversations, sendMessage, startConversation } from '../controllers/conversation.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireCompletedProfile } from '../middleware/requireCompletedProfile.js';

// Messaging routes, mounted at /api/v1/conversations. Signed-in surfers with
// a completed profile only; the POSTs also pass the global Origin (CSRF) check.
// Participation in a conversation is checked in each handler.
const router = Router();

router.use(requireAuth, requireCompletedProfile);

// POST /api/v1/conversations - start (or get) the conversation with a surfer
router.post('/', startConversation);

// GET /api/v1/conversations - my conversations, most recent activity first
router.get('/', listConversations);

// GET /api/v1/conversations/:conversationId/messages - latest, older (before) or newer (after) messages
router.get('/:conversationId/messages', getMessages);

// POST /api/v1/conversations/:conversationId/messages - send a message
router.post('/:conversationId/messages', sendMessage);

export default router;
