// Request validation for surfer profiles (PUT /api/v1/profile/me).
//
// Update rules (documented in docs-private/api.md):
// - Only the fields present in the body are changed; omitted fields keep
//   their current value.
// - Optional fields (boardType, about, favoriteSpotIds) are cleared with
//   null (or "" for text, [] for spots).
// - displayName and skillLevel can be changed but never cleared, and both
//   are required when the profile is created.
// - Unknown fields (e.g. userId or hasCompletedProfile) are ignored: the
//   owner always comes from the session, and completion is derived.
// - avatarUrl and avatarPublicId are rejected: only the backend sets them.

export const DISPLAY_NAME_MAX_LENGTH = 50;
export const ABOUT_MAX_LENGTH = 500;
export const FAVORITE_SPOTS_MAX = 3;
const SPOT_ID_MAX_LENGTH = 100;

// Stored values. The frontend shows them as labels ("Beginner", ...).
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];

// Same values as frontend/src/config/surfboards.js. Checked here rather than
// in the database, so adding a board type later needs no migration.
export const BOARD_TYPES = [
  'shortboard',
  'fish',
  'funboard',
  'mid-length',
  'longboard',
  'mini-malibu',
  'soft-top',
  'gun',
  'other',
];

// Control characters (null bytes, escape codes...) are never valid in text
// that other surfers will see.
const CONTROL_CHARACTER = /\p{Cc}/u;

// Counts characters the way users (and PostgreSQL) do: an emoji is one
const characterCount = (value) => [...value].length;

const isBlank = (value) => value === null || (typeof value === 'string' && value.trim() === '');

// "  Kai   Silva " -> "Kai Silva"
function normalizeDisplayName(value) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function validateDisplayName(value) {
  if (value === undefined || isBlank(value)) return { error: 'Display name is required.' };
  if (typeof value !== 'string') return { error: 'Display name must be text.' };

  const name = normalizeDisplayName(value);
  if (characterCount(name) > DISPLAY_NAME_MAX_LENGTH) {
    return { error: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.` };
  }
  if (CONTROL_CHARACTER.test(name)) return { error: 'Display name contains invalid characters.' };
  return { value: name };
}

function validateSkillLevel(value) {
  if (value === undefined || isBlank(value)) return { error: 'Skill level is required.' };
  if (!SKILL_LEVELS.includes(value)) {
    return { error: `Skill level must be one of: ${SKILL_LEVELS.join(', ')}.` };
  }
  return { value };
}

function validateBoardType(value) {
  if (isBlank(value)) return { value: null };
  if (!BOARD_TYPES.includes(value)) {
    return { error: `Board type must be one of: ${BOARD_TYPES.join(', ')}.` };
  }
  return { value };
}

function validateAbout(value) {
  if (isBlank(value)) return { value: null };
  if (typeof value !== 'string') return { error: 'About must be text.' };

  // Keep line breaks (as \n) but nothing else invisible
  const about = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (characterCount(about) > ABOUT_MAX_LENGTH) {
    return { error: `About must be at most ${ABOUT_MAX_LENGTH} characters.` };
  }
  if (CONTROL_CHARACTER.test(about.replace(/[\n\t]/g, ''))) {
    return { error: 'About contains invalid characters.' };
  }
  return { value: about };
}

// Checks the format only; whether the spots exist is checked against the
// database by the controller.
function validateFavoriteSpotIds(value) {
  if (value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'Favourite spots must be a list of surf spot ids.' };
  if (value.length > FAVORITE_SPOTS_MAX) {
    return { error: `Choose a maximum of ${FAVORITE_SPOTS_MAX} favorite spots.` };
  }
  if (!value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= SPOT_ID_MAX_LENGTH)) {
    return { error: 'Each favourite spot must be a surf spot id.' };
  }
  if (new Set(value).size !== value.length) {
    return { error: 'Each surf spot can only be added once.' };
  }
  return { value };
}

const FIELD_VALIDATORS = {
  displayName: validateDisplayName,
  skillLevel: validateSkillLevel,
  boardType: validateBoardType,
  about: validateAbout,
  favoriteSpotIds: validateFavoriteSpotIds,
};

// Checks the fields present in the body.
// Returns { errors } (field -> message) or { data } with only the provided
// fields, normalized and ready to save.
export function validateProfileInput(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'Request body must be a JSON object with profile fields.' } };
  }

  const errors = {};
  const data = {};

  for (const [field, validate] of Object.entries(FIELD_VALIDATORS)) {
    if (!Object.hasOwn(body, field)) continue;
    const result = validate(body[field]);
    if (result.error) errors[field] = result.error;
    else data[field] = result.value;
  }

  // Profile pictures will be uploaded to Cloudinary through a dedicated
  // endpoint (a later task), and only the backend sets the avatar fields.
  // Accepting arbitrary image URLs here would let profiles load content from
  // any server whenever someone views them. null or "" is simply ignored.
  for (const field of ['avatarUrl', 'avatarPublicId']) {
    if (Object.hasOwn(body, field) && !isBlank(body[field])) {
      errors[field] = 'Profile picture uploads are not available yet.';
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { data };
}

// When a profile is created, the two mandatory fields must be in the request.
// Returns errors for the missing ones, or null.
export function missingRequiredFields(data) {
  const errors = {};
  if (data.displayName === undefined) errors.displayName = 'Display name is required.';
  if (data.skillLevel === undefined) errors.skillLevel = 'Skill level is required.';
  return Object.keys(errors).length > 0 ? errors : null;
}

// A profile is complete when it exists and has a valid display name and
// skill level. The database constraints already guarantee this for stored
// rows; checking again keeps the rule in one place for every caller.
export function isProfileComplete(profile) {
  return Boolean(
    profile &&
      typeof profile.displayName === 'string' &&
      profile.displayName.trim() !== '' &&
      SKILL_LEVELS.includes(profile.skillLevel),
  );
}
