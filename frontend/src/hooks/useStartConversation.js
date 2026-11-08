import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { startConversation } from '../api/conversations'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'

export const RECIPIENT_NOT_FOUND_MESSAGE = 'This surfer can’t be messaged right now.'
export const START_FAILED_MESSAGE = 'We couldn’t open this conversation. Please try again.'

// The "Message" action shared by the public surfer profile and the Discover
// cards: POST /api/v1/conversations { recipientUserId } creates the
// conversation or returns the existing one (the backend guarantees one per
// pair), then opens /messages/:conversationId. New (201) and existing (200)
// conversations look the same to the user.
//
// - One request at a time: start() is ignored while a request is pending.
// - Navigation happens only after the server confirmed the conversation.
// - A late answer is ignored when the component is gone (page left, results
//   reloaded) or a newer request was started, so it can't navigate unexpectedly.
// - 401 / 403 PROFILE_REQUIRED refresh the session, so the route guards send
//   the user to log in or to Create Profile. 404 (no such surfer) and other
//   failures show a short message and the action can be tried again.
//
// Returns { start(recipientUserId), pending, error }.
export function useStartConversation() {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState({ pending: false, error: null })
  const aliveRef = useRef(true)
  const requestRef = useRef(0)
  const pendingRef = useRef(false)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const start = useCallback(
    async (recipientUserId) => {
      if (pendingRef.current || !recipientUserId) return
      pendingRef.current = true
      const requestId = ++requestRef.current
      const isCurrent = () => aliveRef.current && requestId === requestRef.current
      setState({ pending: true, error: null })

      try {
        const data = await startConversation(recipientUserId)
        if (!isCurrent()) return
        const id = data?.conversation?.id
        if (typeof id !== 'string' || id === '') {
          setState({ pending: false, error: START_FAILED_MESSAGE })
          return
        }
        navigate(`/messages/${encodeURIComponent(id)}`)
      } catch (error) {
        if (!isCurrent()) return
        let message
        if (error?.kind === 'http' && error.status === 404) message = RECIPIENT_NOT_FOUND_MESSAGE
        else if (error?.kind === 'http' && error.status === 400) message = error.fieldErrors?.recipientUserId || START_FAILED_MESSAGE
        else {
          const described = describeProtectedRequestError(error)
          if (described.recheckSession) refreshSession()
          message = described.message
        }
        setState({ pending: false, error: message })
      } finally {
        pendingRef.current = false
      }
    },
    [navigate, refreshSession],
  )

  return { start, pending: state.pending, error: state.error }
}
