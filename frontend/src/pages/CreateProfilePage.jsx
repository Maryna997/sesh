import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import onboardingImage from '../assets/onboarding-ocean.jpg'
import ProfileDetailsFields from '../components/profile/ProfileDetailsFields'
import ProfilePhotoField from '../components/profile/ProfilePhotoField'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { getMyProfile, saveMyProfile, uploadAvatar } from '../api/profile'
import { useLocalPhoto } from '../hooks/useLocalPhoto'
import { useProfileForm, EMPTY_PROFILE_VALUES } from '../hooks/useProfileForm'
import { useSurfSpots } from '../hooks/useSurfSpots'
import { getAvatarErrorMessage } from '../utils/avatarFile'
import { getRequestErrorMessage, SERVER_ERROR_MESSAGE } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { AUTH_STATUS } from '../auth/authContext'
import { DEFAULT_AFTER_LOGIN } from '../auth/returnPath'
import { buildProfilePayload } from '../utils/profileValidation'

export const SAVED_NOT_CONFIRMED_MESSAGE =
  'Your profile was saved, but we couldn’t confirm it yet. Please try again.'

// /create-profile: onboarding step between logging in and using Sesh.
// Only signed-in users without a surfer profile get here (see OnboardingRoute).
//
// Saving, in this order (a photo needs an existing profile):
// 1. PUT /api/v1/profile/me creates the profile.
// 2. If a photo was chosen, POST /api/v1/profile/me/avatar uploads it. If
//    that fails, the saved profile is kept and the user can retry the photo
//    or continue without it.
// 3. GET /auth/me: move on to Discover only once the server confirms the
//    profile is complete.
function CreateProfilePage() {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  const photo = useLocalPhoto()
  const spots = useSurfSpots()
  const form = useProfileForm(EMPTY_PROFILE_VALUES, new Set(spots.list.map((spot) => spot.id)))
  const [photoError, setPhotoError] = useState(null)
  // 'profile' or 'photo': what the submit button is currently doing
  const [savingStep, setSavingStep] = useState('profile')
  // True once the profile exists but its photo upload failed
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false)
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false) // blocks double submits immediately

  // If a profile already exists (e.g. created in another tab), the signed-in
  // state is out of date: refresh it, and OnboardingRoute moves the user on.
  useEffect(() => {
    getMyProfile()
      .then(({ profile }) => profile && refreshSession())
      .catch(() => {}) // not essential: saving works either way
  }, [refreshSession])

  // The server is the source of truth for onboarding: move on only once
  // GET /auth/me confirms the completed profile.
  async function finishOnboarding() {
    const session = await refreshSession()
    if (session.status === AUTH_STATUS.AUTHENTICATED && session.hasCompletedProfile) {
      navigate(DEFAULT_AFTER_LOGIN, { replace: true })
    } else if (session.status !== AUTH_STATUS.UNAUTHENTICATED) {
      // (Signed out: RequireAuth already sends the user to log in.)
      setFormError(SAVED_NOT_CONFIRMED_MESSAGE)
    }
  }

  // Uploads the chosen photo (if any). Returns false when the upload failed.
  async function uploadChosenPhoto() {
    if (!photo.file) return true
    setSavingStep('photo')
    try {
      await uploadAvatar(photo.file)
      setPhotoUploadFailed(false)
      setPhotoError(null)
      return true
    } catch (error) {
      setPhotoUploadFailed(true)
      setPhotoError(getAvatarErrorMessage(error))
      return false
    }
  }

  // Runs one save step at a time; blocks double clicks and double submits
  async function runExclusive(step) {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    try {
      await step()
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
      setSavingStep('profile')
    }
  }

  // After a failed photo upload: try the photo again, or continue without it
  function retryPhoto() {
    return runExclusive(async () => {
      if (await uploadChosenPhoto()) await finishOnboarding()
    })
  }

  function continueWithoutPhoto() {
    return runExclusive(async () => {
      photo.setFile(null)
      setPhotoUploadFailed(false)
      setPhotoError(null)
      await finishOnboarding()
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return

    setFormError(null)
    if (!form.validateForSubmit()) return

    await runExclusive(async () => {
      try {
        await saveMyProfile(buildProfilePayload(form.values))
        if (await uploadChosenPhoto()) await finishOnboarding()
      } catch (error) {
        if (error.kind === 'http' && error.status === 400 && error.fieldErrors) {
          if (!form.showServerErrors(error.fieldErrors)) setFormError(SERVER_ERROR_MESSAGE)
        } else if (error.kind === 'http' && error.status === 401) {
          // The session ended: refreshing the state sends the user to log in
          setFormError('Your session has ended. Please log in again.')
          refreshSession()
        } else {
          setFormError(getRequestErrorMessage(error))
        }
      }
    })
  }

  function choosePhoto(file) {
    photo.setFile(file)
    setPhotoError(null)
  }

  function removePhoto() {
    photo.setFile(null)
    setPhotoError(null)
  }

  return (
    <AuthPageLayout
      pageName="Complete surfer profile"
      image={onboardingImage}
      heading="Tell us about your surfing"
      description="Help surfers find a compatible partner."
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6" aria-label="Create your surfer profile">
        {formError && <Alert>{formError}</Alert>}

        {photoUploadFailed && (
          <div>
            <Alert title="Your profile was saved, but the photo wasn’t uploaded">
              {photoError} You can try again, or continue and add a photo later on My Profile.
            </Alert>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={retryPhoto} disabled={isSubmitting}>
                Try the photo again
              </Button>
              <Button variant="outline" size="sm" onClick={continueWithoutPhoto} disabled={isSubmitting}>
                Continue without photo
              </Button>
            </div>
          </div>
        )}

        <ProfilePhotoField
          displayName={form.values.displayName}
          imageUrl={photo.previewUrl}
          avatarSize="photoField"
          optional
          busy={isSubmitting && savingStep === 'photo'}
          error={photoUploadFailed ? undefined : photoError}
          onSelectFile={choosePhoto}
          onRemove={removePhoto}
        />

        <ProfileDetailsFields form={form} spots={spots} />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting} className="mt-2">
          {!isSubmitting ? 'Save profile' : savingStep === 'photo' ? 'Uploading photo…' : 'Saving profile…'}
        </Button>
      </form>
    </AuthPageLayout>
  )
}

export default CreateProfilePage
