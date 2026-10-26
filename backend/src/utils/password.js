// Password hashing with bcrypt (the bcryptjs package: the standard bcrypt
// algorithm in plain JavaScript, so no native build step is needed).

import bcrypt from 'bcryptjs';

// bcrypt "cost factor": each +1 doubles the time needed to hash (and to
// guess) a password. 12 takes roughly a quarter of a second on a typical server.
export const DEFAULT_BCRYPT_ROUNDS = 12;

// Reads BCRYPT_ROUNDS from the environment. Tests use a low value (4) to run
// fast; production should keep 12 or higher.
export function parseBcryptRounds(value) {
  if (value === undefined || value === '') return DEFAULT_BCRYPT_ROUNDS;

  const rounds = Number(value);
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be a whole number between 4 and 15.');
  }
  return rounds;
}

// Checked once when the server starts, so a bad value fails loudly.
const BCRYPT_ROUNDS = parseBcryptRounds(process.env.BCRYPT_ROUNDS);

// The same password can be typed as different byte sequences on different
// devices (e.g. "é" as one character or as "e" + an accent). Normalizing to
// NFC makes them identical. Login must use this too before comparing.
export function normalizePassword(password) {
  return password.normalize('NFC');
}

// Returns a bcrypt hash like "$2b$12$...". The salt is generated
// automatically and stored inside the hash.
export function hashPassword(password) {
  return bcrypt.hash(normalizePassword(password), BCRYPT_ROUNDS);
}
