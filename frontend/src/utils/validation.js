// Small, reusable form validators.
// Each returns an error message string, or undefined when the value is valid,
// so the result can be passed straight to an Input's `error` prop.

// Basic syntax check: something@something.something, no spaces.
// It does not check that the address exists — that needs the backend.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value, { required = false } = {}) {
  const email = value.trim()

  if (!email) {
    return required ? 'Email is required.' : undefined
  }

  if (!EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address, like you@example.com.'
  }

  return undefined
}

// Passwords only need a minimum length: no forced uppercase, numbers or
// symbols, and no restrictive maximum (long passphrases are welcome).
// The value is NOT trimmed, because spaces are valid password characters.
// These rules must be checked again on the backend when registration exists.
export const PASSWORD_MIN_LENGTH = 8

export function validatePassword(value, { required = false } = {}) {
  if (value === '') {
    return required ? 'Password is required.' : undefined
  }

  // [...value] counts characters (an emoji counts as one), not UTF-16 units.
  if ([...value].length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }

  return undefined
}
