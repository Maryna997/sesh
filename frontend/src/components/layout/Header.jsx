import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import Logo from './Logo'
import TopNav from './TopNav'
import VisitorActions from './VisitorActions'
import MobileMenu, { MOBILE_MENU_ID } from './MobileMenu'
import { useAuth } from '../../auth/useAuth'
import { AUTH_STATUS } from '../../auth/authContext'

// Matches Tailwind's `md` breakpoint, where the top nav replaces the burger.
const TABLET_QUERY = '(min-width: 48rem)'

// App header. Its right-hand side follows the auth state:
// - Signed in: Discover / Status / Messages / My profile (account menu with
//   Settings & Privacy and Log out) on tablet and desktop; burger menu on mobile.
// - Visitor: "Log in" and "Create account". The logo links to the home page.
// - While the session is being checked: nothing, so the wrong actions never flash.
//
// `isAuthenticated` can force a variant (used by the dev-only header preview);
// normally it is left out and the real auth state is used.
function Header({ isAuthenticated: forcedAuthenticated }) {
  const { status } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const burgerButtonRef = useRef(null)

  let variant
  if (forcedAuthenticated !== undefined) variant = forcedAuthenticated ? 'member' : 'visitor'
  else if (status === AUTH_STATUS.AUTHENTICATED) variant = 'member'
  else if (status === AUTH_STATUS.CHECKING) variant = 'checking'
  else variant = 'visitor'

  // Closing returns keyboard focus to the burger button that opened the menu.
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false)
    burgerButtonRef.current?.focus()
  }, [])

  // If the screen grows to tablet size while the menu is open, close it,
  // because the burger button is no longer visible there.
  useEffect(() => {
    const mediaQuery = window.matchMedia(TABLET_QUERY)

    function handleChange(event) {
      if (event.matches) setIsMenuOpen(false)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return (
    <header className="bg-white">
      <div
        className={[
          'flex h-[70px] items-center justify-between px-[22px] md:h-[72px] md:pr-5 md:pl-7 lg:h-20 lg:pl-12',
          // Right margin: 28px for the visitor actions (Figma), 48px for the
          // signed-in nav so it mirrors the logo's 48px left margin.
          variant === 'member' ? 'lg:pr-12' : 'lg:pr-7',
        ].join(' ')}
      >
        <Logo />

        {variant === 'member' && (
          <>
            <TopNav />
            <button
              ref={burgerButtonRef}
              type="button"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={isMenuOpen}
              aria-controls={MOBILE_MENU_ID}
              className="-mr-3 flex size-11 items-center justify-center rounded-lg text-ink hover:bg-pale focus-visible:outline-2 focus-visible:outline-blue md:hidden"
            >
              <Menu size={24} aria-hidden="true" />
            </button>
          </>
        )}

        {variant === 'visitor' && <VisitorActions />}
      </div>

      {variant === 'member' && isMenuOpen && <MobileMenu onClose={closeMenu} />}
    </header>
  )
}

export default Header
