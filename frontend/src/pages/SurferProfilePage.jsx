import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'
import Button from '../components/ui/Button'

// /surfers/:userId: another surfer's public profile, opened from a Discover
// card. Placeholder until the public profile page is built (Task 8.5).
function SurferProfilePage() {
  return (
    <PageIntro title="Surfer profile" description="Public surfer profiles are on their way.">
      <ComingSoon />
      <Button variant="outline" to="/discover" className="mt-6">
        Back to Discover
      </Button>
    </PageIntro>
  )
}

export default SurferProfilePage
