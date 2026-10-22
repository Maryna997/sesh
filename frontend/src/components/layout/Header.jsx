import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import Logo from './Logo'
import TopNav from './TopNav'
import VisitorActions from './VisitorActions'
import MobileMenu, { MOBILE_MENU_ID } from './MobileMenu'

// Matches Tailwind's `md` breakpoint, where the top nav replaces the burger.
const TABLET_QUERY = '(min-width: 48rem)'

// App header with two variants, chosen by the `isAuthenticated` prop:
// - Visitor (default): logo + "Log in" and "Create account" actions.
// - Signed-in surfer: logo + Discover / Status / Messages / My profile
//   (top nav on tablet and desktop, burger menu on mobile).
// Real authentication doesn't exist yet, so every page uses the visitor
// header; the layout will pass isAuthenticated once login is built.
function Header({ isAuthenticated = false }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const burgerButtonRef = useRef(null)

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
          isAuthenticated ? 'lg:pr-12' : 'lg:pr-7',
        ].join(' ')}
      >
        <Logo />

        {isAuthenticated ? (
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
        ) : (
          <VisitorActions />
        )}
      </div>

      {isAuthenticated && isMenuOpen && <MobileMenu onClose={closeMenu} />}
    </header>
  )
}

export default Header
