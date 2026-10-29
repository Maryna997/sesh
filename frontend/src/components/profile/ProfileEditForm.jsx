import { useEffect, useRef, useState } from 'react'
import ProfileDetailsFields from './ProfileDetailsFields'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import { saveMyProfile } from '../../api/profile'
import { getRequestErrorMessage, SERVER_ERROR_MESSAGE } from '../../api/errorMessages'
import { useAuth } from '../../auth/useAuth'
import { profileToFormValues, useProfileForm } from '../../hooks/useProfileForm'
import { useSurfSpots } from '../../hooks/useSurfSpots'
import { buildProfilePayload } from '../../utils/profileValidation'

// Edit mode of My Profile: the same fields and rules as Create Profile,
// filled with the saved profile.
//
// - "Save changes" sends PUT /api/v1/profile/me with the profile fields only
//   (never the avatar fields), then calls onSaved(profile) with the server's
//   answer. If saving fails, the form stays open with the entered values.
// - "Cancel" calls onCancel() without any request; the parent closes the
//   form, so the unsaved values are simply dropped.
function ProfileEditForm({ profile, onSaved, onCancel }) {
  const { refreshSession } = useAuth()
  const spots = useSurfSpots()
  const form = useProfileForm(profileToFormValues(profile), new Set(spots.list.map((spot) => spot.id)))
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false) // blocks double submits immediately
  const { displayNameRef } = form

  // Start editing at the first field when the form opens
  useEffect(() => {
    displayNameRef.current?.focus()
  }, [displayNameRef])

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return

    setFormError(null)
    if (!form.validateForSubmit()) return

    savingRef.current = true
    setIsSaving(true)
    try {
      const { profile: saved } = await saveMyProfile(buildProfilePayload(form.values))
      onSaved(saved)
      return // the form closes; nothing else to update here
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
    savingRef.current = false
    setIsSaving(false)
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6" aria-label="Edit your surfer profile">
      {formError && <Alert>{formError}</Alert>}

      <ProfileDetailsFields form={form} spots={spots} />

      <div className="mt-2 flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" loading={isSaving} fullWidth className="sm:flex-1">
          {isSaving ? 'Saving changes…' : 'Save changes'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isSaving} fullWidth className="sm:flex-1">
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default ProfileEditForm
