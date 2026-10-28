import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import AuthPageLayout from '../components/auth/AuthPageLayout'
import onboardingImage from '../assets/onboarding-ocean.jpg'
import FavoriteSpotsPicker from '../components/profile/FavoriteSpotsPicker'
import ProfilePhotoField from '../components/profile/ProfilePhotoField'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Textarea from '../components/ui/Textarea'
import { getMyProfile, getSurfSpots, saveMyProfile, uploadAvatar } from '../api/profile'
import { useLocalPhoto } from '../hooks/useLocalPhoto'
import { getAvatarErrorMessage } from '../utils/avatarFile'
import { getRequestErrorMessage, SERVER_ERROR_MESSAGE } from '../api/errorMessages'
import { useAuth } from '../auth/useAuth'
import { AUTH_STATUS } from '../auth/authContext'
import { DEFAULT_AFTER_LOGIN } from '../auth/returnPath'
import { SKILL_LEVEL_OPTIONS } from '../config/skillLevels'
import { SURFBOARD_OPTIONS } from '../config/surfboards'
import {
  ABOUT_MAX_LENGTH,
  buildProfilePayload,
  characterCount,
  DISPLAY_NAME_MAX_LENGTH,
  normalizeAbout,
  validateAbout,
  validateBoardType,
  validateDisplayName,
  validateFavoriteSpotIds,
  validateSkillLevel,
} from '../utils/profileValidation'

// In form order: the first invalid one gets focus on submit
const FIELDS = ['displayName', 'skillLevel', 'boardType', 'favoriteSpotIds', 'about']
const FAVORITE_SPOTS_FIELD_ID = 'favorite-spots'

export const SAVED_NOT_CONFIRMED_MESSAGE =
  'Your profile was saved, but we couldn’t confirm it yet. Please try again.'

