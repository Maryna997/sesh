import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Only allow requests from our own frontend (set in backend/.env)
app.use(
  cors({
    origin: process.env.CLIENT_URL,
  }),
);

// Parse JSON request bodies
app.use(express.json());

// API routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);

// Any other route returns a 404 JSON response
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Errors thrown anywhere above end up here (malformed JSON, database errors...)
app.use(errorHandler);

export default app;
