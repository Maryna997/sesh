import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth'
import { DEFAULT_AFTER_LOGIN } from './returnPath'

// Layout route for /create-profile. Used inside RequireAuth, so visitors
// never get here. Users who already have a profile are sent on to Discover,
// so nobody is taken through onboarding twice. This is also what moves the
// user on once their new profile is confirmed by the server.
//
// RequireCompletedProfile does the opposite check, so the two can never
// redirect back and forth.
function OnboardingRoute() {
  const { hasCompletedProfile } = useAuth()

  if (hasCompletedProfile) return <Navigate to={DEFAULT_AFTER_LOGIN} replace />

  return <Outlet />
}

export default OnboardingRoute
