import { describe, expect, test } from 'vitest'
import { buildLoginPath, getSafeReturnPath } from './returnPath'

describe('getSafeReturnPath', () => {
  test('keeps internal paths (with query and hash)', () => {
    expect(getSafeReturnPath('/messages')).toBe('/messages')
    expect(getSafeReturnPath('/discover?spot=pt-cascais-guincho#top')).toBe('/discover?spot=pt-cascais-guincho#top')
  })

  test('defaults to /discover when missing', () => {
    for (const value of [null, undefined, '']) expect(getSafeReturnPath(value)).toBe('/discover')
  })

  test('rejects external and tricky URLs', () => {
    const unsafe = [
      'https://evil.example',
      'http://evil.example/discover',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      'evil.example/discover',
      '/\tevil',
      '/%0a',
      ' /discover',
    ]
    for (const value of unsafe) {
      const result = getSafeReturnPath(value)
      expect(result.startsWith('/'), value).toBe(true)
      expect(result.startsWith('//'), value).toBe(false)
      expect(result.includes('evil'), value).toBe(false)
    }
  })

  test('does not return to the login or register pages', () => {
    expect(getSafeReturnPath('/login')).toBe('/discover')
    expect(getSafeReturnPath('/register?returnTo=/x')).toBe('/discover')
  })
})

test('buildLoginPath encodes the current location', () => {
  expect(buildLoginPath({ pathname: '/messages', search: '?thread=1', hash: '' })).toBe(
    '/login?returnTo=%2Fmessages%3Fthread%3D1',
  )
})
