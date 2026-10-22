import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Input from './Input'

// Password field = the regular Input plus a show/hide toggle.
// All Input props (label, error, helperText, required, value, onChange,
// autoComplete...) are passed through unchanged.
//
// The toggle is a toggle button: its name stays "Show password" and
// aria-pressed tells screen readers whether the password is visible.
function PasswordInput({ disabled, ...rest }) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <Input
      {...rest}
      disabled={disabled}
      type={isVisible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          // Keep focus (and the cursor) in the field when toggling with the mouse,
          // so it doesn't count as leaving the field and trigger validation early.
          onMouseDown={(event) => event.preventDefault()}
          disabled={disabled}
          aria-label="Show password"
          aria-pressed={isVisible}
          className="flex size-9 items-center justify-center rounded-lg text-teal hover:bg-card focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      }
    />
  )
}

export default PasswordInput
