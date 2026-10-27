// Turns an ApiError into a short, friendly message for a form.
// Specific cases (401 on login, 409 on register) are handled by the forms
// themselves; this covers everything else.
export const NETWORK_ERROR_MESSAGE = 'We couldn’t reach Sesh. Check your connection and try again.'
export const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again in a moment.'

export function getRequestErrorMessage(error) {
  if (error?.kind === 'network') return NETWORK_ERROR_MESSAGE

  if (error?.kind === 'http' && error.status === 403) {
    return 'This request was blocked for security reasons. Please reload the page and try again.'
  }

  return SERVER_ERROR_MESSAGE
}
