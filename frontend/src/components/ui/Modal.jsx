import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { trapTabKey } from '../../utils/trapFocus'

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

// Reusable dialog built on the native <dialog> element.
// dialog.showModal() gives us a lot of accessibility for free:
// - the rest of the page becomes inert (can't be clicked or tabbed to),
// - focus moves into the dialog,
// - Escape triggers a "cancel" event, which we turn into onClose().
// We add: closing on backdrop click, Tab / Shift+Tab wrapping inside the
// dialog (the browser alone would let focus escape to its address bar),
// restoring focus to the element that opened the modal, and locking
// page scroll while it's open.
//
// Props:
// - open, onClose: controlled by the parent component
// - title (required), description: linked to the dialog with ARIA
// - children: main content
// - actions: optional footer buttons
function Modal({ open, onClose, title, description, children, actions, size = 'md' }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return

    const previouslyFocused = document.activeElement
    dialog.showModal()
    document.body.style.overflow = 'hidden'

    // Runs when `open` becomes false or the component unmounts.
    return () => {
      dialog.close()
      document.body.style.overflow = ''
      previouslyFocused?.focus?.()
    }
  }, [open])

  function handleCancel(event) {
    // Escape key: let React state decide when to close.
    event.preventDefault()
    onClose()
  }

  function handleNativeClose() {
    // Safety net: if the browser closed the dialog by itself,
    // keep React state in sync. Ignored if the dialog is (re)opened.
    if (!dialogRef.current?.open) onClose()
  }

  function handleBackdropClick(event) {
    // Clicks on the dimmed backdrop land on the <dialog> element itself;
    // clicks inside the panel land on its children.
    if (event.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      onKeyDown={(event) => trapTabKey(event, dialogRef.current)}
      className={`m-auto w-[calc(100%-32px)] rounded-[20px] bg-white p-0 text-ink shadow-xl backdrop:bg-overlay ${sizeClasses[size]}`}
    >
      {open && (
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="pt-2 text-lg font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mt-1 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-card focus-visible:outline-2 focus-visible:outline-blue"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          {description && (
            <p id={descriptionId} className="mt-2 text-[13px] text-muted">
              {description}
            </p>
          )}

          {children && <div className="mt-5">{children}</div>}

          {actions && (
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
          )}
        </div>
      )}
    </dialog>
  )
}

export default Modal
