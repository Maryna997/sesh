// Shared test setup. Import this FIRST in every test file, before any
// file from src/, so the environment is ready when those modules load.
import 'dotenv/config';

process.env.NODE_ENV = 'test';

// The lowest bcrypt cost keeps the tests fast. Real servers use 12 by default.
process.env.BCRYPT_ROUNDS = '4';
