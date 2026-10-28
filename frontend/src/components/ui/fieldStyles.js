// Shared styles and helpers for form controls (Input and Select),
// so every field in Sesh looks and behaves the same way.

// Look shared by every text control: 10px radius, 1px light border, 13px text.
const fieldSurfaceClasses = [
  'w-full rounded-[10px] border bg-white px-4 text-[13px] text-ink',
  'placeholder:text-muted outline-none transition-colors',
  'focus:border-blue focus:ring-3 focus:ring-blue/20',
  'disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted',
].join(' ')

// Single-line field, from the Figma Login and Status frames: 46px tall.
export const fieldBaseClasses = `h-[46px] ${fieldSurfaceClasses}`

// Multi-line field (Textarea): grows vertically, same surface as the inputs.
export const textareaBaseClasses = `min-h-28 resize-y py-3 ${fieldSurfaceClasses}`

export function fieldBorderClass(hasError) {
  return hasError ? 'border-danger' : 'border-border'
}

// Builds the ids that connect a control to its helper and error text,
// so screen readers read them together (aria-describedby).
export function getDescriptionIds(id, { helperText, error }) {
  const ids = []
  if (helperText) ids.push(`${id}-helper`)
  if (error) ids.push(`${id}-error`)
  return ids.length ? ids.join(' ') : undefined
}
