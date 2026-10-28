import { useId } from 'react'
import Field from './Field'
import { fieldBorderClass, getDescriptionIds, textareaBaseClasses } from './fieldStyles'

// Multi-line text field with the same label, helper and error behaviour as
// Input (see Input.jsx). All other props (name, value, onChange, rows...)
// go to <textarea>.
function Textarea({ label, id, helperText, error, required = false, optional = false, className = '', ...rest }) {
  const generatedId = useId()
  const textareaId = id ?? generatedId

  return (
    <Field
      id={textareaId}
      label={label}
      required={required}
      optional={optional}
      helperText={helperText}
      error={error}
      className={className}
    >
      <textarea
        id={textareaId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={getDescriptionIds(textareaId, { helperText, error })}
        className={`${textareaBaseClasses} ${fieldBorderClass(error)}`}
        {...rest}
      />
    </Field>
  )
}

export default Textarea
