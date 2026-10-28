import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { ArrowRight } from 'lucide-react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import registerImage from '../assets/register-ocean.jpg'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import { registerAccount } from '../api/auth'
import { getRequestErrorMessage, SERVER_ERROR_MESSAGE } from '../api/errorMessages'
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '../utils/validation'

export const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists.'

const FIELDS = ['email', 'password', 'confirmPassword']

// /register. Creating an account does not log the user in (the backend
// doesn't start a session on registration), so on success the page shows a
// confirmation and sends the user to log in.
function RegisterPage() {
  const location = useLocation()

  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '' })
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdEmail, setCreatedEmail] = useState(null)
  const submittingRef = useRef(false) // blocks double submits immediately
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const confirmPasswordRef = useRef(null)
  const successRef = useRef(null)

  const clientErrors = {
    email: validateEmail(values.email, { required: true }),
    password: validatePassword(values.password, { required: true }),
    confirmPassword: validatePasswordConfirmation(values.password, values.confirmPassword),
  }
  // Field errors appear after leaving a field or submitting, then update live
  const fieldError = (field) => ((touched[field] || submitted) && clientErrors[field]) || serverErrors[field]

  // Move focus to the confirmation so keyboard and screen-reader users
  // aren't left on a form that just disappeared
  useEffect(() => {
    if (createdEmail) successRef.current?.focus()
  }, [createdEmail])

  function handleChange(field) {
    return (event) => {
      const { value } = event.target
      setValues((current) => ({ ...current, [field]: value }))
      setServerErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  function handleBlur(field) {
    return () => setTouched((current) => ({ ...current, [field]: true }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return

    setSubmitted(true)
    setFormError(null)
    setServerErrors({})

    const firstInvalid = FIELDS.find((field) => clientErrors[field])
    if (firstInvalid) {
      const refs = { email: emailRef, password: passwordRef, confirmPassword: confirmPasswordRef }
      return refs[firstInvalid].current?.focus()
    }

    submittingRef.current = true
    setIsSubmitting(true)
    const email = normalizeEmail(values.email)
    try {
      // The password is sent exactly as typed (never trimmed or changed)
      await registerAccount({ email, password: values.password })
      setCreatedEmail(email)
    } catch (error) {
      if (error.kind === 'http' && error.status === 409) {
        setServerErrors({ email: DUPLICATE_EMAIL_MESSAGE })
        emailRef.current?.focus()
      } else if (error.kind === 'http' && error.status === 400 && error.fieldErrors) {
        const { email: emailError, password: passwordError, body } = error.fieldErrors
        setServerErrors({ email: emailError, password: passwordError })
        if (body || (!emailError && !passwordError)) setFormError(SERVER_ERROR_MESSAGE)
      } else {
        setFormError(getRequestErrorMessage(error))
      }
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  if (createdEmail) {
    return (
      <AuthPageLayout pageName="Register" heading="Create your account" description="Join the surf community in minutes." image={registerImage}>
        <div ref={successRef} tabIndex={-1} className="outline-none">
          <Alert variant="success" title="Your account has been created">
            You can now log in with <strong>{createdEmail}</strong>.
          </Alert>
        </div>
        <Button to={`/login${location.search}`} state={{ email: createdEmail }} size="lg" fullWidth className="mt-6">
          Log in
        </Button>
      </AuthPageLayout>
    )
  }

  return (
    <AuthPageLayout pageName="Register" heading="Create your account" description="Join the surf community in minutes." image={registerImage}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6" aria-label="Create account">
        {formError && <Alert>{formError}</Alert>}

        <Input
          ref={emailRef}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          required
          value={values.email}
          onChange={handleChange('email')}
          onBlur={handleBlur('email')}
          error={fieldError('email')}
        />

        <PasswordInput
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          helperText="Use at least 8 characters. Spaces and passphrases are fine."
          required
          value={values.password}
          onChange={handleChange('password')}
          onBlur={handleBlur('password')}
          error={fieldError('password')}
        />

        <PasswordInput
          ref={confirmPasswordRef}
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat password"
          required
          value={values.confirmPassword}
          onChange={handleChange('confirmPassword')}
          onBlur={handleBlur('confirmPassword')}
          error={fieldError('confirmPassword')}
        />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting} className="mt-2">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <Button to={`/login${location.search}`} variant="text" className="mt-4 -ml-4">
        Already have an account? Log in <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </AuthPageLayout>
  )
}

export default RegisterPage
