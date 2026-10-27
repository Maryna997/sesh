import { Router } from 'express';
import { login, logout, me, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// POST /api/v1/auth/register - create a new account
router.post('/register', register);

// POST /api/v1/auth/login - sign in; sets the session cookie
router.post('/login', login);

// POST /api/v1/auth/logout - end the session; clears the cookie
router.post('/logout', logout);

// GET /api/v1/auth/me - the signed-in user (requires authentication)
router.get('/me', requireAuth, me);

export default router;
