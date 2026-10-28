// Label + control + helper/error text, stacked vertically.
// Used by Input and Select so all form fields share one layout.
// `optional` adds a muted "(Optional)" after the label; `required` adds a red *.
function Field({ id, label, required, optional = false, helperText, error, className = '', children }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-bold text-ink">
          {label}
          {/* A real space (not only a margin), so the name reads "Board (Optional)" */}
          {optional && (
            <>
              {' '}
              <span className="font-normal text-muted">(Optional)</span>
            </>
          )}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {children}

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

export default Field
