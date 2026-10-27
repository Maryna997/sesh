// Small, reusable form validators.
// Each returns an error message string, or undefined when the value is valid,
// so the result can be passed straight to an Input's `error` prop.
//
// The rules and messages match the backend (backend/src/utils/validation.js),
// which checks everything again: these only give faster feedback.

// Basic syntax check: something@something.something, no spaces.
// It does not check that the address exists — that needs the backend.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Longest email address that can actually be delivered (RFC 5321)
export const EMAIL_MAX_LENGTH = 254

// Same normalization as the backend: "  Surfer@Example.COM " -> "surfer@example.com"
export function normalizeEmail(value) {
  return value.trim().toLowerCase()
}

export function validateEmail(value, { required = false } = {}) {
  const email = normalizeEmail(value)

  if (!email) {
    return required ? 'Email is required.' : undefined
  }

  if (email.length > EMAIL_MAX_LENGTH) {
    return `Email must be at most ${EMAIL_MAX_LENGTH} characters.`
  }

  if (!EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address, like you@example.com.'
  }

  return undefined
}

// Passwords only need a length check: no forced uppercase, numbers or symbols.
// The value is NOT trimmed, because spaces are valid password characters.
export const PASSWORD_MIN_LENGTH = 8

// bcrypt (used by the backend) only reads the first 72 bytes of a password,
// so the backend rejects longer ones. Bytes are counted after the same
// Unicode normalization (NFC) the backend applies. The password itself is
// sent unchanged.
export const PASSWORD_MAX_BYTES = 72

export function passwordByteLength(value) {
  return new TextEncoder().encode(value.normalize('NFC')).length
}

export function validatePassword(value, { required = false } = {}) {
  if (value === '') {
    return required ? 'Password is required.' : undefined
  }

  // [...value] counts characters (an emoji counts as one), not UTF-16 units.
  if ([...value].length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }

  if (passwordByteLength(value) > PASSWORD_MAX_BYTES) {
    return `Password is too long. Use at most ${PASSWORD_MAX_BYTES} bytes (about ${PASSWORD_MAX_BYTES} standard characters; emoji and accented letters use more).`
  }

  return undefined
}

// Login only checks that a password was entered: the length rules are not
// revealed at login (the backend answers "incorrect email or password").
export function validateLoginPassword(value) {
  return value === '' ? 'Password is required.' : undefined
}

export function validatePasswordConfirmation(password, confirmation) {
  if (confirmation === '') return 'Please confirm your password.'
  if (confirmation !== password) return 'Passwords don’t match.'
  return undefined
}
