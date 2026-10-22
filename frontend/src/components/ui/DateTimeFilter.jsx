import { useId } from 'react'
import Select from './Select'
import { useNow } from '../../hooks/useNow'
import {
  ANY_TIME,
  DAY_OPTIONS,
  DEFAULT_CUSTOM_TIME,
  TIME_SLOTS,
  formatTimeLabel,
  isCustomTimePast,
  isSlotPast,
} from '../../config/discoverTime'

// Custom day + approximate time selector: a Today/Tomorrow segmented control
// and an "Around HH:00" dropdown. TimeFilter shows it inside its dropdown
// when the user picks "Choose date & time…".
//
// - Controlled: pass `value` ({ day, time }) and `onChange(newValue)`.
// - For Today, time slots that have already passed are disabled
//   (local time, 30-minute grace). "Any time" is always available.
// - `now` can be passed to use a specific time; otherwise the real clock is used.
//
// The day buttons are real radio inputs, so keyboard users get the
// standard behaviour: Tab into the group, Arrow keys to switch day.
function DateTimeFilter({ value = DEFAULT_CUSTOM_TIME, onChange, now, label = 'Day and time', className = '' }) {
  const radioName = useId()
  const currentTime = useNow(now)

  const isToday = value.day === 'today'
  const allSlotsPast = isToday && TIME_SLOTS.every((slot) => isSlotPast(slot, currentTime))

  function handleDayChange(day) {
    const next = { day, time: value.time }
    // Switching to Today can make the chosen slot invalid: fall back to Any time.
    onChange?.(isCustomTimePast(next, currentTime) ? { day, time: ANY_TIME } : next)
  }

  const timeOptions = [
    { value: ANY_TIME, label: formatTimeLabel(ANY_TIME) },
    ...TIME_SLOTS.map((slot) => ({
      value: slot,
      label: formatTimeLabel(slot),
      disabled: isToday && isSlotPast(slot, currentTime),
    })),
  ]

  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="mb-2 text-xs font-bold text-ink">{label}</legend>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* Segmented control: each option is a visually hidden radio + its label */}
        <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
          {DAY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={[
                'inline-flex h-6 cursor-pointer items-center rounded-md px-3 text-[13px] text-ink transition-colors',
                'hover:bg-card has-checked:bg-blue has-checked:font-bold has-checked:text-white',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-blue',
              ].join(' ')}
            >
              <input
                type="radio"
                name={radioName}
                value={option.value}
                checked={value.day === option.value}
                onChange={() => handleDayChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>

        <Select
          variant="filter"
          label="Time"
          options={timeOptions}
          value={value.time}
          onChange={(event) => onChange?.({ ...value, time: event.target.value })}
        />
      </div>

      {allSlotsPast && (
        <p className="mt-2 text-[11px] text-muted">
          All of today’s time slots have passed. Choose Tomorrow to plan your next session.
        </p>
      )}
    </fieldset>
  )
}

export default DateTimeFilter
