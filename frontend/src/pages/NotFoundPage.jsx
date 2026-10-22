import { ArrowRight } from 'lucide-react'
import PageIntro from '../components/PageIntro'
import Button from '../components/ui/Button'

// Fallback for any URL that doesn't match a route.
function NotFoundPage() {
  return (
    <PageIntro
      eyebrow="404"
      title="Page not found"
      description="This page drifted out with the tide."
    >
      <Button to="/discover" variant="text" className="mt-6 -ml-4">
        Go to Discover <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </PageIntro>
  )
}

export default NotFoundPage
