import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import profileImage from '../assets/profile-ocean.jpg'
import ProfileEditForm from '../components/profile/ProfileEditForm'
import ProfilePhotoField from '../components/profile/ProfilePhotoField'
import ProfileSummary from '../components/profile/ProfileSummary'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { getMyProfile, removeAvatar, uploadAvatar } from '../api/profile'
import { getRequestErrorMessage } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { useLocalPhoto } from '../hooks/useLocalPhoto'
import { getAvatarErrorMessage } from '../utils/avatarFile'

// Loads the signed-in surfer's profile; never throws
function fetchProfile() {
  return getMyProfile().then(
    ({ profile }) => ({ status: profile ? 'ready' : 'missing', profile, error: null }),
    (error) => ({ status: 'error', profile: null, error: getRequestErrorMessage(error) }),
  )
}

// /profile, following the Figma "My profile" frames: on tablet and desktop
// the shared auth/onboarding layout (intro column with a photo, white panel),
// on mobile only the panel content.
//
// The panel shows the profile picture (82px avatar next to the name, upload /
// replace / remove as in Task 6.6), then either:
// - View mode: the saved details and an "Edit profile" button, or
// - Edit mode: the profile form (ProfileEditForm), with Save and Cancel.
// The photo can be managed in both modes. The displayed profile always comes
// from the server: the GET on load, or the answer of a save or photo change.
function ProfilePage() {
  const { refreshSession } = useAuth()
  const [state, setState] = useState({ status: 'loading', profile: null, error: null })
  const [isEditing, setIsEditing] = useState(false)
  const [action, setAction] = useState(null) // 'upload' | 'remove' while busy
  const [photoError, setPhotoError] = useState(null)
  const [notice, setNotice] = useState(null)
  const preview = useLocalPhoto()
  const editButtonRef = useRef(null)
  const returnFocusRef = useRef(false)

  useEffect(() => {
    let isCurrent = true
    fetchProfile().then((result) => isCurrent && setState(result))
    return () => {
      isCurrent = false
    }
  }, [])

  // No profile although the route guard let the user in: the signed-in state
  // is out of date. Refreshing it lets the guard send them to onboarding
  // (no empty profile is ever created here).
  useEffect(() => {
    if (state.status === 'missing') refreshSession()
  }, [state.status, refreshSession])

  // After saving or cancelling, keyboard focus returns to "Edit profile"
  useEffect(() => {
    if (!isEditing && returnFocusRef.current) {
      returnFocusRef.current = false
      editButtonRef.current?.focus()
    }
  }, [isEditing])

  const retryLoad = useCallback(() => {
    setState({ status: 'loading', profile: null, error: null })
    fetchProfile().then(setState)
  }, [])

  function closeEditor() {
    returnFocusRef.current = true
    setIsEditing(false)
  }

  function handleSaved(profile) {
    setState((current) => ({ ...current, profile }))
    closeEditor()
  }

  async function changePhoto(file) {
    if (action) return
    setAction('upload')
    setPhotoError(null)
    setNotice(null)
    preview.setFile(file)
    try {
      const { profile } = await uploadAvatar(file)
      setState((current) => ({ ...current, profile }))
      setNotice('Profile photo updated.')
    } catch (error) {
      setPhotoError(getAvatarErrorMessage(error))
    } finally {
      preview.setFile(null)
      setAction(null)
    }
  }

  async function deletePhoto() {
    if (action) return
    setAction('remove')
    setPhotoError(null)
    setNotice(null)
    try {
      const { profile } = await removeAvatar()
      setState((current) => ({ ...current, profile }))
      setNotice('Profile photo removed.')
    } catch (error) {
      setPhotoError(getRequestErrorMessage(error))
    } finally {
      setAction(null)
    }
  }

  const { status, profile } = state

  return (
    <AuthPageLayout
      pageName="My Profile"
      image={profileImage}
      heading="My profile"
      description="Show the surf community who you are."
    >
      {(status === 'loading' || status === 'missing') && (
        <p role="status" className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle size={20} className="animate-spin text-teal" aria-hidden="true" />
          Loading your profile…
        </p>
      )}

      {status === 'error' && (
        <div>
          <Alert title="We couldn’t load your profile">{state.error}</Alert>
          <Button variant="outline" className="mt-4" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      )}

      {status === 'ready' && profile && (
        <>
          <ProfilePhotoField
            displayName={profile.displayName}
            title={profile.displayName}
            imageUrl={preview.previewUrl ?? profile.avatarUrl}
            avatarSize="xl"
            framed={false}
            busy={action !== null}
            busyLabel={action === 'remove' ? 'Removing photo…' : 'Uploading photo…'}
            error={photoError}
            onSelectFile={changePhoto}
            onRemove={deletePhoto}
          />
          <p role="status" className="mt-3 min-h-4 text-[11px] text-muted">
            {notice}
          </p>

          <div className="mt-4">
            {isEditing ? (
              <ProfileEditForm profile={profile} onSaved={handleSaved} onCancel={closeEditor} />
            ) : (
              <>
                <ProfileSummary profile={profile} />
                <Button ref={editButtonRef} fullWidth className="mt-10" onClick={() => setIsEditing(true)}>
                  Edit profile
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </AuthPageLayout>
  )
}

export default ProfilePage
