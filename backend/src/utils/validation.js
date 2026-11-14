// Request validation for registration.
// Messages match the frontend validators (frontend/src/utils/validation.js)
// so users see the same wording whichever side catches the problem.

import { normalizePassword } from './password.js';

// Basic syntax check: something@something.something, no spaces.
// It does not check that the address exists (that would need email verification).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Longest email address that can actually be delivered (RFC 5321).
export const EMAIL_MAX_LENGTH = 254;

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt only uses the first 72 BYTES of a password and silently ignores the
// rest. We reject longer passwords instead of letting them be truncated.
export const PASSWORD_MAX_BYTES = 72;

// "  Surfer@Example.COM " -> "surfer@example.com"
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

// The registration rules for one email value: { error } or { email } (normalized).
// Shared by registration and the email change in Settings.
export function checkEmail(email) {
  if (isMissing(email)) return { error: 'Email is required.' };
  if (typeof email !== 'string') return { error: 'Email must be a string.' };
  const normalized = normalizeEmail(email);
  if (!normalized) return { error: 'Email is required.' };
  if (normalized.length > EMAIL_MAX_LENGTH) return { error: `Email must be at most ${EMAIL_MAX_LENGTH} characters.` };
  if (!EMAIL_PATTERN.test(normalized)) return { error: 'Enter a valid email address, like you@example.com.' };
  return { email: normalized };
}

// The registration rules for a new password: an error message, or undefined.
// Shared by registration and the password change in Settings.
// The password is NOT trimmed: spaces are valid password characters.
export function checkNewPassword(password) {
  if (isMissing(password)) return 'Password is required.';
  if (typeof password !== 'string') return 'Password must be a string.';
  // [...password] counts characters (an emoji is one), like the frontend does
  if ([...password].length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (Buffer.byteLength(normalizePassword(password), 'utf8') > PASSWORD_MAX_BYTES) {
    return `Password is too long. Use at most ${PASSWORD_MAX_BYTES} bytes (about ${PASSWORD_MAX_BYTES} standard characters; emoji and accented letters use more).`;
  }
  return undefined;
}

// Checks the registration body.
// Returns { errors } (an object of field -> message) when something is wrong,
// or { data: { email, password } } with the normalized email when it's valid.
export function validateRegistration(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'Request body must be a JSON object with email and password.' } };
  }

  const { email, password } = body;
  const errors = {};

  const emailCheck = checkEmail(email);
  if (emailCheck.error) errors.email = emailCheck.error;
  const normalizedEmail = emailCheck.email;

  const passwordError = checkNewPassword(password);
  if (passwordError) errors.password = passwordError;

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { data: { email: normalizedEmail, password } };
}

// Checks the login body. Only presence, type and email format are checked:
// password length rules are not revealed at login. A password that couldn't
// have been registered simply fails as "incorrect email or password".
export function validateLogin(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'Request body must be a JSON object with email and password.' } };
  }

  const { email, password } = body;
  const errors = {};
  let normalizedEmail;

  if (isMissing(email)) {
    errors.email = 'Email is required.';
  } else if (typeof email !== 'string') {
    errors.email = 'Email must be a string.';
  } else {
    normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      errors.email = 'Email is required.';
    } else if (normalizedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
      errors.email = 'Enter a valid email address, like you@example.com.';
    }
  }

  if (isMissing(password)) {
    errors.password = 'Password is required.';
  } else if (typeof password !== 'string') {
    errors.password = 'Password must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { data: { email: normalizedEmail, password } };
}
