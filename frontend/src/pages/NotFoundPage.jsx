import { Link } from 'react-router'
import PageIntro from '../components/PageIntro'

// Fallback for any URL that doesn't match a route.
function NotFoundPage() {
  return (
    <PageIntro
      eyebrow="404"
      title="Page not found"
      description="This page drifted out with the tide."
    >
      <Link
        to="/discover"
        className="mt-8 inline-block text-sm font-bold text-blue hover:text-ink focus-visible:outline-2 focus-visible:outline-blue"
      >
        Go to Discover →
      </Link>
    </PageIntro>
  )
}

export default NotFoundPage
