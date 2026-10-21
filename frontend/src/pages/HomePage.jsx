import { Link } from 'react-router'
import PageIntro from '../components/PageIntro'
import ApiHealthCheck from '../components/ApiHealthCheck'

// Temporary home page. It will be replaced by the public landing page
// in a later task; for now it keeps the API connection check visible.
function HomePage() {
  return (
    <PageIntro
      eyebrow="YOUR NEXT SESSION STARTS HERE"
      title="Find your surf people."
      description="Good waves are better together."
    >
      <Link
        to="/discover"
        className="mt-8 inline-block rounded-[10px] bg-blue px-6 py-3 text-sm font-bold text-white hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        Start discovering
      </Link>

      <div className="mt-10 max-w-md">
        <h2 className="mb-2 text-xs font-bold text-muted">Development: API connection</h2>
        <ApiHealthCheck />
      </div>
    </PageIntro>
  )
}

export default HomePage
