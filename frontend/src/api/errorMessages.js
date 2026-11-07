// Turns an ApiError into a short, friendly message for a form.
// Specific cases (401 on login, 409 on register) are handled by the forms
// themselves; this covers everything else.
export const NETWORK_ERROR_MESSAGE = 'We couldn’t reach Sesh. Check your connection and try again.'
export const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again in a moment.'
export const SESSION_ENDED_MESSAGE = 'Your session has ended. Please log in again.'
export const PROFILE_REQUIRED_MESSAGE = 'Finish your surfer profile to continue.'

// For pages that load data behind the sign-in and profile guards (Discover,
// surfer profiles). A 401 (session ended) or 403 PROFILE_REQUIRED means the
// signed-in state is out of date: `recheckSession` tells the caller to
// refresh it, so the route guards can send the user to log in or to Create
// Profile. Returns { message, recheckSession }.
export function describeProtectedRequestError(error) {
  const status = error?.kind === 'http' ? error.status : null
  if (status === 401) return { message: SESSION_ENDED_MESSAGE, recheckSession: true }
  if (status === 403 && error.code === 'PROFILE_REQUIRED') return { message: PROFILE_REQUIRED_MESSAGE, recheckSession: true }
  return { message: getRequestErrorMessage(error), recheckSession: false }
}

export function getRequestErrorMessage(error) {
  if (error?.kind === 'network') return NETWORK_ERROR_MESSAGE

  if (error?.kind === 'http' && error.status === 403) {
    return 'This request was blocked for security reasons. Please reload the page and try again.'
  }

  return SERVER_ERROR_MESSAGE
}
