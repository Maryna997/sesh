// Cloudinary settings for profile pictures, read from the environment
// (backend/.env locally, the hosting dashboard in production).
//
// - All three variables set: uploads are enabled.
// - None set: uploads are disabled (the upload endpoint answers 503), so the
//   rest of the API still works on a machine without Cloudinary. In
//   production this is a startup error instead.
// - Only some set, or placeholder values: startup error, so a typo is noticed
//   immediately instead of at the first upload.
//
// The values are never logged or sent to clients. The API secret stays on
// the server: the browser never talks to Cloudinary's upload API directly.

const VARIABLES = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const PLACEHOLDER = /^(your[-_ ]|change[-_ ]?me|<|xxx)/i;

// Folder for every avatar, so Sesh only ever deletes images it uploaded itself
export const AVATAR_FOLDER = 'sesh/avatars';

export function loadCloudinaryConfig(env) {
  const values = Object.fromEntries(VARIABLES.map((name) => [name, (env[name] ?? '').trim()]));
  const missing = VARIABLES.filter((name) => !values[name]);

  if (missing.length === VARIABLES.length) {
    if (env.NODE_ENV === 'production') {
      throw new Error(`Cloudinary is not configured. Set ${VARIABLES.join(', ')} for profile picture uploads.`);
    }
    return { enabled: false };
  }

  if (missing.length > 0) {
    throw new Error(`Cloudinary is only partly configured. Missing: ${missing.join(', ')}.`);
  }

  const placeholders = VARIABLES.filter((name) => PLACEHOLDER.test(values[name]));
  if (placeholders.length > 0) {
    throw new Error(`Cloudinary settings still look like placeholders: ${placeholders.join(', ')}.`);
  }

  return {
    enabled: true,
    cloudName: values.CLOUDINARY_CLOUD_NAME,
    apiKey: values.CLOUDINARY_API_KEY,
    apiSecret: values.CLOUDINARY_API_SECRET,
  };
}

export const cloudinaryConfig = loadCloudinaryConfig(process.env);
