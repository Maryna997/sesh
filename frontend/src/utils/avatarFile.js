// Checks a chosen profile photo before it is uploaded, for quick feedback.
// The backend checks the file again, by its actual contents.
import { getRequestErrorMessage } from '../api/errorMessages'

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AVATAR_ACCEPT = AVATAR_TYPES.join(',')
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

export function validateAvatarFile(file) {
  if (!file) return 'Choose an image to upload.'
  if (!AVATAR_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size > AVATAR_MAX_BYTES) return 'Choose an image of at most 5 MB.'
  return undefined
}

// A friendly message for a failed upload or removal (ApiError)
export function getAvatarErrorMessage(error) {
  if (error?.kind === 'http') {
    if (error.fieldErrors?.avatar) return error.fieldErrors.avatar
    if (error.status === 502 || error.status === 503) return error.message || 'We couldn’t upload your picture. Please try again.'
  }
  return getRequestErrorMessage(error)
}
