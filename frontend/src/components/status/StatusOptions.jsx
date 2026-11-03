import { Check } from 'lucide-react'
import { AVAILABILITY, AVAILABILITY_KEYS } from '../../config/availability'

// "Choose your status": the four Figma status cards as a native radio group
// (arrow keys move between them, Space selects; screen readers announce
// "radio button, 2 of 4, checked"). Selecting only changes the form; nothing
// is saved until "Save availability".
//
// The selected card is shown by more than colour: pale fill, darker border,
// bold label and a check mark. Each card's short explanation sits below it,
// as in Figma, and is read with the option (aria-describedby).
function StatusOptions({ value, onChange, error, errorId }) {
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-[15px] font-bold text-ink">Choose your status</legend>

      <div className="mt-3 flex flex-col gap-3">
        {AVAILABILITY_KEYS.map((key) => {
          const { label, description, icon: Icon } = AVAILABILITY[key]
          const id = `status-option-${key}`
          const checked = value === key
          return (
            <div key={key}>
              <label
                htmlFor={id}
                className={[
                  'flex min-h-[43px] cursor-pointer items-center gap-3 rounded-[10px] border py-2.5 pr-4 pl-[18px] text-sm text-ink transition-colors',
                  'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-blue',
                  checked ? 'border-teal bg-pale font-bold' : 'border-border bg-white hover:bg-card',
                ].join(' ')}
              >
                <input
                  type="radio"
                  id={id}
                  name="status"
                  value={key}
                  checked={checked}
                  onChange={() => onChange(key)}
                  aria-describedby={`${id}-description`}
                  className="sr-only"
                />
                <Icon size={17} aria-hidden="true" className="shrink-0 text-teal" fill={key === 'ACTIVE' ? 'currentColor' : 'none'} />
                <span className="min-w-0 flex-1">{label}</span>
                {checked && <Check size={16} aria-hidden="true" className="shrink-0 text-teal" />}
              </label>
              <p id={`${id}-description`} className="mt-1.5 pl-0.5 text-[11px] text-muted">
                {description}
              </p>
            </div>
          )
        })}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-2 text-[11px] font-bold text-danger-ink">
          {error}
        </p>
      )}
    </fieldset>
  )
}

export default StatusOptions
