import { NavLink } from 'react-router'
import { topNavItems } from '../../config/navigation'

// Horizontal navigation for signed-in surfers, shown on tablet and desktop
// (hidden on mobile, where the burger menu is used instead).
// NavLink knows which route is active: it adds aria-current="page" for
// screen readers, and we use its isActive flag to make the link bold.
//
// Tablet keeps the Figma layout of four equal columns. Desktop uses equal
// gaps between the links so they look evenly spaced.
function TopNav() {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="grid w-[305px] grid-cols-4 text-center text-xs lg:flex lg:w-auto lg:items-center lg:gap-9 lg:text-sm">
        {topNavItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                [
                  'block rounded-md px-1 py-2 text-ink underline-offset-8 transition-colors',
                  'hover:text-link focus-visible:outline-2 focus-visible:outline-blue',
                  isActive ? 'font-bold underline decoration-blue decoration-2' : 'font-normal',
                ].join(' ')
              }
            >
              {/* The hidden bold copy reserves the bold width, so the links
                  don't shift when the active one becomes bold. */}
              <span className="inline-grid">
                <span className="col-start-1 row-start-1">{item.label}</span>
                <span aria-hidden="true" className="invisible col-start-1 row-start-1 h-0 font-bold">
                  {item.label}
                </span>
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default TopNav
