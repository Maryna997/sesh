import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'
import { AUTH_STATUS } from './authContext'
import { buildLoginPath } from './returnPath'
import { SessionChecking, SessionCheckFailed } from '../components/auth/SessionStatus'

// Layout route that only lets signed-in users through.
// - checking:        shows a loading message (no redirect yet, no flicker)
// - error:           shows a "try again" message (not treated as logged out)
// - unauthenticated: redirects to /login?returnTo=<this page>,
//                    or to the home page right after the user logged out
// - authenticated:   renders the page
function RequireAuth() {
  const { status, loggedOut } = useAuth()
  const location = useLocation()

  if (status === AUTH_STATUS.CHECKING) return <SessionChecking />
  if (status === AUTH_STATUS.ERROR) return <SessionCheckFailed />
  if (status === AUTH_STATUS.UNAUTHENTICATED) {
    return <Navigate to={loggedOut ? '/' : buildLoginPath(location)} replace />
  }

  return <Outlet />
}

export default RequireAuth
