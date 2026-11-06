import { useEffect, useId, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import Field from './Field'
import { fieldBaseClasses, fieldBorderClass, getDescriptionIds } from './fieldStyles'
import { SURF_SPOTS, formatSpotLocation, searchSurfSpots } from '../../data/surfSpots'

// Suggestions list height: at most 288px, less when the screen has less room
// (it then scrolls inside). It opens upward when there is too little room
// below the field and more above it (e.g. a field near the bottom of a phone
// screen, or above the on-screen keyboard).
const LIST_MAX_HEIGHT = 288
const LIST_MIN_HEIGHT = 120
const ROOM_FOR_DOWNWARD = 200
const VIEWPORT_MARGIN = 8

// The bottom edge of the visible screen (the visual viewport shrinks when a
// phone's on-screen keyboard is open; window.innerHeight does not).
function visibleBottom() {
  const viewport = window.visualViewport
  return viewport ? viewport.offsetTop + viewport.height : window.innerHeight
}

// "All spots"-style option (no spot): `id` null, never a real spot record
const NO_SPOT = { id: null, isNoSpot: true }

// Searchable surf spot picker (WAI-ARIA "combobox with listbox" pattern).
//
// - Type part of a name or place ("cap", "ericeira", "sao joao"); matching
//   ignores case and accents. Clicking the field (or ArrowDown) shows the
//   whole list for browsing.
// - ArrowDown / ArrowUp move through results, Enter selects, Escape closes
//   the list. Escape never clears the selection; the clear (✕) button does.
// - The list scrolls natively (mouse wheel, trackpad, touch); the component
//   only scrolls it itself to show an option reached with the keyboard.
// - Focus always stays in the text field; the highlighted result is announced
//   through aria-activedescendant.
//
// The value is the spot's stable `id` (or null), never the free text,
// so the selection can be saved and matched reliably later.
// onChange(id, spot) is called with the new id and the full spot object.
//
// Options used by the Discover filter (all off by default):
// - `noSpotLabel` ("All spots"): adds a first option meaning "no spot"
//   (onChange(null, null)); shown while browsing, not while searching.
// - `keepSelectionWhileTyping`: typing only searches; the selection changes
//   when a result is picked or the field is cleared. Leaving the field
//   without picking keeps the previous spot. (By default, typing clears the
//   value, so a form never keeps a spot the text no longer shows.)
// - `getSpotLabel(spot)`: the text shown for the selected spot (default:
//   its name), e.g. to add the area to duplicate names.
function SurfSpotCombobox({
  label = 'Surf spot',
  value = null,
  onChange,
  spots = SURF_SPOTS,
  placeholder = 'Choose a spot',
  noSpotLabel,
  keepSelectionWhileTyping = false,
  getSpotLabel = (spot) => spot.name,
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
  const fieldRef = useRef(null)

  const selectedSpot = spots.find((spot) => spot.id === value) ?? null

  // `query` is null while the user isn't typing; the field then shows the
  // selected spot's name. This keeps the text and the real value in sync.
  const [query, setQuery] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [placement, setPlacement] = useState({ upward: false, maxHeight: LIST_MAX_HEIGHT })

  const inputValue = query ?? (selectedSpot ? getSpotLabel(selectedSpot) : '')
  const results = searchSurfSpots(query ?? '', spots)
  const options = noSpotLabel && !query ? [NO_SPOT, ...results] : results
  const highlighted = isOpen && activeIndex >= 0 && activeIndex < options.length ? activeIndex : -1
  const isSelected = (option) => (option.isNoSpot ? value === null : option.id === value)

  // Keep the highlighted option visible, but only when it was moved with the
  // keyboard or the list was just opened. Never after other re-renders (hover,
  // resizing): that would pull the list back while someone scrolls it with
  // the mouse wheel, trackpad or a finger.
  const revealHighlightRef = useRef(false)
  useEffect(() => {
    if (highlighted >= 0 && revealHighlightRef.current) {
      document.getElementById(`${inputId}-option-${highlighted}`)?.scrollIntoView({ block: 'nearest' })
    }
    revealHighlightRef.current = false
  }, [inputId, highlighted, isOpen, query])

  function moveHighlight(index) {
    revealHighlightRef.current = true
    setActiveIndex(index)
  }

  // Fits the list into the visible screen (see LIST_MAX_HEIGHT above).
  // Re-renders only when the placement really changes.
  function measurePlacement() {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    const below = visibleBottom() - rect.bottom - VIEWPORT_MARGIN
    const above = rect.top - VIEWPORT_MARGIN
    const upward = below < ROOM_FOR_DOWNWARD && above > below
    const room = upward ? above : below
    const maxHeight = Math.round(Math.max(LIST_MIN_HEIGHT, Math.min(LIST_MAX_HEIGHT, room)))
    setPlacement((current) =>
      current.upward === upward && current.maxHeight === maxHeight ? current : { upward, maxHeight },
    )
  }

  // While the list is open, follow page scrolling, resizing and the
  // on-screen keyboard. The scroll listener is not a capture listener, so
  // scrolling inside the list itself is left entirely to the browser.
  useEffect(() => {
    if (!isOpen) return undefined
    window.addEventListener('resize', measurePlacement)
    window.addEventListener('scroll', measurePlacement)
    window.visualViewport?.addEventListener('resize', measurePlacement)
    return () => {
      window.removeEventListener('resize', measurePlacement)
      window.removeEventListener('scroll', measurePlacement)
      window.visualViewport?.removeEventListener('resize', measurePlacement)
    }
  }, [isOpen])

  function openList() {
    const selectedIndex = options.findIndex(isSelected)
    moveHighlight(selectedIndex >= 0 ? selectedIndex : 0) // shows the selected spot
    measurePlacement()
    setIsOpen(true)
  }

  function selectOption(option) {
    if (option.isNoSpot) onChange?.(null, null)
    else onChange?.(option.id, option)
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
    moveHighlight(0) // new results: back to the first one
    if (!isOpen) measurePlacement()
    setIsOpen(true)
    // Typed text is not a selection: clear the old value until a result is
    // picked (unless the selection is kept while typing).
    if (value !== null && !keepSelectionWhileTyping) onChange?.(null, null)
  }

  function handleKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen) openList()
        else moveHighlight(Math.min(highlighted + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!isOpen) openList()
        else moveHighlight(Math.max(highlighted - 1, 0))
        break
      case 'Enter':
        if (highlighted >= 0) {
          event.preventDefault()
          selectOption(options[highlighted])
        }
        break
      case 'Escape':
        // Closes the list; never clears the selection (that takes the clear
        // button, or "All spots" in Discover).
        if (isOpen) {
          event.preventDefault()
          setIsOpen(false)
          if (keepSelectionWhileTyping) setQuery(null)
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

  const showResults = isOpen && options.length > 0
  const showNoResults = isOpen && options.length === 0
  const resultMessage = isOpen
    ? results.length === 0
      ? 'No surf spots found.'
      : `${results.length} ${results.length === 1 ? 'spot' : 'spots'} available.`
    : ''
  const popupPosition = placement.upward ? 'bottom-full mb-1' : 'top-full mt-1'

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
      <div ref={fieldRef} className="relative">
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
            style={{ maxHeight: placement.maxHeight }}
            className={`absolute z-20 w-full overflow-y-auto overscroll-contain rounded-[10px] border border-border bg-white py-1 shadow-lg ${popupPosition}`}
          >
            {options.map((option, index) => {
              const selected = isSelected(option)
              return (
                <li
                  key={option.id ?? 'no-spot'}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectOption(option)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 ${index === highlighted ? 'bg-card' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] text-ink ${selected ? 'font-bold' : ''}`}>
                      {option.isNoSpot ? noSpotLabel : option.name}
                    </span>
                    {!option.isNoSpot && (
                      <span className="block text-[11px] text-muted">{formatSpotLocation(option)}</span>
                    )}
                  </span>
                  {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-teal" />}
                </li>
              )
            })}
          </ul>
        )}

        {showNoResults && (
          <div
            className={`absolute z-20 w-full rounded-[10px] border border-border bg-white px-4 py-3 shadow-lg ${popupPosition}`}
          >
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
