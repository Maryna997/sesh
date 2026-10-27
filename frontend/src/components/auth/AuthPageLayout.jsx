import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import heroImage from '../../assets/hero-ocean.jpg'

// Layout of the Login and Register pages, from the Figma auth frames:
// - A back arrow at the top left. It links to the home page rather than
//   "browser back", which could leave Sesh when the page was opened directly.
// - Tablet and desktop: an intro column (eyebrow, page name, tagline, photo)
//   next to a white rounded panel holding the form.
// - Mobile: only the heading and the form, directly on the page background.
//
// `pageName` is the large label in the intro column ("Login"); `heading` and
// `description` introduce the form ("Welcome back"). The heading is the
// page's <h1>, because the intro column is hidden on mobile.
//
// Vertical balance: the intro column (with its photo) is usually taller than
// the form, so the form card is centered against it instead of sitting at
// the top. On desktop this applies to every auth page. On tablet only pages
// that pass `centerOnTablet` are centered (Login, whose form is short); the
// Register form is about as tall as the intro column and keeps its layout.
// The grid row grows with its content, so nothing is clipped on short
// screens; the page simply scrolls.
function AuthPageLayout({ pageName, heading, description, centerOnTablet = false, children }) {
  return (
    <>
      <Link
        to="/"
        aria-label="Back to home page"
        className="-mt-2 -ml-2 mb-4 flex size-11 items-center justify-center rounded-lg text-ink hover:bg-card focus-visible:outline-2 focus-visible:outline-blue md:mb-2"
      >
        <ArrowLeft size={24} aria-hidden="true" />
      </Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_390px] lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-16">
        <div className="hidden md:block md:pt-12 lg:pt-6">
          <p className="text-xs font-bold whitespace-pre-wrap text-link">{'SESH  /  SURF COMMUNITY'}</p>
          <p className="mt-8 text-[30px] font-bold text-ink lg:text-4xl">{pageName}</p>
          <p className="mt-10 max-w-[540px] text-[15px] text-muted lg:text-[17px]">
            Find your people. Share your plans. Keep the freedom to change them.
          </p>
          <img
            src={heroImage}
            alt=""
            className="mt-14 h-[175px] w-full max-w-[520px] rounded-[28px] object-cover lg:h-[320px]"
          />
          <p className="mt-5 text-xs text-muted">No live GPS required · Status-based matching</p>
        </div>

        <section className={`md:rounded-[20px] md:bg-white md:p-8 lg:self-center ${centerOnTablet ? 'md:self-center' : ''}`}>
          <h1 className="text-[26px] font-bold text-ink">{heading}</h1>
          <p className="mt-3 text-[13px] text-muted">{description}</p>
          <div className="mt-8">{children}</div>
        </section>
      </div>
    </>
  )
}

export default AuthPageLayout
