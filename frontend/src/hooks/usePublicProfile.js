import { useCallback, useEffect, useState } from 'react'
import { getPublicProfile } from '../api/profile'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'

// Loads another surfer's public profile (GET /api/v1/profiles/:userId).
//
// - A new request starts when `userId` changes (or on retry()). Only the
//   answer for the current userId and attempt is shown, so a slow answer for
//   a previous surfer never appears, and nothing is set after unmounting.
// - While a request runs the status is 'loading' (never the previous
//   surfer's data, never empty fields).
// - 404 → 'not-found'. 401 / 403 PROFILE_REQUIRED refresh the auth state, so
//   the route guards take over; nothing is retried automatically.
//
// Returns { status: 'loading' | 'ready' | 'not-found' | 'error', profile, error, retry }.
export function usePublicProfile(userId) {
  const { refreshSession } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let isCurrent = true
    const finish = (fields) => isCurrent && setResult({ userId, attempt, profile: null, error: null, ...fields })
    getPublicProfile(userId).then(
      ({ profile }) => finish(profile ? { status: 'ready', profile } : { status: 'not-found' }),
      (error) => {
        if (!isCurrent) return
        if (error?.kind === 'http' && error.status === 404) return finish({ status: 'not-found' })
        const { message, recheckSession } = describeProtectedRequestError(error)
        if (recheckSession) refreshSession()
        finish({ status: 'error', error: message })
      },
    )
    return () => {
      isCurrent = false
    }
  }, [userId, attempt, refreshSession])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  const isCurrentResult = result !== null && result.userId === userId && result.attempt === attempt

  return {
    status: isCurrentResult ? result.status : 'loading',
    profile: isCurrentResult ? result.profile : null,
    error: isCurrentResult ? result.error : null,
    retry,
  }
}
