import multer from 'multer';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const AVATAR_FIELD = 'avatar';

// Reads a multipart/form-data request with exactly one file in the "avatar"
// field. The file is kept in memory (at most 5 MB) and never written to
// disk; it is only forwarded to Cloudinary.
//
// Limits stop the upload as soon as they are exceeded: one file, no other
// form fields, at most 5 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 1 },
}).single(AVATAR_FIELD);

export function rejectAvatar(res, status, message) {
  return res.status(status).json({
    status: 'error',
    message: 'Please check the profile picture.',
    errors: { [AVATAR_FIELD]: message },
  });
}

export function parseAvatarUpload(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return rejectAvatar(res, 413, 'Profile picture must be at most 5 MB.');
    }
    // Wrong field name, several files, extra fields or a malformed body
    return rejectAvatar(res, 400, `Send one image file in the "${AVATAR_FIELD}" field.`);
  });
}
