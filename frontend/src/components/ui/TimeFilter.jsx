import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import DateTimeFilter from './DateTimeFilter'
import { useNow } from '../../hooks/useNow'
import {
  ANY_TIME,
  DEFAULT_CUSTOM_TIME,
  DEFAULT_TIME_FILTER,
  QUICK_TIME_OPTIONS,
  TIME_FILTER_TYPES,
  formatTimeFilter,
  isCustomTimePast,
} from '../../config/discoverTime'

// Compact Discover "Time" filter, styled after the Figma time dropdown:
//   Time [Any time ▾]
//        ├ Any time ✓ / Now / Next 2 hours / Today / Choose date & time…
//        └ (when "Choose date & time…" is picked) Today|Tomorrow + Around HH:00
//
// Accessibility: the trigger is a disclosure button (aria-expanded) and the
// options are native radio buttons, so Arrow keys move between options and
// screen readers announce "radio button, 2 of 5". Escape or Enter closes the
// panel and returns focus to the trigger; so does clicking outside or tabbing away.
//
// Controlled: `value` (see config/discoverTime.js for its shape) + `onChange`.
// `now` can be passed to simulate the current time (used by /ui-preview).
function TimeFilter({ value = DEFAULT_TIME_FILTER, onChange, now, label = 'Time', className = '' }) {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const valueId = `${baseId}-value`
  const panelId = `${baseId}-panel`

  const currentTime = useNow(now)
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  // True while an option is being chosen with the mouse/touch (not the keyboard).
  const pointerSelectingRef = useRef(false)

  const isCustom = value.type === TIME_FILTER_TYPES.CUSTOM

  // A custom slot can pass while the page is open (even with the panel closed):
  // fall back to "Any time" for that day.
  useEffect(() => {
    if (isCustom && isCustomTimePast(value, currentTime)) {
      onChange?.({ ...value, time: ANY_TIME })
    }
  }, [isCustom, value, currentTime, onChange])

  // When the panel opens, move focus to the selected option.
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector('input:checked')?.focus()
  }, [isOpen])

  // Close when clicking or tapping anywhere outside the filter.
  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function closePanel({ returnFocus }) {
    setIsOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function selectOption(type) {
    onChange?.(type === TIME_FILTER_TYPES.CUSTOM ? { type, ...DEFAULT_CUSTOM_TIME } : { type })
  }

  function handleOptionClick(type) {
    // Mouse users expect a quick option to close the dropdown, like a select.
    // Keyboard users move with Arrow keys and close with Enter or Escape.
    if (pointerSelectingRef.current && type !== TIME_FILTER_TYPES.CUSTOM) {
      closePanel({ returnFocus: true })
    }
    pointerSelectingRef.current = false
  }

  function handleKeyDown(event) {
    pointerSelectingRef.current = false

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      closePanel({ returnFocus: true })
    } else if (event.key === 'Enter' && event.target.type === 'radio') {
      event.preventDefault()
      closePanel({ returnFocus: true })
    } else if (event.key === 'ArrowDown' && event.target === triggerRef.current && !isOpen) {
      event.preventDefault()
      setIsOpen(true)
    }
  }

  function handleBlur(event) {
    // Tabbing out of the filter closes the panel. (Mouse clicks outside are
    // handled by the pointerdown listener above.)
    if (event.relatedTarget && !wrapperRef.current?.contains(event.relatedTarget)) {
      setIsOpen(false)
    }
  }

  return (
    <div
      ref={wrapperRef}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className={`inline-flex items-center gap-3 ${className}`}
    >
      <span id={labelId} className="text-[13px] font-bold text-ink">
        {label}
      </span>

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-labelledby={`${labelId} ${valueId}`}
          onClick={() => (isOpen ? closePanel({ returnFocus: false }) : setIsOpen(true))}
          className="inline-flex h-[29px] min-w-[119px] items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 text-xs text-link outline-none focus-visible:border-blue focus-visible:ring-3 focus-visible:ring-blue/20"
        >
          <span id={valueId}>{formatTimeFilter(value)}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            id={panelId}
            ref={panelRef}
            role="group"
            aria-labelledby={labelId}
            onPointerDown={() => (pointerSelectingRef.current = true)}
            className="absolute top-full left-0 z-30 mt-2 w-[260px] max-w-[calc(100vw-32px)] rounded-[10px] border border-border bg-white py-2 shadow-lg"
          >
            {QUICK_TIME_OPTIONS.map((option) => {
              const isChecked = value.type === option.type
              return (
                <label
                  key={option.type}
                  className={[
                    'flex cursor-pointer items-center justify-between gap-2 px-4 py-[9px] text-[13px] text-ink',
                    'hover:bg-card has-checked:font-bold',
                    'has-focus-visible:bg-card has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-blue',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name={`${baseId}-option`}
                    value={option.type}
                    checked={isChecked}
                    onChange={() => selectOption(option.type)}
                    onClick={() => handleOptionClick(option.type)}
                    className="sr-only"
                  />
                  <span>{option.label}</span>
                  {isChecked && <Check size={14} aria-hidden="true" className="shrink-0 text-teal" />}
                </label>
              )
            })}

            {isCustom && (
              <div className="mx-3 mt-1 mb-1 rounded-[10px] border border-border p-3">
                <DateTimeFilter
                  value={{ day: value.day, time: value.time }}
                  onChange={(dayTime) => onChange?.({ type: TIME_FILTER_TYPES.CUSTOM, ...dayTime })}
                  now={currentTime}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TimeFilter
