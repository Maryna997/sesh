import { Navigate, Outlet, useSearchParams } from 'react-router'
import { useAuth } from './useAuth'
import { AUTH_STATUS } from './authContext'
import { getSafeReturnPath } from './returnPath'
import { SessionChecking } from '../components/auth/SessionStatus'

// Layout route for /login and /register.
// Signed-in users are sent on to the app: to the page they originally asked
// for (?returnTo=, if it is a safe internal path) or /discover. This is also
// what moves the user on right after a successful login.
// If the session check failed, the forms are still shown, so the user can
// try to log in.
function PublicOnlyRoute() {
  const { status } = useAuth()
  const [searchParams] = useSearchParams()

  if (status === AUTH_STATUS.CHECKING) return <SessionChecking />
  if (status === AUTH_STATUS.AUTHENTICATED) {
    return <Navigate to={getSafeReturnPath(searchParams.get('returnTo'))} replace />
  }

  return <Outlet />
}

export default PublicOnlyRoute
