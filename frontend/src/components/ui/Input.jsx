import { useId } from 'react'
import Field from './Field'
import { fieldBaseClasses, fieldBorderClass, getDescriptionIds } from './fieldStyles'

// Text input with a visible label, optional helper text and error message.
// - The label is linked to the input (htmlFor/id), so clicking it focuses the field.
// - Helper and error text are announced by screen readers via aria-describedby.
// - `icon` takes a lucide-react icon shown at the start of the field
//   (e.g. the search icon in the Figma "Surf spot" field).
// - `trailing` is an optional small element (usually an icon button) shown
//   at the end of the field, e.g. PasswordInput's show/hide toggle.
// All other props (type, name, value, onChange, placeholder...) go to <input>.
function Input({
  label,
  id,
  helperText,
  error,
  required = false,
  icon: Icon,
  trailing,
  className = '',
  ...rest
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <Field
      id={inputId}
      label={label}
      required={required}
      helperText={helperText}
      error={error}
      className={className}
    >
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-teal"
          />
        )}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescriptionIds(inputId, { helperText, error })}
          className={`${fieldBaseClasses} ${fieldBorderClass(error)} ${Icon ? 'pl-11' : ''} ${trailing ? 'pr-12' : ''}`}
          {...rest}
        />
        {trailing && <div className="absolute top-1/2 right-1.5 -translate-y-1/2">{trailing}</div>}
      </div>
    </Field>
  )
}

export default Input
