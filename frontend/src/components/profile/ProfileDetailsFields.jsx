import FavoriteSpotsPicker from './FavoriteSpotsPicker'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import { SKILL_LEVEL_OPTIONS } from '../../config/skillLevels'
import { SURFBOARD_OPTIONS } from '../../config/surfboards'
import { FAVORITE_SPOTS_FIELD_ID } from '../../hooks/useProfileForm'
import { ABOUT_MAX_LENGTH, characterCount, DISPLAY_NAME_MAX_LENGTH, normalizeAbout } from '../../utils/profileValidation'

// The surfer profile fields (display name, surf level, board, favorite spots,
// about), shared by Create Profile and the My Profile edit form.
// `form` comes from useProfileForm, `spots` from useSurfSpots.
function ProfileDetailsFields({ form, spots }) {
  const { values, displayNameRef, skillLevelRef, boardTypeRef, aboutRef, fieldError, setField, handleChange, handleBlur } = form
  const aboutLength = characterCount(normalizeAbout(values.about))

  return (
    <>
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
        onRetry={spots.retry}
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
    </>
  )
}

export default ProfileDetailsFields
