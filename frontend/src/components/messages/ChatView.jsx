import { useCallback, useLayoutEffect, useRef } from 'react'
import { LoaderCircle, MessageCircle, MessageSquareOff } from 'lucide-react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import ChatHeader from './ChatHeader'
import MessageBubble from './MessageBubble'
import MessageComposer from './MessageComposer'
import { useAuth } from '../../auth/useAuth'
import { useChat } from '../../hooks/useChat'
import { useNow } from '../../hooks/useNow'

export const POLL_PROBLEM_MESSAGE = 'We’re having trouble getting new messages. We’ll keep trying.'

const NEAR_BOTTOM_PX = 80
const PREVIEW_LENGTH = 140 // characters of an incoming message read out by screen readers

// The history scrolls inside the panel, sized to the screen (dvh follows
// mobile browser bars) with a minimum, so the composer stays in view on
// phones and the panel doesn't grow past the Figma size on large screens.
const HISTORY_HEIGHT =
  'h-[max(240px,calc(100dvh-380px))] md:h-[max(280px,calc(100dvh-420px))] md:max-h-[520px] lg:h-[max(320px,calc(100dvh-450px))]'

function shorten(text) {
  const characters = [...(text ?? '')]
  return characters.length > PREVIEW_LENGTH ? `${characters.slice(0, PREVIEW_LENGTH).join('')}…` : text
}

function announcementText(announcement, name) {
  if (!announcement) return ''
  if (announcement.kind === 'sent') return 'Message sent.'
  if (announcement.count === 1) return `New message from ${name}: ${shorten(announcement.last.body)}`
  return `${announcement.count} new messages from ${name}.`
}

