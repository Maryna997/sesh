import { LoaderCircle, UserX } from 'lucide-react'
import { useParams } from 'react-router'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import surferImage from '../assets/login-ocean.jpg'
import PublicProfileView from '../components/profile/PublicProfileView'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { usePublicProfile } from '../hooks/usePublicProfile'

// /surfers/:userId: another surfer's public profile, opened from a Discover
// card (Figma "Surfer profile" frames, shared two-column layout; the Figma
// photo is the same image as the login page's). Read-only.
//
// GET /api/v1/profiles/:userId on load and whenever the id in the URL
// changes; the back arrow and "Back to Discover" lead to /discover.
function SurferProfilePage() {
  const { userId } = useParams()
  const { status, profile, error, retry } = usePublicProfile(userId)

  return (
    <AuthPageLayout
      pageName="Surfer profile"
      image={surferImage}
      heading="Surfer profile"
      description="More spontaneity, more shared sessions"
      backTo="/discover"
      backLabel="Back to Discover"
    >
      {/* Stays on the page, so screen readers announce the loading message */}
      <p role="status" className="sr-only">
        {status === 'loading' ? 'Loading surfer profile…' : ''}
      </p>

      {status === 'loading' && (
        <p aria-hidden="true" className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle size={20} className="animate-spin text-teal" />
          Loading surfer profile…
        </p>
      )}

      {status === 'error' && (
        <div>
          <Alert title="We couldn’t load this profile">{error}</Alert>
          <Button variant="outline" className="mt-4" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {status === 'not-found' && (
        <EmptyState
          icon={UserX}
          title="Surfer not found"
          description="This profile doesn’t exist or is no longer available."
          action={
            <Button variant="outline" to="/discover">
              Back to Discover
            </Button>
          }
        />
      )}

      {status === 'ready' && profile && <PublicProfileView profile={profile} />}
    </AuthPageLayout>
  )
}

export default SurferProfilePage
