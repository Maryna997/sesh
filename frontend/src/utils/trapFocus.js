const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

// Keeps Tab / Shift+Tab cycling inside `container` (a "focus trap").
// Call it from a keydown handler while a menu or dialog is open:
// Tab on the last element jumps to the first, Shift+Tab on the first
// jumps to the last.
export function trapTabKey(event, container) {
  if (event.key !== 'Tab' || !container) return

  const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR)
  if (focusable.length === 0) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
