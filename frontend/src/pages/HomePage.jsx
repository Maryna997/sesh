import PageIntro from '../components/PageIntro'
import Button from '../components/ui/Button'
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
      <Button to="/discover" size="lg" className="mt-8">
        Start discovering
      </Button>

      <div className="mt-10 max-w-md">
        <h2 className="mb-2 text-xs font-bold text-muted">Development: API connection</h2>
        <ApiHealthCheck />
      </div>
    </PageIntro>
  )
}

export default HomePage
