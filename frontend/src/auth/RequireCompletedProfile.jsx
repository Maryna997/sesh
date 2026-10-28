import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth'
import { CREATE_PROFILE_PATH } from './returnPath'

// Layout route for the main app pages (Discover, Status, Messages...).
// Used inside RequireAuth, so the user is already signed in here.
// Users who haven't created their surfer profile are sent to onboarding,
// also when they type a protected URL directly. The flag comes from the
// server (GET /auth/me), so it survives reloads and new devices.
function RequireCompletedProfile() {
  const { hasCompletedProfile } = useAuth()

  if (!hasCompletedProfile) return <Navigate to={CREATE_PROFILE_PATH} replace />

  return <Outlet />
}

export default RequireCompletedProfile
