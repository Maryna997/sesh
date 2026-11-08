// Rules for a chat message, the same as the backend's Message model, so
// the Send button is only enabled for text the server will accept:
// - at most 2,000 characters, counted as Unicode code points (🌊 counts once)
// - not empty and not only whitespace (the backend's explicit whitespace list)
// - no NUL character
// The text itself is never trimmed or changed: it is sent exactly as typed.

export const MESSAGE_MAX_LENGTH = 2000

const HAS_NON_WHITESPACE = /[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u

export const characterCount = (text) => [...text].length

// { valid, count, error }: `error` is a message to show (null when there is
// nothing to explain; an empty draft just keeps Send disabled).
export function checkMessageText(text) {
  const count = characterCount(text)
  if (text.includes('\u0000')) return { valid: false, count, error: 'Your message contains a character that can’t be sent.' }
  if (count > MESSAGE_MAX_LENGTH) {
    return { valid: false, count, error: `Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString('en-GB')} characters.` }
  }
  if (!HAS_NON_WHITESPACE.test(text)) return { valid: false, count, error: null }
  return { valid: true, count, error: null }
}