// Loads the surf spots; never throws, so the form works without them
function fetchSurfSpots() {
  return getSurfSpots().then(
    ({ spots }) => ({ status: 'ready', list: Array.isArray(spots) ? spots : [] }),
    () => ({ status: 'error', list: [] }),
  )
}

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
  const [photoError, setPhotoError] = useState(null)
  // 'profile' or 'photo': what the submit button is currently doing
  const [savingStep, setSavingStep] = useState('profile')
  // True once the profile exists but its photo upload failed
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false)

  const [values, setValues] = useState({ displayName: '', skillLevel: '', boardType: '', about: '', favoriteSpotIds: [] })
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [spots, setSpots] = useState({ status: 'loading', list: [] })
  const submittingRef = useRef(false) // blocks double submits immediately
  const displayNameRef = useRef(null)
  const skillLevelRef = useRef(null)
  const boardTypeRef = useRef(null)
  const aboutRef = useRef(null)

  useEffect(() => {
    let isCurrent = true
    fetchSurfSpots().then((result) => isCurrent && setSpots(result))
    return () => {
      isCurrent = false
    }
  }, [])

  // If a profile already exists (e.g. created in another tab), the signed-in
  // state is out of date: refresh it, and OnboardingRoute moves the user on.
  useEffect(() => {
    getMyProfile()
      .then(({ profile }) => profile && refreshSession())
      .catch(() => {}) // not essential: saving works either way
  }, [refreshSession])

  function retrySpots() {
    setSpots({ status: 'loading', list: [] })
    fetchSurfSpots().then(setSpots)
  }

  const knownSpotIds = new Set(spots.list.map((spot) => spot.id))
  const clientErrors = {
    displayName: validateDisplayName(values.displayName),
    skillLevel: validateSkillLevel(values.skillLevel),
    boardType: validateBoardType(values.boardType),
    favoriteSpotIds: validateFavoriteSpotIds(values.favoriteSpotIds, knownSpotIds),
    about: validateAbout(values.about),
  }
  // Errors appear after leaving a field or submitting, then update live.
  // About shows its limit while typing, next to the character counter.
  const fieldError = (field) =>
    ((touched[field] || submitted || field === 'about') && clientErrors[field]) || serverErrors[field]

  function setField(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setServerErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleChange(field) {
    return (event) => setField(field, event.target.value)
  }

  function handleBlur(field) {
    return () => setTouched((current) => ({ ...current, [field]: true }))
  }

  function focusField(field) {
    const refs = { displayName: displayNameRef, skillLevel: skillLevelRef, boardType: boardTypeRef, about: aboutRef }
    if (field === 'favoriteSpotIds') document.getElementById(FAVORITE_SPOTS_FIELD_ID)?.focus()
    else refs[field]?.current?.focus()
  }

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

    setSubmitted(true)
    setFormError(null)
    setServerErrors({})

    const firstInvalid = FIELDS.find((field) => clientErrors[field])
    if (firstInvalid) return focusField(firstInvalid)

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      await saveMyProfile(buildProfilePayload(values))
      if (await uploadChosenPhoto()) await finishOnboarding()
    } catch (error) {
      if (error.kind === 'http' && error.status === 400 && error.fieldErrors) {
        const fieldErrors = Object.fromEntries(FIELDS.map((field) => [field, error.fieldErrors[field]]))
        setServerErrors(fieldErrors)
        const firstServerError = FIELDS.find((field) => fieldErrors[field])
        if (firstServerError) focusField(firstServerError)
        else setFormError(SERVER_ERROR_MESSAGE)
      } else if (error.kind === 'http' && error.status === 401) {
        // The session ended: refreshing the state sends the user to log in
        setFormError('Your session has ended. Please log in again.')
        refreshSession()
      } else {
        setFormError(getRequestErrorMessage(error))
      }
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
      setSavingStep('profile')
    }
  }

  function choosePhoto(file) {
    photo.setFile(file)
    setPhotoError(null)
  }

  function removePhoto() {
    photo.setFile(null)
    setPhotoError(null)
  }

  const aboutLength = characterCount(normalizeAbout(values.about))

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
          displayName={values.displayName}
          imageUrl={photo.previewUrl}
          avatarSize="photoField"
          optional
          busy={isSubmitting && savingStep === 'photo'}
          error={photoUploadFailed ? undefined : photoError}
          onSelectFile={choosePhoto}
          onRemove={removePhoto}
        />

        <p className="-mb-2 text-[11px] text-muted">
          Fields marked <span className="text-danger" aria-hidden="true">*</span>
          <span className="sr-only">with an asterisk</span> are required.
        </p>

        <Input
          ref={displayNameRef}
          label="Display name"
          name="displayName"
          autoComplete="nickname"
          placeholder="How other surfers will see you"
          helperText={`Up to ${DISPLAY_NAME_MAX_LENGTH} characters.`}
          required
          value={values.displayName}
          onChange={handleChange('displayName')}
          onBlur={handleBlur('displayName')}
          error={fieldError('displayName')}
        />

        <Select
          ref={skillLevelRef}
          label="Surf level"
          name="skillLevel"
          placeholder="Choose your level"
          options={SKILL_LEVEL_OPTIONS}
          required
          value={values.skillLevel}
          onChange={handleChange('skillLevel')}
          onBlur={handleBlur('skillLevel')}
          error={fieldError('skillLevel')}
        />

        <Select
          ref={boardTypeRef}
          label="Board"
          name="boardType"
          placeholder="Select your board type"
          clearLabel="No board selected"
          optional
          options={SURFBOARD_OPTIONS}
          value={values.boardType}
          onChange={handleChange('boardType')}
          onBlur={handleBlur('boardType')}
          error={fieldError('boardType')}
        />

        <FavoriteSpotsPicker
          id={FAVORITE_SPOTS_FIELD_ID}
          spots={spots.list}
          status={spots.status}
          value={values.favoriteSpotIds}
          onChange={(ids) => setField('favoriteSpotIds', ids)}
          onRetry={retrySpots}
          error={fieldError('favoriteSpotIds')}
        />

        <Textarea
          ref={aboutRef}
          label="About"
          name="about"
          rows={4}
          placeholder="Your surf style, favorite conditions, when you usually paddle out…"
          helperText={`${aboutLength}/${ABOUT_MAX_LENGTH} characters.`}
          optional
          value={values.about}
          onChange={handleChange('about')}
          onBlur={handleBlur('about')}
          error={fieldError('about')}
        />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting} className="mt-2">
          {!isSubmitting ? 'Save profile' : savingStep === 'photo' ? 'Uploading photo…' : 'Saving profile…'}
        </Button>
      </form>
    </AuthPageLayout>
  )
}

export default CreateProfilePage
