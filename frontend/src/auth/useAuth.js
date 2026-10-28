import { useContext } from 'react'
import { AuthContext } from './authContext'

// Gives components the auth state and actions:
// { status, user, hasCompletedProfile, error, isAuthenticated,
//   checkSession, refreshSession, login, logout }
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.')
  }
  return context
}
