import { Link } from 'react-router'
import logoUrl from '../../assets/sesh-logo.svg'

// The flowing-wave Sesh logo. It grows slightly on larger screens,
// matching the mobile (78px), tablet (88px) and desktop (101px) Figma frames.
function Logo() {
  return (
    <Link
      to="/"
      className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue"
    >
      <img
        src={logoUrl}
        alt="Sesh home"
        className="h-auto w-[78px] md:w-[88px] lg:w-[101px]"
      />
    </Link>
  )
}

export default Logo
