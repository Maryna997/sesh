import { Router } from 'express';
import { getMyProfile, getPublicProfile, saveMyProfile } from '../controllers/profile.controller.js';
import { removeMyAvatar, requireAvatarUploads, uploadMyAvatar } from '../controllers/avatar.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireCompletedProfile } from '../middleware/requireCompletedProfile.js';
import { parseAvatarUpload } from '../middleware/parseAvatarUpload.js';

// Surfer profile routes, mounted at /api/v1.
// /profile/me requires authentication but NOT a completed profile: this is
// where users create it. Viewing other surfers needs a completed profile.
// The profile picture belongs to an existing profile, so it needs one too.
const router = Router();

// GET /api/v1/profile/me - your own profile ({ profile: null } if none yet)
router.get('/profile/me', requireAuth, getMyProfile);

// PUT /api/v1/profile/me - create (first time) or update your profile
router.put('/profile/me', requireAuth, saveMyProfile);

// POST /api/v1/profile/me/avatar - upload or replace your profile picture
// (multipart/form-data, one JPEG/PNG/WebP file of at most 5 MB in "avatar")
router.post(
  '/profile/me/avatar',
  requireAuth,
  requireCompletedProfile,
  requireAvatarUploads,
  parseAvatarUpload,
  uploadMyAvatar,
);

// DELETE /api/v1/profile/me/avatar - remove your profile picture
router.delete('/profile/me/avatar', requireAuth, requireCompletedProfile, removeMyAvatar);

// GET /api/v1/profiles/:userId - another surfer's public profile
router.get('/profiles/:userId', requireAuth, requireCompletedProfile, getPublicProfile);

export default router;
