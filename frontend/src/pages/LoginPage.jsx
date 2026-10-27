import { useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { ArrowRight } from 'lucide-react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import { useAuth } from '../auth/useAuth'
import { getRequestErrorMessage, SERVER_ERROR_MESSAGE } from '../api/errorMessages'
import { normalizeEmail, validateEmail, validateLoginPassword } from '../utils/validation'

// Same wording as the backend, for both "no such email" and "wrong password",
// so the page never reveals which emails have accounts.
export const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password.'

// /login. After a successful login, PublicOnlyRoute sends the user on to the
// page they originally asked for (a safe ?returnTo= path) or /discover.
function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()

  // The register page passes the new account's email along (never in the URL)
  const [email, setEmail] = useState(location.state?.email ?? '')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false) // blocks double submits immediately
  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  const clientErrors = {
    email: validateEmail(email, { required: true }),
    password: validateLoginPassword(password),
  }
  // Field errors appear after leaving a field or submitting, then update live
  const fieldError = (field) => ((touched[field] || submitted) && clientErrors[field]) || serverErrors[field]

  function updateField(field, setter) {
    return (event) => {
      setter(event.target.value)
      setServerErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return

    setSubmitted(true)
    setFormError(null)
    setServerErrors({})

    if (clientErrors.email) return emailRef.current?.focus()
    if (clientErrors.password) return passwordRef.current?.focus()

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      // The password is sent exactly as typed (never trimmed or changed)
      await login({ email: normalizeEmail(email), password })
      // Success: the auth state changes and PublicOnlyRoute redirects
    } catch (error) {
      if (error.kind === 'http' && error.status === 401) {
        setFormError(INVALID_CREDENTIALS_MESSAGE)
      } else if (error.kind === 'http' && error.status === 400 && error.fieldErrors) {
        const { email: emailError, password: passwordError, body } = error.fieldErrors
        setServerErrors({ email: emailError, password: passwordError })
        if (body || (!emailError && !passwordError)) setFormError(SERVER_ERROR_MESSAGE)
      } else {
        setFormError(getRequestErrorMessage(error))
      }
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageLayout
      pageName="Login"
      heading="Welcome back"
      description="Log in to find your next surf buddy."
      centerOnTablet
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6" aria-label="Log in">
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
          value={email}
          onChange={updateField('email', setEmail)}
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          error={fieldError('email')}
        />

        <PasswordInput
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          value={password}
          onChange={updateField('password', setPassword)}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          error={fieldError('password')}
        />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting} className="mt-2">
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <Button to={`/register${location.search}`} variant="text" className="mt-4 -ml-4">
        New to Sesh? Create an account <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </AuthPageLayout>
  )
}

export default LoginPage
