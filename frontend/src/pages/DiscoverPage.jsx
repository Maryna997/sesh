import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'

function DiscoverPage() {
  return (
    <PageIntro
      title="Discover"
      description="Find surfers at your spot, now or soon."
    >
      <ComingSoon />
    </PageIntro>
  )
}

export default DiscoverPage
