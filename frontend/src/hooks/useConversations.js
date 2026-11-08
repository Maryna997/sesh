import { useCallback, useEffect, useRef, useState } from 'react'
import { getConversations } from '../api/conversations'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'

// Adds the conversations that aren't in the list yet (by id), keeping the
// server's order. With page-based pagination a conversation can move to an
// earlier page while someone browses (new activity), so a later page may
// repeat one that is already shown.
function appendNew(current, incoming) {
  const ids = new Set(current.map((conversation) => conversation.id))
  const added = []
  for (const conversation of Array.isArray(incoming) ? incoming : []) {
    if (conversation?.id && !ids.has(conversation.id)) {
      ids.add(conversation.id)
      added.push(conversation)
    }
  }
  return [...current, ...added]
}

// The signed-in surfer's conversations (GET /api/v1/conversations), the same
// pattern as Discover's results:
// - page 1 is loaded on mount and on retry(); an answer from an older load is
//   ignored, so it can't replace newer results;
// - loadMore() appends the next page without duplicates; repeated calls
//   while a page loads are ignored, and a failure keeps what is shown;
// - 401 / 403 PROFILE_REQUIRED refresh the session, so the route guards send
//   the user to log in or to Create Profile (nothing is retried automatically).
// No polling: the inbox is loaded when the page is opened.
//
// Returns { status: 'loading' | 'ready' | 'error', conversations, total, hasMore,
//           error, more: { status: 'idle' | 'loading' | 'error', error }, loadMore, retry }.
export function useConversations() {
  const { refreshSession } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [more, setMore] = useState({ loadId: null, status: 'idle', error: null })
  const loadIdRef = useRef(0)
  const loadingMoreRef = useRef(false)

  const errorMessage = useCallback(
    (error) => {
      const { message, recheckSession } = describeProtectedRequestError(error)
      if (recheckSession) refreshSession()
      return message
    },
    [refreshSession],
  )

  useEffect(() => {
    const loadId = ++loadIdRef.current
    loadingMoreRef.current = false
    const isLatest = () => loadId === loadIdRef.current
    getConversations({ page: 1 }).then(
      (data) =>
        isLatest() &&
        setResult({ loadId, attempt, status: 'ready', conversations: appendNew([], data.conversations), pagination: data.pagination ?? null, error: null }),
      (error) => isLatest() && setResult({ loadId, attempt, status: 'error', conversations: [], pagination: null, error: errorMessage(error) }),
    )
  }, [attempt, errorMessage])

  const isCurrent = result !== null && result.attempt === attempt
  const pagination = isCurrent ? result.pagination : null
  const hasMore = Boolean(pagination && pagination.page < pagination.totalPages)

  const loadMore = useCallback(() => {
    if (!isCurrent || result.status !== 'ready' || !hasMore || loadingMoreRef.current) return
    const { loadId } = result
    loadingMoreRef.current = true
    setMore({ loadId, status: 'loading', error: null })

    getConversations({ page: pagination.page + 1 }).then(
      (data) => {
        if (loadId !== loadIdRef.current) return
        loadingMoreRef.current = false
        setResult((current) => ({
          ...current,
          conversations: appendNew(current.conversations, data.conversations),
          pagination: data.pagination ?? current.pagination,
        }))
        setMore({ loadId, status: 'idle', error: null })
      },
      (error) => {
        if (loadId !== loadIdRef.current) return
        loadingMoreRef.current = false
        setMore({ loadId, status: 'error', error: errorMessage(error) })
      },
    )
  }, [isCurrent, result, hasMore, pagination, errorMessage])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  const moreState = isCurrent && more.loadId === result.loadId ? more : { status: 'idle', error: null }

  return {
    status: isCurrent ? result.status : 'loading',
    conversations: isCurrent ? result.conversations : [],
    total: pagination?.total ?? 0,
    hasMore,
    error: isCurrent ? result.error : null,
    more: { status: moreState.status, error: moreState.error },
    loadMore,
    retry,
  }
}
