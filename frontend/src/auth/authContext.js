import { createContext } from 'react'

// Holds the signed-in state for the whole app (provided by AuthProvider,
// read with the useAuth hook).
export const AuthContext = createContext(null)

// The four states of the session check:
// - checking:        asking the server whether the session cookie is valid
// - authenticated:   signed in; `user` is set, and `hasCompletedProfile`
//                    says whether onboarding (the surfer profile) is done
// - unauthenticated: not signed in (the server said 401)
// - error:           the check failed (network or server problem), so we
//                    don't know yet. This is NOT treated as "logged out".
export const AUTH_STATUS = {
  CHECKING: 'checking',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'error',
}
