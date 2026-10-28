import { useEffect, useId, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import Field from './Field'
import { fieldBaseClasses, fieldBorderClass, getDescriptionIds } from './fieldStyles'
import { SURF_SPOTS, formatSpotLocation, searchSurfSpots } from '../../data/surfSpots'

// Searchable surf spot picker (WAI-ARIA "combobox with listbox" pattern).
//
// - Type part of a name or place ("cap", "ericeira", "sao joao").
// - ArrowDown / ArrowUp move through results, Enter selects,
//   Escape closes the list (or clears the field if the list is already closed).
// - Focus always stays in the text field; the highlighted result is announced
//   through aria-activedescendant.
//
// The value is the spot's stable `id` (or null), never the free text,
// so the selection can be saved and matched reliably later.
// onChange(id, spot) is called with the new id and the full spot object.
function SurfSpotCombobox({
  label = 'Surf spot',
  value = null,
  onChange,
  spots = SURF_SPOTS,
  placeholder = 'Choose a spot',
  helperText,
  error,
  required = false,
  optional = false,
  disabled = false,
  id,
  className = '',
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-listbox`
  const optionId = (index) => `${inputId}-option-${index}`

  const selectedSpot = spots.find((spot) => spot.id === value) ?? null

  // `query` is null while the user isn't typing; the field then shows the
  // selected spot's name. This keeps the text and the real value in sync.
  const [query, setQuery] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputValue = query ?? selectedSpot?.name ?? ''
  const results = searchSurfSpots(query ?? '', spots)
  const highlighted = isOpen && activeIndex >= 0 && activeIndex < results.length ? activeIndex : -1

  // Keep the highlighted option visible when moving with the arrow keys.
  useEffect(() => {
    if (highlighted >= 0) {
      document.getElementById(optionId(highlighted))?.scrollIntoView({ block: 'nearest' })
    }
  })

  function openList() {
    const selectedIndex = results.findIndex((spot) => spot.id === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setIsOpen(true)
  }

  function selectSpot(spot) {
    onChange?.(spot.id, spot)
    setQuery(null)
    setIsOpen(false)
  }

  function clearSelection() {
    onChange?.(null, null)
    setQuery(null)
    setIsOpen(false)
  }

  function handleInputChange(event) {
    setQuery(event.target.value)
    setActiveIndex(0)
    setIsOpen(true)
    // Typed text is not a selection: clear the old value until a result is picked.
    if (value !== null) onChange?.(null, null)
  }

  function handleKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen) openList()
        else setActiveIndex((index) => Math.min(index + 1, results.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!isOpen) openList()
        else setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Enter':
        if (highlighted >= 0) {
          event.preventDefault()
          selectSpot(results[highlighted])
        }
        break
      case 'Escape':
        if (isOpen) {
          event.preventDefault()
          setIsOpen(false)
        } else if (inputValue) {
          event.preventDefault()
          clearSelection()
        }
        break
      default:
        break
    }
  }

  function handleBlur() {
    // Leaving the field: close the list and drop unfinished text,
    // so the field only ever shows a real selected spot.
    setIsOpen(false)
    setQuery(null)
  }

  const showResults = isOpen && results.length > 0
  const showNoResults = isOpen && results.length === 0
  const resultMessage = isOpen
    ? results.length === 0
      ? 'No surf spots found.'
      : `${results.length} ${results.length === 1 ? 'spot' : 'spots'} available.`
    : ''

  return (
    <Field
      id={inputId}
      label={label}
      required={required}
      optional={optional}
      helperText={helperText}
      error={error}
      className={className}
    >
      <div className="relative">
        <Search
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-teal"
        />

        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults ? listboxId : undefined}
          aria-activedescendant={highlighted >= 0 ? optionId(highlighted) : undefined}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescriptionIds(inputId, { helperText, error })}
          placeholder={placeholder}
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={() => !isOpen && openList()}
          onBlur={handleBlur}
          className={`${fieldBaseClasses} ${fieldBorderClass(error)} pr-11 pl-11`}
        />

        {inputValue && !disabled && (
          <button
            type="button"
            onClick={clearSelection}
            // Keep focus in the input so typing can continue after clearing.
            onMouseDown={(event) => event.preventDefault()}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink hover:bg-card focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}

        {showResults && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${label} results`}
            // Prevent the input from losing focus when a result is clicked.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[10px] border border-border bg-white py-1 shadow-lg"
          >
            {results.map((spot, index) => {
              const isSelected = spot.id === value
              return (
                <li
                  key={spot.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectSpot(spot)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${index === highlighted ? 'bg-card' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] text-ink ${isSelected ? 'font-bold' : ''}`}>
                      {spot.name}
                    </span>
                    <span className="block text-[11px] text-muted">{formatSpotLocation(spot)}</span>
                  </span>
                  {isSelected && <Check size={16} aria-hidden="true" className="shrink-0 text-teal" />}
                </li>
              )
            })}
          </ul>
        )}

        {showNoResults && (
          <div className="absolute top-full z-20 mt-1 w-full rounded-[10px] border border-border bg-white px-4 py-3 shadow-lg">
            <p className="text-[13px] text-ink">No surf spots match “{query}”.</p>
            <p className="mt-1 text-[11px] text-muted">Try a town or area, like Ericeira or Peniche.</p>
          </div>
        )}

        {/* Announces the number of results to screen-reader users. */}
        <p role="status" className="sr-only">
          {resultMessage}
        </p>
      </div>
    </Field>
  )
}

export default SurfSpotCombobox
