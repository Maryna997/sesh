import { useEffect, useRef, useState } from 'react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import settingsImage from '../assets/profile-ocean.jpg'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { changeEmail } from '../api/account'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { normalizeEmail, validateEmail } from '../utils/validation'

export const SAME_EMAIL_MESSAGE = 'This is already your email address.'

// /settings/email: change the sign-in email. Immediate (no verification
// email and no password, by design for the MVP). The current email is shown
// read-only; the new one uses the registration rules (checked again by the
// server). On success the signed-in state is refreshed, so the new email
// shows everywhere, and the user stays signed in.
function EmailSettingsPage() {
  const { user, refreshSession } = useAuth()
  const [newEmail, setNewEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false) // blocks double submits immediately
  const inputRef = useRef(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const currentEmail = user?.email ?? ''
  const clientError =
    validateEmail(newEmail, { required: true }) ?? (normalizeEmail(newEmail) === currentEmail ? SAME_EMAIL_MESSAGE : undefined)
  const fieldError = ((touched || submitted) && clientError) || serverError

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    setSubmitted(true)
    setFormError(null)
    setSuccess(null)
    setServerError(null)
    if (clientError) return inputRef.current?.focus()

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const { user: updated } = await changeEmail(newEmail)
      await refreshSession() // the header, menus and this page show the new email
      if (!aliveRef.current) return
      setNewEmail('')
      setTouched(false)
      setSubmitted(false)
      setSuccess(`Your email is now ${updated?.email ?? normalizeEmail(newEmail)}. Use it the next time you log in.`)
    } catch (error) {
      if (!aliveRef.current) return
      const fieldMessage = error?.kind === 'http' && (error.status === 400 || error.status === 409) ? error.fieldErrors?.newEmail : null
      if (fieldMessage) {
        setServerError(fieldMessage)
        inputRef.current?.focus()
      } else {
        const { message, recheckSession } = describeProtectedRequestError(error)
        if (recheckSession) refreshSession()
        setFormError(message)
      }
    } finally {
      submittingRef.current = false
      if (aliveRef.current) setIsSubmitting(false)
    }
  }

  return (
    <AuthPageLayout
      pageName="Settings & Privacy"
      image={settingsImage}
      heading="Email Address"
      description="Change the email used to sign in."
      backTo="/settings"
      backLabel="Back to Settings"
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        {formError && <Alert title="We couldn’t update your email">{formError}</Alert>}
        {success && (
          <Alert variant="success" title="Email updated">
            {success}
          </Alert>
        )}

        <Input label="Current email" type="email" value={currentEmail} readOnly autoComplete="off" />

        <Input
          ref={inputRef}
          label="New email address"
          type="email"
          name="newEmail"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          placeholder="Enter new email address"
          value={newEmail}
          onChange={(event) => {
            setNewEmail(event.target.value)
            setServerError(null)
          }}
          onBlur={() => setTouched(true)}
          error={fieldError || undefined}
          required
        />

        <Button type="submit" size="lg" fullWidth className="mt-3" loading={isSubmitting}>
          Update email
        </Button>
      </form>
    </AuthPageLayout>
  )
}

export default EmailSettingsPage
