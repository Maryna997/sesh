// Shared test setup. Import this FIRST in every test file, before any
// file from src/, so the environment is ready when those modules load.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';

// Database: tests use TEST_DATABASE_URL when it is set (see
// src/config/database.cjs), otherwise DATABASE_URL. Either way they only
// create accounts under @sesh-test.invalid and remove them afterwards.

// The lowest bcrypt cost keeps the tests fast. Real servers use 12 by default.
process.env.BCRYPT_ROUNDS = '4';

// Tests sign their own tokens with a throwaway secret, never the real one.
process.env.JWT_SECRET = `test-${randomBytes(32).toString('hex')}`;
process.env.JWT_EXPIRES_IN_HOURS = '168';

// The frontend origin the API trusts in tests (CORS and CSRF checks)
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.COOKIE_SECURE;
delete process.env.COOKIE_SAME_SITE;

export const TEST_CLIENT_ORIGIN = process.env.CLIENT_URL;

// Cloudinary: tests never use the real account. These dummy values only
// enable the avatar endpoints; the tests replace every Cloudinary call with
// a mock (see avatar.test.js), so nothing is ever sent to Cloudinary.
process.env.CLOUDINARY_CLOUD_NAME = 'sesh-test-cloud';
process.env.CLOUDINARY_API_KEY = '000000000000000';
process.env.CLOUDINARY_API_SECRET = 'test-only-not-a-real-secret';
