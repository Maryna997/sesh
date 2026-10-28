import { Navigate, Outlet, useSearchParams } from 'react-router'
import { useAuth } from './useAuth'
import { AUTH_STATUS } from './authContext'
import { CREATE_PROFILE_PATH, getSafeReturnPath } from './returnPath'
import { SessionChecking } from '../components/auth/SessionStatus'

// Layout route for /login and /register.
// Signed-in users are sent on to the app: to the page they originally asked
// for (?returnTo=, if it is a safe internal path) or /discover. Users
// without a surfer profile go to /create-profile first. This is also what
// moves the user on right after a successful login.
// If the session check failed, the forms are still shown, so the user can
// try to log in.
function PublicOnlyRoute() {
  const { status, hasCompletedProfile } = useAuth()
  const [searchParams] = useSearchParams()

  if (status === AUTH_STATUS.CHECKING) return <SessionChecking />
  if (status === AUTH_STATUS.AUTHENTICATED) {
    const target = hasCompletedProfile ? getSafeReturnPath(searchParams.get('returnTo')) : CREATE_PROFILE_PATH
    return <Navigate to={target} replace />
  }

  return <Outlet />
}

export default PublicOnlyRoute
