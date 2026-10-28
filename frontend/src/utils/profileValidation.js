// Validators for the surfer profile form (Create Profile).
// Each returns an error message string, or undefined when the value is valid.
//
// Limits and normalization match the backend
// (backend/src/utils/profileValidation.js), which checks everything again:
// these only give faster feedback.
import { SKILL_LEVEL_OPTIONS } from '../config/skillLevels'
import { SURFBOARD_OPTIONS } from '../config/surfboards'

export const DISPLAY_NAME_MAX_LENGTH = 50
export const ABOUT_MAX_LENGTH = 500
export const FAVORITE_SPOTS_MAX = 3

// Same wording as the backend
export const FAVORITE_SPOTS_LIMIT_MESSAGE = `Choose a maximum of ${FAVORITE_SPOTS_MAX} favorite spots.`

const SKILL_LEVELS = SKILL_LEVEL_OPTIONS.map((option) => option.value)
const BOARD_TYPES = SURFBOARD_OPTIONS.map((option) => option.value)

// Counts characters the way users (and the backend) do: an emoji is one
export const characterCount = (value) => [...value].length

// "  Kai   Silva " -> "Kai Silva"
export function normalizeDisplayName(value) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ')
}

// Keeps line breaks (as \n), removes surrounding whitespace
export function normalizeAbout(value) {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').trim()
}

export function validateDisplayName(value) {
  const name = normalizeDisplayName(value)
  if (!name) return 'Display name is required.'
  if (characterCount(name) > DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`
  }
  return undefined
}

export function validateSkillLevel(value) {
  if (!value) return 'Choose your surf level.'
  if (!SKILL_LEVELS.includes(value)) return 'Choose Beginner, Intermediate or Advanced.'
  return undefined
}

// Optional: empty is fine, anything else must be a supported board type
export function validateBoardType(value) {
  if (!value) return undefined
  if (!BOARD_TYPES.includes(value)) return 'Choose a board type from the list.'
  return undefined
}

export function validateAbout(value) {
  if (characterCount(normalizeAbout(value)) > ABOUT_MAX_LENGTH) {
    return `About must be at most ${ABOUT_MAX_LENGTH} characters.`
  }
  return undefined
}

// 0-3 different favorite spots, all from the list loaded from the server
export function validateFavoriteSpotIds(ids, knownIds) {
  if (ids.length > FAVORITE_SPOTS_MAX) return FAVORITE_SPOTS_LIMIT_MESSAGE
  if (new Set(ids).size !== ids.length) return 'Each surf spot can only be added once.'
  if (ids.some((id) => !knownIds.has(id))) return 'Choose your favorite spots from the list.'
  return undefined
}

// The request body for PUT /api/v1/profile/me, built from valid form values.
// Only fields the API supports are sent (never avatarUrl or avatarPublicId);
// empty optional fields are sent as null.
export function buildProfilePayload(values) {
  return {
    displayName: normalizeDisplayName(values.displayName),
    skillLevel: values.skillLevel,
    boardType: values.boardType || null,
    about: normalizeAbout(values.about) || null,
    favoriteSpotIds: [...values.favoriteSpotIds],
  }
}
