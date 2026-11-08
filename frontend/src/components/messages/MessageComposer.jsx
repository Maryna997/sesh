import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import { MESSAGE_MAX_LENGTH, checkMessageText } from '../../utils/messageText'

const MAX_HEIGHT = 160 // px; the field grows with its text up to this height, then scrolls
const COUNTER_FROM = MESSAGE_MAX_LENGTH - 200 // the character count appears near the limit

// The message field and Send button (Figma "Message input" + round blue
// "Send message" button).
// - Enter sends; Shift+Enter adds a line. Enter while an input method (IME)
//   is composing a character is left alone. The Send button works on touch.
// - Send is enabled only for text the server accepts (see messageText.js);
//   the text is sent exactly as typed, never trimmed or cut.
// - While sending the field is read-only and Send is disabled (no double
//   sends). The draft is cleared only after the server confirmed the
//   message; on failure it stays, with the error below the field.
// - Focus stays in (or returns to) the field after sending.
function MessageComposer({ onSend, sending = false, disabled = false, error = null }) {
  const [draft, setDraft] = useState('')
  const fieldRef = useRef(null)
  const id = useId()
  const check = checkMessageText(draft)
  const canSend = check.valid && !sending && !disabled
  const problem = check.error ?? error
  const showCounter = check.count >= COUNTER_FROM

  // Grow with the text (one line when empty)
  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = 'auto'
    if (field.scrollHeight > 0) field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  async function submit() {
    if (!canSend) return
    const wasSent = await onSend(draft)
    if (wasSent) setDraft('')
    fieldRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return // IME composition
    event.preventDefault()
    submit()
  }

  const describedBy = [problem ? `${id}-problem` : null, showCounter ? `${id}-count` : null].filter(Boolean).join(' ') || undefined

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="flex items-end gap-2.5">
        <label htmlFor={id} className="sr-only">
          Message
        </label>
        <textarea
          ref={fieldRef}
          id={id}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={sending}
          disabled={disabled}
          placeholder="Type a message..."
          aria-invalid={check.error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            'block min-h-12 w-full min-w-0 flex-1 resize-none rounded-xl border bg-white px-4 py-3 text-[13px] text-ink',
            'placeholder:text-muted outline-none transition-colors focus:border-blue focus:ring-3 focus:ring-blue/20',
            'disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted',
            check.error ? 'border-danger' : 'border-border',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sending ? 'Sending message' : 'Send message'}
          className={[
            'mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-blue text-white transition-colors hover:bg-ink',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue',
          ].join(' ')}
        >
          {sending ? <LoaderCircle size={20} aria-hidden="true" className="animate-spin" /> : <ArrowUp size={22} aria-hidden="true" />}
        </button>
      </div>

      {(problem || showCounter) && (
        <div className="mt-2 flex items-start justify-between gap-3 text-xs">
          {problem ? (
            <p id={`${id}-problem`} role={check.error ? undefined : 'alert'} className="text-danger-ink">
              {problem}
            </p>
          ) : (
            <span />
          )}
          {showCounter && (
            <p id={`${id}-count`} className={`shrink-0 ${check.count > MESSAGE_MAX_LENGTH ? 'text-danger-ink' : 'text-muted'}`}>
              {check.count.toLocaleString('en-GB')} / {MESSAGE_MAX_LENGTH.toLocaleString('en-GB')}
            </p>
          )}
        </div>
      )}
    </form>
  )
}

export default MessageComposer
