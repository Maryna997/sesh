import { Link, NavLink, useLocation } from 'react-router'

// A navigation link that is also highlighted on the pages of its section:
// Discover stays highlighted while a surfer profile opened from Discover
// (/surfers/:userId) is shown. `sectionPaths` lists those path prefixes.
//
// On its own page it is a normal NavLink (aria-current="page"). On a section
// page it gets the same active style and aria-current="true" ("current
// section", not "this page").
// `className` is NavLink's function form: ({ isActive }) => classes.
function SectionNavLink({ to, sectionPaths = [], className, children, ...rest }) {
  const { pathname } = useLocation()
  const inSection = sectionPaths.some((path) => pathname.startsWith(path))

  if (inSection) {
    return (
      <Link to={to} aria-current="true" className={className({ isActive: true })} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <NavLink to={to} className={className} {...rest}>
      {children}
    </NavLink>
  )
}

export default SectionNavLink
