import { useCallback, useState } from 'react'
import { useAuth } from './useAuth'
import { getRequestErrorMessage } from '../api/errorMessages'

// Logout for the header menus. The session is ended on the server first;
// only then is the user shown as signed out. Protected pages then send the
// user to the home page (see RequireAuth).
// If the request fails, the user stays signed in and `error` explains why,
// instead of pretending the logout worked.
export function useLogout({ onSuccess } = {}) {
  const { logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState(null)

  const logoutAndLeave = useCallback(async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    setError(null)
    try {
      await logout()
      onSuccess?.()
    } catch (requestError) {
      setError(`Logout failed. ${getRequestErrorMessage(requestError)}`)
      setIsLoggingOut(false)
    }
  }, [isLoggingOut, logout, onSuccess])

  return { logoutAndLeave, isLoggingOut, error }
}
