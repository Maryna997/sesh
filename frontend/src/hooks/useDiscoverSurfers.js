import { useCallback, useEffect, useRef, useState } from 'react'
import { getDiscoverSurfers } from '../api/discover'
import { getRequestErrorMessage, SESSION_ENDED_MESSAGE } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { buildDiscoverQuery } from '../utils/discoverFilters'

export const PROFILE_REQUIRED_MESSAGE = 'Finish your surfer profile to use Discover.'

// Adds the surfers that aren't in the list yet (by userId), keeping order.
// A surfer can move between pages while someone is browsing (offset
// pagination), so a later page may repeat a card that is already shown.
function appendNew(current, incoming) {
  const ids = new Set(current.map((surfer) => surfer.userId))
  const added = []
  for (const surfer of Array.isArray(incoming) ? incoming : []) {
    if (surfer?.userId && !ids.has(surfer.userId)) {
      ids.add(surfer.userId)
      added.push(surfer)
    }
  }
  return [...current, ...added]
}

// Loads Discover results for the given filters (GET /api/v1/discover).
//
// - A new search (page 1) starts whenever `filters` changes, or on retry().
//   Each search gets an id; answers from an older search are ignored, so a
//   slow response can never replace the results of newer filters.
// - The query (including the arrival bounds, calculated once from the time
//   of the search) is kept for "Load more", so every page belongs to the
//   same search.
// - loadMore() appends the next page without duplicates; repeated calls
//   while a page is loading are ignored.
// - A 401 (session ended) or 403 PROFILE_REQUIRED refreshes the auth state,
//   so the route guards send the user to log in or to Create Profile.
//
// Returns { status: 'loading' | 'ready' | 'error', surfers, total, hasMore,
//           error, more: { status: 'idle' | 'loading' | 'error', error }, loadMore, retry }.
export function useDiscoverSurfers(filters) {
  const { refreshSession } = useAuth()
  const [attempt, setAttempt] = useState(0)
  // The latest finished search; it is "loading" while it belongs to other filters
  const [result, setResult] = useState(null)
  const [more, setMore] = useState({ searchId: null, status: 'idle', error: null })
  const searchIdRef = useRef(0)
  const loadingMoreRef = useRef(false)

  // A friendly message for a failed request (never the server's own text).
  // An ended session (401) or a missing profile (403 PROFILE_REQUIRED) asks
  // the server about the session again; the existing route guards then send
  // the user to log in or to Create Profile. Nothing is retried
  // automatically, so this can't loop.
  const errorMessage = useCallback(
    (error) => {
      const status = error?.kind === 'http' ? error.status : null
      if (status === 401) {
        refreshSession()
        return SESSION_ENDED_MESSAGE
      }
      if (status === 403 && error.code === 'PROFILE_REQUIRED') {
        refreshSession()
        return PROFILE_REQUIRED_MESSAGE
      }
      return getRequestErrorMessage(error)
    },
    [refreshSession],
  )

  useEffect(() => {
    const searchId = ++searchIdRef.current
    loadingMoreRef.current = false
    const query = buildDiscoverQuery(filters, new Date())
    const isLatest = () => searchId === searchIdRef.current
    const finish = (fields) => setResult({ searchId, filters, attempt, query, ...fields })
    // Answers (successes and failures) of an older search are ignored
    getDiscoverSurfers(query).then(
      (data) =>
        isLatest() &&
        finish({ status: 'ready', surfers: appendNew([], data.surfers), pagination: data.pagination ?? null, error: null }),
      (error) => isLatest() && finish({ status: 'error', surfers: [], pagination: null, error: errorMessage(error) }),
    )
  }, [filters, attempt, errorMessage])

  const isCurrent = result !== null && result.filters === filters && result.attempt === attempt
  const pagination = isCurrent ? result.pagination : null
  const hasMore = Boolean(pagination && pagination.page < pagination.totalPages)

  const loadMore = useCallback(() => {
    if (!isCurrent || result.status !== 'ready' || !hasMore || loadingMoreRef.current) return
    const { searchId, query } = result
    loadingMoreRef.current = true
    setMore({ searchId, status: 'loading', error: null })

    getDiscoverSurfers({ ...query, page: String(pagination.page + 1) }).then(
      (data) => {
        if (searchId !== searchIdRef.current) return
        loadingMoreRef.current = false
        setResult((current) => ({
          ...current,
          surfers: appendNew(current.surfers, data.surfers),
          pagination: data.pagination ?? current.pagination,
        }))
        setMore({ searchId, status: 'idle', error: null })
      },
      (error) => {
        if (searchId !== searchIdRef.current) return
        loadingMoreRef.current = false
        setMore({ searchId, status: 'error', error: errorMessage(error) })
      },
    )
  }, [isCurrent, result, hasMore, pagination, errorMessage])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  const moreState = isCurrent && more.searchId === result.searchId ? more : { status: 'idle', error: null }

  return {
    status: isCurrent ? result.status : 'loading',
    surfers: isCurrent ? result.surfers : [],
    total: pagination?.total ?? 0,
    hasMore,
    error: isCurrent ? result.error : null,
    more: { status: moreState.status, error: moreState.error },
    loadMore,
    retry,
  }
}
