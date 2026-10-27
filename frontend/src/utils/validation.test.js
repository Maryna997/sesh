import { describe, expect, test } from 'vitest'
import {
  normalizeEmail,
  passwordByteLength,
  validateEmail,
  validateLoginPassword,
  validatePassword,
  validatePasswordConfirmation,
} from './validation'

describe('email', () => {
  test('normalizes like the backend (trim + lowercase)', () => {
    expect(normalizeEmail('  Surfer@Example.COM \n')).toBe('surfer@example.com')
  })

  test('required, format and length', () => {
    expect(validateEmail('', { required: true })).toBe('Email is required.')
    expect(validateEmail('   ', { required: true })).toBe('Email is required.')
    expect(validateEmail('not-an-email', { required: true })).toBe('Enter a valid email address, like you@example.com.')
    expect(validateEmail(' Surfer@Example.com ', { required: true })).toBeUndefined()
    expect(validateEmail(`${'a'.repeat(245)}@example.pt`, { required: true })).toMatch(/at most 254/)
  })
})

describe('password (registration)', () => {
  test('required and at least 8 characters, counting an emoji as one', () => {
    expect(validatePassword('', { required: true })).toBe('Password is required.')
    expect(validatePassword('1234567', { required: true })).toBe('Password must be at least 8 characters.')
    expect(validatePassword('12345678', { required: true })).toBeUndefined()
    expect(validatePassword('🌊🌊🌊🌊🌊🌊🌊', { required: true })).toMatch(/at least 8/)
  })

  test('no complexity rules; spaces allowed', () => {
    expect(validatePassword('alllowercase', { required: true })).toBeUndefined()
    expect(validatePassword('        ', { required: true })).toBeUndefined()
  })

  test('at most 72 UTF-8 bytes after NFC normalization', () => {
    expect(validatePassword('a'.repeat(72), { required: true })).toBeUndefined()
    expect(validatePassword('a'.repeat(73), { required: true })).toMatch(/at most 72 bytes/)
    expect(validatePassword('😀'.repeat(18), { required: true })).toBeUndefined() // 72 bytes
    expect(validatePassword('😀'.repeat(19), { required: true })).toMatch(/at most 72 bytes/) // 76 bytes
    // "e" + combining accent is 3 bytes, but 2 once normalized to "é"
    expect(passwordByteLength('é'.repeat(30))).toBe(60)
    expect(validatePassword('é'.repeat(30), { required: true })).toBeUndefined()
  })
})

describe('login and confirmation', () => {
  test('login only requires a password (rules are not revealed)', () => {
    expect(validateLoginPassword('')).toBe('Password is required.')
    expect(validateLoginPassword('x')).toBeUndefined()
  })

  test('confirmation must be present and match exactly', () => {
    expect(validatePasswordConfirmation('secret pass', '')).toBe('Please confirm your password.')
    expect(validatePasswordConfirmation('secret pass', 'secret pas')).toBe('Passwords don’t match.')
    expect(validatePasswordConfirmation('secret pass ', 'secret pass')).toBe('Passwords don’t match.')
    expect(validatePasswordConfirmation('secret pass', 'secret pass')).toBeUndefined()
  })
})
