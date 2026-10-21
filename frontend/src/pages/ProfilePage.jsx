import PageIntro from '../components/PageIntro'
import ComingSoon from '../components/ComingSoon'

function ProfilePage() {
  return (
    <PageIntro
      title="My Profile"
      description="Show other surfers who you are in the water."
    >
      <ComingSoon />
    </PageIntro>
  )
}

export default ProfilePage
