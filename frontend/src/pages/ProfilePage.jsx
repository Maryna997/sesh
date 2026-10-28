import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import PageIntro from '../components/PageIntro'
import ProfilePhotoField from '../components/profile/ProfilePhotoField'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { getMyProfile, removeAvatar, uploadAvatar } from '../api/profile'
import { getRequestErrorMessage } from '../api/errorMessages'
import { useLocalPhoto } from '../hooks/useLocalPhoto'
import { getAvatarErrorMessage } from '../utils/avatarFile'

// Loads the signed-in surfer's profile; never throws
function fetchProfile() {
  return getMyProfile().then(
    ({ profile }) => ({ status: 'ready', profile, error: null }),
    (error) => ({ status: 'error', profile: null, error: getRequestErrorMessage(error) }),
  )
}

// /profile. For now only the profile picture can be managed here (upload,
// replace, remove), following the Figma "My profile" frame: the 82px avatar
// next to the surfer's name. Editing the other details is a later task.
//
// A chosen photo is uploaded right away; while it uploads, the local preview
// is shown. The saved profile (and its Cloudinary URL) always comes from the
// server's answer, so a failed upload never loses what was saved.
function ProfilePage() {
  const [state, setState] = useState({ status: 'loading', profile: null, error: null })
  const [action, setAction] = useState(null) // 'upload' | 'remove' while busy
  const [photoError, setPhotoError] = useState(null)
  const [notice, setNotice] = useState(null)
  const preview = useLocalPhoto()

  useEffect(() => {
    let isCurrent = true
    fetchProfile().then((result) => isCurrent && setState(result))
    return () => {
      isCurrent = false
    }
  }, [])

  const retryLoad = useCallback(() => {
    setState({ status: 'loading', profile: null, error: null })
    fetchProfile().then(setState)
  }, [])

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
    <PageIntro title="My Profile" description="Show other surfers who you are in the water.">
      <div className="mt-8">
        {status === 'loading' && (
          <p role="status" className="flex items-center gap-3 text-sm text-muted">
            <LoaderCircle size={20} className="animate-spin text-teal" aria-hidden="true" />
            Loading your profile…
          </p>
        )}

        {status === 'error' && (
          <div className="max-w-md">
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
            <p className="mt-6 rounded-2xl bg-pale px-5 py-4 text-sm text-ink">
              Editing your other profile details is coming soon.
            </p>
          </>
        )}
      </div>
    </PageIntro>
  )
}

export default ProfilePage
