import { LoaderCircle } from 'lucide-react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import { useAuth } from '../../auth/useAuth'

// Shown while the app asks the server whether the visitor is signed in,
// so pages don't flash the wrong content or redirect too early.
export function SessionChecking() {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-muted">
      <LoaderCircle size={20} className="animate-spin text-teal" aria-hidden="true" />
      Checking your session…
    </div>
  )
}

// Shown when the session check failed because of a network or server
// problem. We don't know whether the user is signed in, so we don't
// redirect them to login; they can retry instead.
export function SessionCheckFailed() {
  const { checkSession } = useAuth()

  return (
    <div className="max-w-md py-6">
      <Alert title="We couldn’t check your session">
        Sesh can’t be reached right now. Check your connection and try again.
      </Alert>
      <Button variant="outline" className="mt-4" onClick={checkSession}>
        Try again
      </Button>
    </div>
  )
}
