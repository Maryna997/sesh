import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { TriangleAlert } from 'lucide-react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import settingsImage from '../assets/profile-ocean.jpg'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { deleteAccount } from '../api/account'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'

export const CONFIRMATION_WORD = 'DELETE'

// /settings/delete-account: permanently delete the account.
// - The destructive button stays disabled until the field holds exactly
//   "DELETE" (no trimming, no case folding; the server checks it again).
// - One click deletes: no password, no second dialog, no email (by design).
// - "Cancel and go back" returns to Settings without changing anything.
// - On success the server has already ended the session and cleared the
//   cookie; the app shows the user as signed out and goes to the home page.
function DeleteAccountPage() {
  const { endSession, refreshSession } = useAuth()
  const navigate = useNavigate()
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const deletingRef = useRef(false)
  const aliveRef = useRef(true)
  const warningId = useId()

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const isConfirmed = confirmation === CONFIRMATION_WORD

  async function handleSubmit(event) {
    event.preventDefault()
    if (!isConfirmed || deletingRef.current) return
    deletingRef.current = true
    setIsDeleting(true)
    setError(null)
    try {
      await deleteAccount(confirmation)
      endSession()
      navigate('/', { replace: true })
    } catch (requestError) {
      deletingRef.current = false
      if (!aliveRef.current) return
      setIsDeleting(false)
      if (requestError?.kind === 'http' && (requestError.status === 502 || requestError.status === 503) && requestError.message) {
        setError(requestError.message) // the server explains that nothing was deleted
        return
      }
      const { message, recheckSession } = describeProtectedRequestError(requestError)
      if (recheckSession) refreshSession()
      setError(message)
    }
  }

  return (
    <AuthPageLayout
      pageName="Settings & Privacy"
      image={settingsImage}
      heading="Delete Account"
      backTo="/settings"
      backLabel="Back to Settings"
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <h2 className="text-[17px] font-bold text-ink">Delete your Sesh account?</h2>
          <p className="mt-2 text-[13px] text-muted">
            This action permanently removes your account and profile and cannot be undone.
          </p>
        </div>

        {/* Static warning (read with the field through aria-describedby), not an alert */}
        <div id={warningId} className="flex gap-3 rounded-[10px] border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink">
          <TriangleAlert size={18} aria-hidden="true" className="mt-px shrink-0" />
          <p>
            Your account and profile will be permanently deleted. Existing messages may remain visible to other participants, but
            they won’t be able to contact you.
          </p>
        </div>

        {error && <Alert title="Your account wasn’t deleted">{error}</Alert>}

        <Input
          label={`Type ${CONFIRMATION_WORD} to confirm`}
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={warningId}
          disabled={isDeleting}
        />

        <div className="mt-3 flex flex-col gap-3">
          <Button type="submit" variant="danger" size="lg" fullWidth disabled={!isConfirmed} loading={isDeleting}>
            Permanently delete account
          </Button>
          <Button variant="text" size="sm" to="/settings" className="w-full">
            Cancel and go back
          </Button>
        </div>
      </form>
    </AuthPageLayout>
  )
}

export default DeleteAccountPage
