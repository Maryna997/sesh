import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import Field from './Field'
import { fieldBaseClasses, fieldBorderClass, getDescriptionIds } from './fieldStyles'

// Styled native <select>. A native select keeps keyboard support,
// screen-reader support and the mobile picker for free.
//
// `options` is a list of { value, label, disabled? }.
// `placeholder` adds an empty first option ("Choose a level").
// `clearLabel` (optional fields only) hides the placeholder from the list and
// adds a first option with that label ("No board selected") that resets the
// value to empty; the closed field then shows the placeholder again.
// `optional` shows "(Optional)" after the label.
//
// Variants:
// - "field" (default): full-width form field, same look as Input.
// - "filter": compact pale chip with the label beside it, as in the
//   Figma Discover filters ("Level  All ▾"). It has no room for helper
//   text, so `helperText` and `error` only apply to the "field" variant.
function Select({
  label,
  id,
  options = [],
  placeholder,
  clearLabel,
  helperText,
  error,
  required = false,
  optional = false,
  variant = 'field',
  className = '',
  ...rest
}) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const canClear = Boolean(clearLabel) && !required

  const optionElements = (
    <>
      {placeholder && (
        <option value="" disabled={required} hidden={canClear}>
          {placeholder}
        </option>
      )}
      {canClear && <option value="">{clearLabel}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </>
  )

  if (variant === 'filter') {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <label htmlFor={selectId} className="text-[13px] font-bold text-ink">
          {label}
        </label>
        <div className="relative">
          <select
            id={selectId}
            required={required}
            aria-invalid={error ? true : undefined}
            className={[
              'h-7 appearance-none rounded-lg border bg-card pr-7 pl-3 text-[13px] text-teal outline-none',
              'focus:border-blue focus:ring-3 focus:ring-blue/20',
              'disabled:cursor-not-allowed disabled:opacity-50',
              fieldBorderClass(error),
            ].join(' ')}
            {...rest}
          >
            {optionElements}
          </select>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-teal"
          />
        </div>
      </div>
    )
  }

  return (
    <Field
      id={selectId}
      label={label}
      required={required}
      optional={optional}
      helperText={helperText}
      error={error}
      className={className}
    >
      <div className="relative">
        <select
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescriptionIds(selectId, { helperText, error })}
          className={`${fieldBaseClasses} ${fieldBorderClass(error)} appearance-none pr-10`}
          {...rest}
        >
          {optionElements}
        </select>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-teal"
        />
      </div>
    </Field>
  )
}

export default Select
