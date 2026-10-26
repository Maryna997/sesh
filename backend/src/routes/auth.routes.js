import { Router } from 'express';
import { register } from '../controllers/auth.controller.js';

const router = Router();

// POST /api/v1/auth/register - create a new account
router.post('/register', register);

export default router;
