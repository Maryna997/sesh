import express from 'express';
import cors from 'cors';
import { authConfig } from './config/auth.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import surfSpotRoutes from './routes/surfSpot.routes.js';
import { requireTrustedOrigin } from './middleware/requireTrustedOrigin.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Only allow requests from our own frontend (CLIENT_URL in backend/.env).
// credentials: true lets the browser send and receive the session cookie.
app.use(
  cors({
    origin: authConfig.allowedOrigins,
    credentials: true,
  }),
);

// Block data-changing requests from other websites (CSRF protection)
app.use(requireTrustedOrigin);

// Parse JSON request bodies
app.use(express.json());

// API routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/surf-spots', surfSpotRoutes);
app.use('/api/v1', profileRoutes);

// Any other route returns a 404 JSON response
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Errors thrown anywhere above end up here (malformed JSON, database errors...)
app.use(errorHandler);

export default app;
