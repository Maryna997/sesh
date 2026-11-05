import { Router } from 'express';
import { discoverSurfers } from '../controllers/discover.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireCompletedProfile } from '../middleware/requireCompletedProfile.js';

// Discover routes, mounted at /api/v1/discover. Only signed-in surfers with
// a completed profile can see who is available.
const router = Router();

// GET /api/v1/discover - surfers available right now (paginated)
router.get('/', requireAuth, requireCompletedProfile, discoverSurfers);

export default router;
