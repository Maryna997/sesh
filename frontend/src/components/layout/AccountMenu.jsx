import { useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { accountMenuItems } from '../../config/navigation'
import { useLogout } from '../../auth/useLogout'

// "My profile" item of the tablet/desktop top nav. As in the Figma
// "Account menu open" frames, it opens a small menu with My Profile,
// Settings & Privacy and Log out.
//
// It's a disclosure (a button that shows/hides a list of links), which
// works well with keyboards and screen readers. Escape, clicking outside,
// tabbing away or choosing a link closes it.
function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()
  const wrapperRef = useRef(null)
  const triggerRef = useRef(null)
  const location = useLocation()
  const { logoutAndLeave, isLoggingOut, error } = useLogout()

  const isCurrentSection = accountMenuItems.some((item) => location.pathname.startsWith(item.to))

  // Close when clicking or tapping outside the menu
  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function close({ returnFocus = false } = {}) {
    setIsOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      close({ returnFocus: true })
    }
  }

  function handleBlur(event) {
    // Tabbing out of the menu closes it
    if (event.relatedTarget && !wrapperRef.current?.contains(event.relatedTarget)) setIsOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        className={[
          'block w-full rounded-md px-1 py-2 text-ink underline-offset-8 transition-colors',
          'hover:text-link focus-visible:outline-2 focus-visible:outline-blue',
          isCurrentSection ? 'font-bold underline decoration-blue decoration-2' : 'font-normal',
        ].join(' ')}
      >
        {/* Hidden bold copy reserves the bold width (same trick as TopNav) */}
        <span className="inline-grid">
          <span className="col-start-1 row-start-1">My profile</span>
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 h-0 font-bold">
            My profile
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          id={menuId}
          className="absolute top-full right-0 z-30 mt-2 w-[180px] rounded-[10px] border border-border bg-white py-2 text-left text-[13px] shadow-lg"
        >
          <ul>
            {accountMenuItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => close()}
                  className={({ isActive }) =>
                    [
                      'block px-4 py-2 text-ink hover:bg-card',
                      'focus-visible:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue',
                      isActive ? 'font-bold' : '',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={logoutAndLeave}
                disabled={isLoggingOut}
                aria-busy={isLoggingOut || undefined}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-logout hover:bg-card focus-visible:bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue disabled:cursor-wait"
              >
                {isLoggingOut && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
                {isLoggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </li>
          </ul>
          {error && (
            <p role="alert" className="mx-3 mt-1 rounded-md bg-danger-soft px-2 py-1.5 text-[11px] text-danger-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default AccountMenu
