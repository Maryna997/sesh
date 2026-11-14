import { useEffect, useRef, useState } from 'react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import settingsImage from '../assets/profile-ocean.jpg'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import PasswordInput from '../components/ui/PasswordInput'
import { changePassword } from '../api/account'
import { describeProtectedRequestError } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { validatePassword } from '../utils/validation'

export const SAME_PASSWORD_MESSAGE = 'Choose a password different from your current one.'

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

function validate(values) {
  const errors = {}
  if (values.currentPassword === '') errors.currentPassword = 'Enter your current password.'
  errors.newPassword = validatePassword(values.newPassword, { required: true })
  if (!errors.newPassword && values.newPassword === values.currentPassword) errors.newPassword = SAME_PASSWORD_MESSAGE
  if (values.confirmPassword === '') errors.confirmPassword = 'Please confirm your new password.'
  else if (values.confirmPassword !== values.newPassword) errors.confirmPassword = 'Passwords don’t match.'
  return errors
}

// /settings/password: change the password. The current password is checked
// by the server; the new one follows the registration rules and must be
// typed twice. On success the user STAYS signed in: the server gives this
// browser a fresh session cookie in the same response and signs out other
// devices. The fields are cleared and the user stays on this page.
function PasswordSettingsPage() {
  const { refreshSession } = useAuth()
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const fieldRefs = { currentPassword: useRef(null), newPassword: useRef(null), confirmPassword: useRef(null) }
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const clientErrors = validate(values)
  const fieldError = (field) => ((touched[field] || submitted) && clientErrors[field]) || serverErrors[field]

  function field(name) {
    return {
      ref: fieldRefs[name],
      name,
      value: values[name],
      onChange: (event) => {
        const { value } = event.target
        setValues((current) => ({ ...current, [name]: value }))
        setServerErrors((current) => ({ ...current, [name]: undefined }))
      },
      onBlur: () => setTouched((current) => ({ ...current, [name]: true })),
      error: fieldError(name) || undefined,
      required: true,
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    setSubmitted(true)
    setFormError(null)
    setSuccess(false)
    setServerErrors({})
    const firstInvalid = ['currentPassword', 'newPassword', 'confirmPassword'].find((name) => clientErrors[name])
    if (firstInvalid) return fieldRefs[firstInvalid].current?.focus()

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      if (!aliveRef.current) return
      setValues(EMPTY)
      setTouched({})
      setSubmitted(false)
      setSuccess(true)
    } catch (error) {
      if (!aliveRef.current) return
      const fields = error?.kind === 'http' && error.status === 400 ? (error.fieldErrors ?? {}) : {}
      const known = { currentPassword: fields.currentPassword, newPassword: fields.newPassword }
      if (known.currentPassword || known.newPassword) {
        setServerErrors(known)
        fieldRefs[known.currentPassword ? 'currentPassword' : 'newPassword'].current?.focus()
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
      heading="Password"
      description="Update your password securely."
      backTo="/settings"
      backLabel="Back to Settings"
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        {formError && <Alert title="We couldn’t update your password">{formError}</Alert>}
        {success && (
          <Alert variant="success" title="Password updated">
            Use your new password the next time you log in. You’re still signed in here; other devices were signed out.
          </Alert>
        )}

        <PasswordInput label="Current password" placeholder="Enter current password" autoComplete="current-password" {...field('currentPassword')} />
        <PasswordInput
          label="New password"
          placeholder="Enter new password"
          autoComplete="new-password"
          helperText="At least 8 characters."
          {...field('newPassword')}
        />
        <PasswordInput label="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" {...field('confirmPassword')} />

        <Button type="submit" size="lg" fullWidth className="mt-3" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthPageLayout>
  )
}

export default PasswordSettingsPage
