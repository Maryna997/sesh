import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'

function MessagesPage() {
  return (
    <PageIntro
      title="Messages"
      description="Chat with surfers to plan your next session."
    >
      <ComingSoon />
    </PageIntro>
  )
}

export default MessagesPage