// The conversation page's content: contact header, message history, composer.
// `useChat` loads the data and polls; this component handles the layout,
// scrolling and screen-reader announcements.
//
// Scrolling:
// - after the first load the history shows the newest message (bottom);
// - a new message scrolls into view if the reader was already at (or near)
//   the bottom, or when it's their own message; someone reading older
//   messages isn't moved;
// - "Load earlier messages" keeps the message the reader was looking at in
//   the same place (the first visible message is used as an anchor).
//
// Announcements (no focus is moved when messages arrive):
// - one polite live region reads new incoming messages ("New message from
//   Mariana Silva: …", or "3 new messages from …") and "Message sent." It
//   only changes when something new happens, so the conversation is never
//   read out again on each poll;
// - a status region reads loading states and a lasting polling problem.
function ChatView({ conversationId }) {
  const { user } = useAuth()
  const now = useNow() // keeps "Yesterday, 10:24" correct while the page stays open
  const containerRef = useRef(null)
  const historyRef = useRef(null)
  const anchorRef = useRef(null)
  const nearBottomRef = useRef(true)
  const scrolledInitiallyRef = useRef(false)

  // Called right before older messages are inserted at the top
  const rememberAnchor = useCallback(() => {
    const history = historyRef.current
    const first = history?.querySelector('[data-message-id]')
    anchorRef.current = first ? { id: first.dataset.messageId, offset: first.offsetTop - history.scrollTop } : null
  }, [])

  const chat = useChat(conversationId, { currentUserId: user?.id, onBeforePrepend: rememberAnchor })
  const { status, participant, messages, hasOlder, older, polling } = chat
  const name = participant?.displayName || 'Sesh surfer'
  const firstId = messages[0]?.id
  const last = messages.at(-1)

  // Older messages inserted: put the anchor message back where it was
  useLayoutEffect(() => {
    const history = historyRef.current
    const anchor = anchorRef.current
    if (!history || !anchor) return
    anchorRef.current = null
    const element = [...history.querySelectorAll('[data-message-id]')].find((item) => item.dataset.messageId === anchor.id)
    if (element) history.scrollTop = element.offsetTop - anchor.offset
  }, [firstId])

  // First load: newest message. New messages: follow them when appropriate.
  useLayoutEffect(() => {
    const history = historyRef.current
    if (status !== 'ready' || !history) return
    const ownMessage = last && last.senderId === user?.id
    if (!scrolledInitiallyRef.current || nearBottomRef.current || ownMessage) {
      history.scrollTop = history.scrollHeight
      nearBottomRef.current = true
    }
    scrolledInitiallyRef.current = true
  }, [status, last, user?.id])

  function handleScroll() {
    const history = historyRef.current
    nearBottomRef.current = history.scrollHeight - history.scrollTop - history.clientHeight <= NEAR_BOTTOM_PX
  }

  function retryLoad() {
    chat.retry()
    containerRef.current?.focus() // "Try again" disappears; keep focus in the chat
  }

  let statusText = ''
  if (status === 'loading') statusText = 'Loading conversation…'
  else if (older.status === 'loading') statusText = 'Loading earlier messages…'
  else if (polling.problem) statusText = POLL_PROBLEM_MESSAGE

  let content
  if (status === 'loading') {
    content = (
      <div className={`flex items-center justify-center ${HISTORY_HEIGHT}`}>
        <p aria-hidden="true" className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle size={20} className="animate-spin text-teal" />
          Loading conversation…
        </p>
      </div>
    )
  } else if (status === 'error') {
    content = (
      <div className="py-6">
        <Alert title="We couldn’t load this conversation">{chat.error}</Alert>
        <Button variant="outline" className="mt-4" onClick={retryLoad}>
          Try again
        </Button>
      </div>
    )
  } else if (status === 'not-found') {
    content = (
      <EmptyState
        className="mt-2"
        icon={MessageSquareOff}
        title="Conversation not found"
        description="This conversation doesn’t exist or isn’t available to you."
        action={
          <Button variant="outline" to="/messages">
            Back to Messages
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        <section
          ref={historyRef}
          aria-label="Message history"
          tabIndex={0}
          onScroll={handleScroll}
          className={`overflow-y-auto overscroll-contain rounded-xl py-2 outline-none focus-visible:outline-2 focus-visible:outline-blue ${HISTORY_HEIGHT}`}
        >
          {hasOlder && (
            <div className="mb-4 flex flex-col items-center gap-3">
              {older.status === 'error' && (
                <Alert className="w-full" title="We couldn’t load earlier messages">
                  {older.error}
                </Alert>
              )}
              <Button variant="outline" size="sm" loading={older.status === 'loading'} onClick={chat.loadOlder}>
                {older.status === 'loading' ? 'Loading…' : older.status === 'error' ? 'Try again' : 'Load earlier messages'}
              </Button>
            </div>
          )}

          {messages.length === 0 ? (
            <EmptyState
              className="bg-transparent"
              icon={MessageCircle}
              title="No messages yet"
              description={`Say hi to ${name} and plan your next session.`}
            />
          ) : (
            <ol aria-label="Messages" className="flex flex-col gap-4 px-0.5">
              {messages.map((message) => {
                const fromMe = message.senderId === user?.id
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    fromMe={fromMe}
                    name={name}
                    avatarUrl={participant?.avatarUrl}
                    now={now}
                  />
                )
              })}
            </ol>
          )}
        </section>

        <div className="mt-4 flex flex-col gap-3">
          {/* Read by screen readers from the status region (once), so hidden here */}
          {polling.problem && (
            <p aria-hidden="true" className="text-xs text-muted">
              {POLL_PROBLEM_MESSAGE}
            </p>
          )}
          {polling.stopped ? (
            <Alert title={polling.stopped === 'gone' ? 'You can’t send messages here' : 'You’ve been signed out'}>{polling.message}</Alert>
          ) : (
            <MessageComposer onSend={chat.send} sending={chat.sending} error={chat.sendError} />
          )}
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ChatHeader participant={status === 'ready' ? (participant ?? {}) : null} name={name} />

      {/* Outside the aria-busy area, so they are not held back */}
      <p role="status" className="sr-only">
        {statusText}
      </p>
      <p aria-live="polite" className="sr-only">
        {announcementText(chat.announcement, name)}
      </p>

      <div ref={containerRef} tabIndex={-1} aria-busy={status === 'loading'} className="rounded-xl outline-none">
        {content}
      </div>
    </div>
  )
}

export default ChatView
