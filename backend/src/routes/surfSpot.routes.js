import { Router } from 'express';
import { listSurfSpots } from '../controllers/surfSpot.controller.js';

const router = Router();

// GET /api/v1/surf-spots - the surf spots surfers can choose from (public, read-only)
router.get('/', listSurfSpots);

export default router;
