import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getMessages, sendMessage } from '../api/conversations'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'

// New messages are fetched every 5 seconds while the conversation is open
// and the browser tab is visible (HTTP polling, no real-time connection).
export const POLL_INTERVAL_MS = 5000

export const CONVERSATION_GONE_MESSAGE = 'This conversation is no longer available.'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isNotFound = (error) => error?.kind === 'http' && error.status === 404
// The other surfer deleted their account: the conversation is read-only
const isInactive = (error) => error?.kind === 'http' && error.status === 409 && error.code === 'CONVERSATION_INACTIVE'
const asList = (value) => (Array.isArray(value) ? value : [])

// Adds the messages that aren't in the list yet (by id), keeping the order
function appendNew(current, incoming) {
  const ids = new Set(current.map((message) => message.id))
  const added = incoming.filter((message) => message?.id && !ids.has(message.id) && ids.add(message.id))
  return added.length > 0 ? [...current, ...added] : current
}

// Puts older messages (oldest first) in front of the list, without duplicates
function prependNew(current, older) {
  const ids = new Set(current.map((message) => message.id))
  const added = older.filter((message) => message?.id && !ids.has(message.id) && ids.add(message.id))
  return added.length > 0 ? [...added, ...current] : current
}

// One conversation: history, sending and polling. The page renders it with
// key={conversationId}, so opening another conversation starts from scratch
// (no state, timer or answer of the previous one can leak into it).
//
// Messages are kept in two lists, both in the server's order:
// - `confirmed`: what the server returned in history or polling responses
//   (oldest first). Polling appends, "Load earlier" prepends, both skip ids
//   already shown. Nothing is ever sorted on this device.
// - `sent`: my messages the server accepted, until polling returns them (then
//   they are dropped from `sent`). They are shown after the confirmed ones.
//   Because the backend commits a conversation's messages in (created_at, id)
//   order, a poll that returns anything newer than my message also returns
//   my message, so this never shows a wrong order for long.
//
// Polling cursor: the initial response's pollCursor (the newest message),
// then each poll's nextCursor, stored only after the answer was applied.
// Sending never moves it, so no other message can be skipped. A conversation
// without messages has no cursor: until the first message arrives, polling
// asks for the latest messages (the backend's documented way), then switches
// to the cursor.
//
// Who the other surfer is comes from the history response's `conversation`
// ({ id, isActive, otherParticipant }). isActive false means they deleted
// their account: the history stays readable, nothing is polled or sent
// (polling.stopped 'inactive'). Polling answers carry the same field, so a
// conversation that becomes inactive while open stops too; a 409
// CONVERSATION_INACTIVE when sending does the same.
//
// Returns { status: 'loading' | 'ready' | 'not-found' | 'error', error,
//   isActive, participant, messages, hasOlder, older: { status, error }, loadOlder,
//   send(text) -> Promise<boolean>, sending, sendError,
//   polling: { problem, stopped: null | 'gone' | 'session' | 'inactive', message },
//   announcement, retry }.
export function useChat(conversationId, { currentUserId, onBeforePrepend } = {}) {
  const { refreshSession } = useAuth()
  const validId = typeof conversationId === 'string' && UUID_PATTERN.test(conversationId)

  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState({ attempt: -1, status: 'loading', error: null, participant: null })
  const [confirmed, setConfirmed] = useState([])
  const [sent, setSent] = useState([])
  const [older, setOlder] = useState({ cursor: null, status: 'idle', error: null })
  const [polling, setPolling] = useState({ problem: false, stopped: null, message: null })
  const [sendState, setSendState] = useState({ status: 'idle', error: null })
  // The latest thing to announce to screen readers: incoming messages or "sent"
  const [announcement, setAnnouncement] = useState(null)

  const aliveRef = useRef(true)
  const loadIdRef = useRef(0)
  const pollCursorRef = useRef(null)
  const olderLoadingRef = useRef(false)
  const sendingRef = useRef(false)
  const currentUserRef = useRef(currentUserId)
  const beforePrependRef = useRef(onBeforePrepend)
  useEffect(() => {
    currentUserRef.current = currentUserId
    beforePrependRef.current = onBeforePrepend
  })

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // 401 / 403 PROFILE_REQUIRED: refresh the session so the route guards take over
  const errorMessage = useCallback(
    (error) => {
      const { message, recheckSession } = describeProtectedRequestError(error)
      if (recheckSession) refreshSession()
      return { message, recheckSession }
    },
    [refreshSession],
  )

  // Messages from history or polling responses (in the server's order)
  const addConfirmed = useCallback((incoming) => {
    if (incoming.length === 0) return
    const ids = new Set(incoming.map((message) => message.id))
    setConfirmed((current) => appendNew(current, incoming))
    setSent((current) => (current.some((message) => ids.has(message.id)) ? current.filter((message) => !ids.has(message.id)) : current))
  }, [])

  // ---------- Initial history (and Try again) ----------
  useEffect(() => {
    if (!validId) return
    const loadId = ++loadIdRef.current
    const isLatest = () => aliveRef.current && loadId === loadIdRef.current
    getMessages(conversationId).then(
      (history) => {
        if (!isLatest()) return
        const pagination = history.pagination ?? {}
        const isActive = history.conversation?.isActive !== false
        pollCursorRef.current = pagination.pollCursor ?? null
        setConfirmed(appendNew([], [...asList(history.messages)].reverse())) // newest first → oldest first
        setSent([])
        setOlder({ cursor: pagination.hasMore ? (pagination.nextCursor ?? null) : null, status: 'idle', error: null })
        setPolling({ problem: false, stopped: isActive ? null : 'inactive', message: null })
        setLoad({ attempt, status: 'ready', error: null, isActive, participant: isActive ? (history.conversation?.otherParticipant ?? null) : null })
      },
      (failure) => {
        if (!isLatest()) return
        if (isNotFound(failure)) return setLoad({ attempt, status: 'not-found', error: null, participant: null })
        setLoad({ attempt, status: 'error', error: errorMessage(failure).message, participant: null })
      },
    )
  }, [conversationId, validId, attempt, errorMessage])

  const status = !validId ? 'not-found' : load.attempt === attempt ? load.status : 'loading'
  const isReady = status === 'ready'
  const pollingStopped = polling.stopped !== null

  // ---------- Polling ----------
  // One request at a time: the next one is scheduled only after the previous
  // answer was handled (a setTimeout chain, not setInterval). Hidden tab: the
  // chain pauses and restarts with an immediate check when the tab is visible
  // again. Leaving the page (or another conversation) cancels the timer and
  // ignores an answer still on its way.
  useEffect(() => {
    if (!isReady || pollingStopped) return
    let cancelled = false
    let timer = null
    let inFlight = false

    async function poll() {
      timer = null
      if (cancelled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      let delay = POLL_INTERVAL_MS
      try {
        const cursor = pollCursorRef.current
        const data = await getMessages(conversationId, cursor ? { after: cursor } : {})
        if (cancelled) return
        const pagination = data.pagination ?? {}
        const list = asList(data.messages)
        // With a cursor: newer messages, oldest first. Without (no messages
        // yet): the latest page, newest first.
        const incoming = cursor ? list : [...list].reverse()
        addConfirmed(incoming)
        const fromOthers = incoming.filter((message) => message.senderId !== currentUserRef.current)
        if (fromOthers.length > 0) {
          setAnnouncement((previous) => ({ key: (previous?.key ?? 0) + 1, kind: 'incoming', count: fromOthers.length, last: fromOthers.at(-1) }))
        }
        if (cursor) {
          if (pagination.nextCursor) pollCursorRef.current = pagination.nextCursor
          if (pagination.hasMore && list.length > 0) delay = 0 // more are waiting: catch up now
        } else if (list.length > 0) {
          pollCursorRef.current = pagination.pollCursor ?? null
          // More than one page arrived at once: the rest is under "Load earlier"
          if (pagination.hasMore && pagination.nextCursor) {
            setOlder((current) => (current.cursor ? current : { ...current, cursor: pagination.nextCursor }))
          }
        }
        setPolling((current) => (current.problem ? { ...current, problem: false } : current))
        // The other surfer deleted their account meanwhile: stop (read-only now)
        if (data.conversation?.isActive === false) {
          cancelled = true
          setPolling({ problem: false, stopped: 'inactive', message: null })
          return
        }
      } catch (error) {
        if (cancelled) return
        if (isNotFound(error)) {
          cancelled = true
          setPolling({ problem: false, stopped: 'gone', message: CONVERSATION_GONE_MESSAGE })
          return
        }
        const { message, recheckSession } = errorMessage(error)
        if (recheckSession) {
          cancelled = true
          setPolling({ problem: false, stopped: 'session', message })
          return
        }
        // Network or server problem: keep everything, try again next time
        setPolling((current) => (current.problem ? current : { ...current, problem: true }))
      } finally {
        inFlight = false
      }
      if (!cancelled) timer = setTimeout(poll, delay)
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && timer === null && !inFlight && !cancelled) poll()
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [conversationId, isReady, pollingStopped, addConfirmed, errorMessage])

  // ---------- Load earlier messages ----------
  const loadOlder = useCallback(() => {
    if (!isReady || !older.cursor || olderLoadingRef.current) return
    olderLoadingRef.current = true
    const loadId = loadIdRef.current
    const isLatest = () => aliveRef.current && loadId === loadIdRef.current
    setOlder((current) => ({ ...current, status: 'loading', error: null }))

    getMessages(conversationId, { before: older.cursor }).then(
      (data) => {
        if (!isLatest()) return
        olderLoadingRef.current = false
        const pagination = data.pagination ?? {}
        beforePrependRef.current?.() // lets the page keep the scroll position
        setConfirmed((current) => prependNew(current, [...asList(data.messages)].reverse()))
        setOlder({ cursor: pagination.hasMore ? (pagination.nextCursor ?? null) : null, status: 'idle', error: null })
      },
      (error) => {
        if (!isLatest()) return
        olderLoadingRef.current = false
        const message = isNotFound(error) ? CONVERSATION_GONE_MESSAGE : errorMessage(error).message
        setOlder((current) => ({ ...current, status: 'error', error: message }))
      },
    )
  }, [conversationId, isReady, older.cursor, errorMessage])

  // ---------- Sending ----------
  // Shown once the server confirms it (no optimistic bubble). Resolves to
  // true when sent, so the composer clears the draft only then.
  const send = useCallback(
    async (text) => {
      if (!isReady || pollingStopped || sendingRef.current) return false
      sendingRef.current = true
      setSendState({ status: 'sending', error: null })
      try {
        const { message } = await sendMessage(conversationId, text)
        if (!aliveRef.current) return true
        if (message?.id) setSent((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]))
        setSendState({ status: 'idle', error: null })
        setAnnouncement((previous) => ({ key: (previous?.key ?? 0) + 1, kind: 'sent' }))
        return true
      } catch (error) {
        if (!aliveRef.current) return false
        let message
        if (isInactive(error)) {
          // Expected state, not an error: the page shows "no longer active"
          setPolling({ problem: false, stopped: 'inactive', message: null })
          setSendState({ status: 'idle', error: null })
          return false
        }
        if (isNotFound(error)) {
          message = CONVERSATION_GONE_MESSAGE
          setPolling({ problem: false, stopped: 'gone', message })
        } else if (error?.kind === 'http' && error.status === 400) {
          message = error.fieldErrors?.body || 'Please check your message.'
        } else {
          message = errorMessage(error).message
        }
        setSendState({ status: 'error', error: message })
        return false
      } finally {
        sendingRef.current = false
      }
    },
    [conversationId, isReady, pollingStopped, errorMessage],
  )

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  const messages = useMemo(() => {
    if (sent.length === 0) return confirmed
    const ids = new Set(confirmed.map((message) => message.id))
    const waiting = sent.filter((message) => !ids.has(message.id))
    return waiting.length > 0 ? [...confirmed, ...waiting] : confirmed
  }, [confirmed, sent])

  return {
    status,
    error: status === 'error' ? load.error : null,
    // false once the other surfer deleted their account (from the server)
    isActive: isReady ? load.isActive !== false && polling.stopped !== 'inactive' : true,
    participant: isReady ? load.participant : null,
    messages: isReady ? messages : [],
    hasOlder: isReady && Boolean(older.cursor),
    older: { status: older.status, error: older.error },
    loadOlder,
    send,
    sending: sendState.status === 'sending',
    sendError: sendState.status === 'error' ? sendState.error : null,
    polling,
    announcement,
    retry,
  }
}
