import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext, AUTH_STATUS } from './authContext'
import { getCurrentUser, logIn, logOut } from '../api/auth'

// Asks the server whether the session cookie is valid and returns the
// matching auth state. A network or server problem gives the "error" state
// (we can't tell whether the user is signed in), never "unauthenticated".
async function requestSessionState() {
  try {
    const { user } = await getCurrentUser()
    return { status: AUTH_STATUS.AUTHENTICATED, user, error: null }
  } catch (error) {
    if (error.kind === 'http' && error.status === 401) {
      return { status: AUTH_STATUS.UNAUTHENTICATED, user: null, error: null }
    }
    return { status: AUTH_STATUS.ERROR, user: null, error }
  }
}

// Keeps track of who is signed in.
//
// Nothing about the session is stored in the browser by our code: the
// session token is an HttpOnly cookie that only the browser and server can
// see. On page load we ask the server (GET /api/v1/auth/me) whether that
// cookie is still valid, which restores the signed-in state after a reload.
function AuthProvider({ children }) {
  const [state, setState] = useState({ status: AUTH_STATUS.CHECKING, user: null, error: null })

  // Ignores answers from older checks if a newer one has started
  const latestCheck = useRef(0)

  // Asks the server, then applies the answer unless a newer check started
  const loadSession = useCallback(() => {
    const checkId = ++latestCheck.current
    return requestSessionState().then((nextState) => {
      if (checkId === latestCheck.current) setState(nextState)
    })
  }, [])

  // On page load (the initial state is already "checking")
  useEffect(() => {
    loadSession()
  }, [loadSession])

  // "Try again" after a failed check: show "checking" again, then ask
  const checkSession = useCallback(() => {
    setState((current) => ({ ...current, status: AUTH_STATUS.CHECKING, error: null }))
    return loadSession()
  }, [loadSession])

  // Throws an ApiError if login fails (the login page shows the message).
  const login = useCallback(async ({ email, password }) => {
    const { user } = await logIn({ email, password })
    latestCheck.current++ // a pending session check must not override this
    setState({ status: AUTH_STATUS.AUTHENTICATED, user, error: null })
    return user
  }, [])

  // Only marks the user as signed out once the server has ended the session.
  // If the request fails, the state is unchanged and the error is thrown.
  // `loggedOut: true` tells the route guard this was a deliberate logout, so
  // it sends the user home instead of to the login page.
  const logout = useCallback(async () => {
    await logOut()
    latestCheck.current++
    setState({ status: AUTH_STATUS.UNAUTHENTICATED, user: null, error: null, loggedOut: true })
  }, [])

  const value = useMemo(
    () => ({ ...state, isAuthenticated: state.status === AUTH_STATUS.AUTHENTICATED, checkSession, login, logout }),
    [state, checkSession, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
