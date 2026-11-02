import { Router } from 'express';
import { createMyAvailability, getMyAvailability, updateMyAvailability } from '../controllers/availability.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireCompletedProfile } from '../middleware/requireCompletedProfile.js';

// Availability routes, mounted at /api/v1/availability.
// Like every surfer feature, they need a signed-in user with a completed
// profile. Data-changing requests also pass the global Origin (CSRF) check.
const router = Router();

// GET /api/v1/availability/me - your current availability (or null)
router.get('/me', requireAuth, requireCompletedProfile, getMyAvailability);

// POST /api/v1/availability/me - set your first availability
router.post('/me', requireAuth, requireCompletedProfile, createMyAvailability);

// PUT /api/v1/availability/me - change, switch off or reactivate your availability
router.put('/me', requireAuth, requireCompletedProfile, updateMyAvailability);

export default router;
