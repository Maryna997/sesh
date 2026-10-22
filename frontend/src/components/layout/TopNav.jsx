import { NavLink } from 'react-router'
import { topNavItems } from '../../config/navigation'

// Horizontal navigation shown on tablet and desktop (hidden on mobile).
// NavLink knows which route is active: it adds aria-current="page" for
// screen readers, and we use its isActive flag to make the link bold.
function TopNav() {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="grid w-[305px] grid-cols-4 text-center text-xs lg:w-[362px] lg:text-sm">
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
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default TopNav
