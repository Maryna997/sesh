import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import { LogOut, X } from 'lucide-react'
import { menuNavItems } from '../../config/navigation'
import { trapTabKey } from '../../utils/trapFocus'

export const MOBILE_MENU_ID = 'mobile-menu'

// Slide-in burger menu for mobile, based on the Figma "Burger Menu" frame.
// It is only rendered while open. While open it:
// - moves keyboard focus inside the menu,
// - closes on Escape, on backdrop click and when a link is chosen,
// - keeps Tab / Shift+Tab cycling inside the menu (a "focus trap"),
// - stops the page behind it from scrolling.
function MobileMenu({ onClose }) {
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      trapTabKey(event, panelRef.current)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Dimmed backdrop: clicking it closes the menu */}
      <div className="absolute inset-0 bg-overlay" aria-hidden="true" onClick={onClose} />

      <div
        id={MOBILE_MENU_ID}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="absolute inset-y-0 right-0 flex w-[318px] max-w-[85vw] flex-col overflow-y-auto bg-menu pt-8 pr-[22px] pb-14 pl-[21px]"
      >
        <div className="flex items-center justify-between pl-2">
          <p className="text-[30px] font-bold text-teal" aria-hidden="true">
            sesh
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-menu-ink hover:bg-menu-active focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-10 pl-2 text-[11px] font-bold tracking-wide text-teal">EXPLORE SESH</p>

        <nav aria-label="Main" className="mt-5">
          <ul className="flex flex-col gap-[19px]">
            {menuNavItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    [
                      'flex h-[51px] items-center gap-4 rounded-xl pr-3 pl-[19px] text-base text-menu-ink',
                      'focus-visible:outline-2 focus-visible:outline-blue',
                      isActive ? 'bg-menu-active font-bold' : 'bg-white font-normal hover:bg-menu-active',
                    ].join(' ')
                  }
                >
                  <span aria-hidden="true" className="flex w-5 justify-center">
                    <item.icon size={18} {...item.iconProps} />
                  </span>
                  {item.label}
                </NavLink>
              </li>
            ))}

            {/* Placeholder until authentication exists */}
            <li>
              <button
                type="button"
                disabled
                className="flex h-[51px] w-full cursor-not-allowed items-center gap-4 rounded-[10px] bg-logout-bg pr-3 pl-[19px] text-left text-sm text-logout"
              >
                <span aria-hidden="true" className="flex w-5 justify-center">
                  <LogOut size={16} />
                </span>
                Log out
                <span className="ml-auto text-[11px] text-muted">Coming soon</span>
              </button>
            </li>
          </ul>
        </nav>

        <p className="mt-auto pt-10 pl-2 text-[11px] text-teal">
          More spontaneity, more shared sessions
        </p>
      </div>
    </div>
  )
}

export default MobileMenu
