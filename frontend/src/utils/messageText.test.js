import { describe, expect, test } from 'vitest'
import { MESSAGE_MAX_LENGTH, characterCount, checkMessageText } from './messageText'

const char = (code) => String.fromCharCode(code)

describe('checkMessageText (same rules as the backend)', () => {
  test('ordinary text, emoji and leading / trailing spaces are valid and unchanged', () => {
    expect(checkMessageText('Hey!')).toEqual({ valid: true, count: 4, error: null })
    expect(checkMessageText('  🌊 4pm?  \n').valid).toBe(true)
  })

  test('empty and whitespace-only text is invalid without an error message', () => {
    for (const text of ['', ' ', '\n\t ', char(0xa0) + char(0x3000) + char(0x2028) + char(0xfeff)]) {
      expect(checkMessageText(text)).toMatchObject({ valid: false, error: null })
    }
  })

  test('characters are counted as code points; 2,000 is the limit', () => {
    expect(characterCount('🌊🏄')).toBe(2)
    expect(checkMessageText('🌊'.repeat(MESSAGE_MAX_LENGTH)).valid).toBe(true)
    expect(checkMessageText('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toEqual({
      valid: false,
      count: 2001,
      error: 'Messages can be up to 2,000 characters.',
    })
  })

  test('NUL is refused', () => {
    expect(checkMessageText(`Hi${char(0)}`)).toMatchObject({ valid: false, error: 'Your message contains a character that can’t be sent.' })
  })
})
