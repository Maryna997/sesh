import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'

function StatusPage() {
  return (
    <PageIntro
      title="My Status"
      description="Set a spot and time. No GPS needed."
    >
      <ComingSoon />
    </PageIntro>
  )
}

export default StatusPage
