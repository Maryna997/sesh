import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import Logo from './Logo'
import TopNav from './TopNav'
import MobileMenu, { MOBILE_MENU_ID } from './MobileMenu'

// Matches Tailwind's `md` breakpoint, where the top nav replaces the burger.
const TABLET_QUERY = '(min-width: 48rem)'

// App header: logo on the left, navigation on the right.
// Mobile shows a burger button; tablet and desktop show the top nav.
function Header() {
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
      <div className="flex h-[70px] items-center justify-between px-[22px] md:h-[72px] md:pr-5 md:pl-7 lg:h-20 lg:pr-[78px] lg:pl-12">
        <Logo />
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
      </div>

      {isMenuOpen && <MobileMenu onClose={closeMenu} />}
    </header>
  )
}

export default Header
