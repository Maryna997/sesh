import { Router } from 'express';
import { getMyProfile, getPublicProfile, saveMyProfile } from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireCompletedProfile } from '../middleware/requireCompletedProfile.js';

// Surfer profile routes, mounted at /api/v1.
// /profile/me requires authentication but NOT a completed profile: this is
// where users create it. Viewing other surfers needs a completed profile.
const router = Router();

// GET /api/v1/profile/me - your own profile ({ profile: null } if none yet)
router.get('/profile/me', requireAuth, getMyProfile);

// PUT /api/v1/profile/me - create (first time) or update your profile
router.put('/profile/me', requireAuth, saveMyProfile);

// GET /api/v1/profiles/:userId - another surfer's public profile
router.get('/profiles/:userId', requireAuth, requireCompletedProfile, getPublicProfile);

export default router;
