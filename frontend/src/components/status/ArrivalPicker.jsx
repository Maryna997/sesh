import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { fieldBaseClasses, fieldBorderClass } from '../ui/fieldStyles'

// "Approximate arrival time" for Coming Soon.
//
// A native <select> opens a popup drawn by the browser/OS: CSS can't limit
// its height or position, and on some phones and in mobile emulation the
// long list (3 relative options + 8 windows) ran past the screen. So this
// field opens its choices INLINE, in the page flow (it can never be clipped
// by the viewport), with a maximum height and its own vertical scrolling.
//
// - The field is a button showing the placeholder or the chosen option; it
//   announces both its label and the current choice.
// - The choices are two native radio groups ("In about…", "Time window
//   today"), so arrow keys and screen readers work as usual. Choices that are
//   no longer possible stay visible, disabled and labelled with the reason.
// - Tapping or clicking a choice selects it, closes the list and returns
//   focus to the field. With the keyboard, arrow keys move the selection
//   (as in any radio group) and Enter or Escape closes the list.
//
// `groups` comes from arrivalOptions(now): [{ label, options: [{ value, label, disabled }] }]
function ArrivalPicker({ id, label, placeholder, groups, value, onChange, required = false, helperText, error }) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  // True while a choice is being made with a pointer (mouse or touch), so it
  // closes the list; keyboard selection keeps the list open
  const pointerChoice = useRef(false)
  const panelId = `${id}-choices`
  const labelId = `${id}-label`
  const valueId = `${id}-value`

  const selected = groups.flatMap((group) => group.options).find((option) => option.value === value)
  const describedBy = [helperText && `${id}-helper`, error && `${id}-error`].filter(Boolean).join(' ') || undefined

  // When the list opens, focus the chosen option (or the first possible one)
  useEffect(() => {
    if (!isOpen) return
    const radios = [...panelRef.current.querySelectorAll('input[type="radio"]')]
    const target = radios.find((radio) => radio.checked) ?? radios.find((radio) => !radio.disabled)
    target?.focus()
  }, [isOpen])

  function close() {
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  function choose(optionValue) {
    onChange(optionValue)
    if (pointerChoice.current) close()
    pointerChoice.current = false
  }

  return (
    <div className="flex flex-col gap-2">
      <label id={labelId} htmlFor={id} className="text-xs font-bold text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className={`${fieldBaseClasses} ${fieldBorderClass(error)} flex items-center justify-between gap-2 text-left`}
      >
        <span id={valueId} className={`min-w-0 truncate ${selected ? 'text-ink' : 'text-muted'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-teal transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Enter') {
              event.preventDefault()
              close()
            }
          }}
          className="max-h-72 overflow-y-auto rounded-[10px] border border-border bg-white py-1"
        >
          {groups.map((group) => (
            <fieldset key={group.label} className="py-1">
              <legend className="px-4 pt-2 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{group.label}</legend>
              {group.options.map((option) => {
                const checked = option.value === value
                return (
                  <label
                    key={option.value}
                    onPointerDown={() => {
                      if (!option.disabled) pointerChoice.current = true
                    }}
                    className={[
                      'flex min-h-11 items-center gap-3 px-4 text-[13px]',
                      'has-[input:focus-visible]:bg-card has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-blue',
                      option.disabled ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-ink hover:bg-card',
                      checked ? 'font-bold' : '',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name={`${id}-option`}
                      value={option.value}
                      checked={checked}
                      disabled={option.disabled}
                      onChange={() => choose(option.value)}
                      // Clicking the option that is already chosen just closes the list
                      onClick={() => {
                        if (checked && pointerChoice.current) {
                          pointerChoice.current = false
                          close()
                        }
                      }}
                      className="sr-only"
                    />
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {checked && <Check size={16} aria-hidden="true" className="shrink-0 text-teal" />}
                  </label>
                )
              })}
            </fieldset>
          ))}
        </div>
      )}

      {helperText && (
        <p id={`${id}-helper`} className="text-[11px] text-muted">
          {helperText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[11px] font-bold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

export default ArrivalPicker
