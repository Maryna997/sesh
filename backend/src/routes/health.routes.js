import { Router } from 'express';

const router = Router();

// GET /api/v1/health - lets the frontend and hosting platform check that the API is up
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Sesh API is running',
  });
});

export default router;
