import { useRef, useState } from 'react'
import {
  validateAbout,
  validateBoardType,
  validateDisplayName,
  validateFavoriteSpotIds,
  validateSkillLevel,
} from '../utils/profileValidation'

// In form order: the first invalid one gets focus on submit
export const PROFILE_FIELDS = ['displayName', 'skillLevel', 'boardType', 'favoriteSpotIds', 'about']
export const FAVORITE_SPOTS_FIELD_ID = 'favorite-spots'

export const EMPTY_PROFILE_VALUES = { displayName: '', skillLevel: '', boardType: '', about: '', favoriteSpotIds: [] }

// Form values from a saved profile (GET /api/v1/profile/me). Empty optional
// fields become "" so the inputs stay controlled.
export function profileToFormValues(profile) {
  return {
    displayName: profile.displayName ?? '',
    skillLevel: profile.skillLevel ?? '',
    boardType: profile.boardType ?? '',
    about: profile.about ?? '',
    favoriteSpotIds: (profile.favoriteSpots ?? []).map((spot) => spot.id),
  }
}

// State and validation of the surfer profile form, shared by Create Profile
// and the My Profile edit form, so both follow exactly the same rules.
//
// - Errors appear after leaving a field or submitting, then update live.
//   About shows its limit while typing, next to the character counter.
// - `validateForSubmit()` marks the form as submitted and focuses the first
//   invalid field; it returns true when everything is valid.
// - `showServerErrors(fieldErrors)` shows the API's per-field messages
//   (400 "errors"); it returns false when none of them belongs to a field.
export function useProfileForm(initialValues, knownSpotIds) {
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const displayNameRef = useRef(null)
  const skillLevelRef = useRef(null)
  const boardTypeRef = useRef(null)
  const aboutRef = useRef(null)

  const clientErrors = {
    displayName: validateDisplayName(values.displayName),
    skillLevel: validateSkillLevel(values.skillLevel),
    boardType: validateBoardType(values.boardType),
    favoriteSpotIds: validateFavoriteSpotIds(values.favoriteSpotIds, knownSpotIds),
    about: validateAbout(values.about),
  }

  const fieldError = (field) =>
    ((touched[field] || submitted || field === 'about') && clientErrors[field]) || serverErrors[field]

  function setField(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setServerErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleChange = (field) => (event) => setField(field, event.target.value)
  const handleBlur = (field) => () => setTouched((current) => ({ ...current, [field]: true }))

  function focusField(field) {
    const fieldRefs = { displayName: displayNameRef, skillLevel: skillLevelRef, boardType: boardTypeRef, about: aboutRef }
    if (field === 'favoriteSpotIds') document.getElementById(FAVORITE_SPOTS_FIELD_ID)?.focus()
    else fieldRefs[field]?.current?.focus()
  }

  function validateForSubmit() {
    setSubmitted(true)
    setServerErrors({})
    const firstInvalid = PROFILE_FIELDS.find((field) => clientErrors[field])
    if (firstInvalid) {
      focusField(firstInvalid)
      return false
    }
    return true
  }

  function showServerErrors(fieldErrors) {
    const errors = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, fieldErrors?.[field]]))
    setServerErrors(errors)
    const firstServerError = PROFILE_FIELDS.find((field) => errors[field])
    if (firstServerError) focusField(firstServerError)
    return Boolean(firstServerError)
  }

  return {
    values,
    displayNameRef,
    skillLevelRef,
    boardTypeRef,
    aboutRef,
    fieldError,
    setField,
    handleChange,
    handleBlur,
    focusField,
    validateForSubmit,
    showServerErrors,
  }
}
