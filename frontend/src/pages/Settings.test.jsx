// Settings & Privacy: overview, Email Address, Password, Delete Account
// (mocked API; no backend or database involved).
import { describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEST_USER, jsonResponse, renderApp, responses } from '../test/utils'

const NEW_EMAIL = 'new.surfer@example.com'

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}
const error = (status, body = {}) => jsonResponse(status, { status: 'error', message: 'Error.', ...body })

// Fake backend; `me` follows the account (email changes, deletion)
function mockBackend({ email, password, remove, me } = {}) {
  const account = { user: { ...TEST_USER }, deleted: false }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const key = `${options.method ?? 'GET'} ${url}`
    const body = options.body ? JSON.parse(options.body) : undefined
    if (key === 'GET /api/v1/auth/me') {
      if (me) return me()
      return account.deleted ? responses.signedOut() : responses.signedIn(account.user)
    }
    if (key === 'PUT /api/v1/account/email') {
      const response = await (email ?? ((b) => jsonResponse(200, { user: { ...account.user, email: b.newEmail.trim().toLowerCase() } })))(body)
      if (response.ok) account.user = (await response.clone().json()).user
      return response
    }
    if (key === 'PUT /api/v1/account/password') return (password ?? (() => jsonResponse(200, { status: 'ok', message: 'Password updated.' })))(body)
    if (key === 'DELETE /api/v1/account') {
      const response = await (remove ?? (() => jsonResponse(200, { status: 'ok', message: 'Account deleted.' })))(body)
      if (response.ok) account.deleted = true
      return response
    }
    if (key === 'GET /api/v1/discover') return jsonResponse(200, { surfers: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
    if (key === 'GET /api/v1/surf-spots') return jsonResponse(200, { spots: [] })
    throw new Error(`Unexpected request in test: ${key}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const calls = (fetchMock, key) => fetchMock.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === key)
const bodyOf = (call) => JSON.parse(call[1].body)
const location = () => screen.getByTestId('location').textContent
// Required fields' labels end with a visual * (hidden from screen readers)
const field = (label) => screen.getByLabelText(new RegExp(`^${label}\\*?$`), { selector: 'input' })

async function open(path, backend) {
  const fetchMock = mockBackend(backend)
  renderApp(path)
  await screen.findByRole('heading', { level: 1 })
  return fetchMock
}

// ---------- Overview and navigation ----------

describe('Settings & Privacy', () => {
  test('lists the three account screens; each opens and its back arrow returns to Settings', async () => {
    const user = userEvent.setup()
    await open('/settings')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings & Privacy' })).toBeTruthy()
    expect(screen.getByText('Keep your account details up to date and secure.')).toBeTruthy()
    expect(screen.queryByText('Control your account and who can see you.')).toBeNull()
    const list = screen.getByRole('list', { name: 'Account settings' })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/settings/email', '/settings/password', '/settings/delete-account'])
    expect(links.every((link) => link.querySelectorAll('a, button').length === 0)).toBe(true)

    for (const [name, heading] of [
      [/Email Address/, 'Email Address'],
      [/Password/, 'Password'],
      [/Delete Account/, 'Delete Account'],
    ]) {
      await user.click(within(screen.getByRole('list', { name: 'Account settings' })).getByRole('link', { name }))
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy()
      const back = screen.getByRole('link', { name: 'Back to Settings' })
      expect(back.getAttribute('href')).toBe('/settings')
      await user.click(back)
      expect(await screen.findByRole('heading', { level: 1, name: 'Settings & Privacy' })).toBeTruthy()
    }
  })

  test.each(['/settings/email', '/settings/password', '/settings/delete-account'])('%s is protected: visitors go to log in', async (path) => {
    mockBackend({ me: responses.signedOut })
    renderApp(path)
    await waitFor(() => expect(location()).toBe(`/login?returnTo=${encodeURIComponent(path)}`))
  })

  test('without a profile: sent to Create Profile', async () => {
    mockBackend({ me: () => responses.signedIn(TEST_USER, { hasCompletedProfile: false }) })
    renderApp('/settings/password')
    await waitFor(() => expect(location()).toBe('/create-profile'))
  })
})

// ---------- Email ----------

describe('Email Address', () => {
  test('current email prefilled and read-only; no password field, no verification note', async () => {
    await open('/settings/email')
    expect(screen.getByText('Change the email used to sign in.')).toBeTruthy()
    const current = field('Current email')
    expect(current.value).toBe(TEST_USER.email)
    expect(current.readOnly).toBe(true)
    const next = field('New email address')
    expect(next.getAttribute('type')).toBe('email')
    expect(next.getAttribute('autocomplete')).toBe('email')
    expect(next.getAttribute('placeholder')).toBe('Enter new email address')
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByText(/verification/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Update email' })).toBeTruthy()
  })

  test('invalid, empty and unchanged emails are caught before sending', async () => {
    const user = userEvent.setup()
    const fetchMock = await open('/settings/email')
    await user.click(screen.getByRole('button', { name: 'Update email' }))
    expect(screen.getByText('Email is required.')).toBeTruthy()
    expect(document.activeElement).toBe(field('New email address'))

    await user.type(field('New email address'), 'not-an-email')
    expect(screen.getByText('Enter a valid email address, like you@example.com.')).toBeTruthy()
    await user.clear(field('New email address'))
    await user.type(field('New email address'), TEST_USER.email.toUpperCase())
    expect(screen.getByText('This is already your email address.')).toBeTruthy()
    await user.keyboard('{Enter}')
    expect(calls(fetchMock, 'PUT /api/v1/account/email')).toHaveLength(0)
  })

  test('updates the email: request, success message, new current email, still signed in', async () => {
    const user = userEvent.setup()
    const fetchMock = await open('/settings/email')
    await user.type(field('New email address'), `  ${NEW_EMAIL.toUpperCase()}{Enter}`)

    expect(await screen.findByText(`Your email is now ${NEW_EMAIL}. Use it the next time you log in.`)).toBeTruthy()
    const [request] = calls(fetchMock, 'PUT /api/v1/account/email')
    expect(request[1]).toMatchObject({ method: 'PUT', credentials: 'include' })
    // As typed (an email input drops the spaces itself); the server lowercases it; no user id
    expect(bodyOf(request)).toEqual({ newEmail: NEW_EMAIL.toUpperCase() })
    await waitFor(() => expect(field('Current email').value).toBe(NEW_EMAIL))
    expect(field('New email address').value).toBe('')
    expect(location()).toBe('/settings/email')
  })

  test('email used by another account (409): field error, the input is kept', async () => {
    const user = userEvent.setup()
    await open('/settings/email', { email: () => error(409, { errors: { newEmail: 'An account with this email already exists.' } }) })
    await user.type(field('New email address'), `${NEW_EMAIL}{Enter}`)
    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy()
    expect(field('New email address').value).toBe(NEW_EMAIL)
    expect(field('New email address').getAttribute('aria-invalid')).toBe('true')
  })

  test('while saving: busy and one request only; network failure keeps the input and explains', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    const fetchMock = await open('/settings/email', { email: () => answer.promise.then(responses.networkError) })
    await user.type(field('New email address'), NEW_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Update email' }))
    await user.keyboard('{Enter}')
    expect(calls(fetchMock, 'PUT /api/v1/account/email')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Update email/ }).disabled).toBe(true)

    answer.resolve()
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t reach Sesh')
    expect(field('New email address').value).toBe(NEW_EMAIL)
  })

  test('expired session (401): sent to log in', async () => {
    const user = userEvent.setup()
    let signedIn = true
    await open('/settings/email', {
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      email: () => {
        signedIn = false
        return error(401)
      },
    })
    await user.type(field('New email address'), `${NEW_EMAIL}{Enter}`)
    await waitFor(() => expect(location()).toBe(`/login?returnTo=${encodeURIComponent('/settings/email')}`))
  })
})

// ---------- Password ----------

describe('Password', () => {
  const fill = async (user, current, next, confirm) => {
    if (current) await user.type(field('Current password'), current)
    if (next) await user.type(field('New password'), next)
    if (confirm) await user.type(field('Confirm new password'), confirm)
  }

  test('three password fields with the right autocomplete; no “sign in again” note', async () => {
    await open('/settings/password')
    expect(screen.getByText('Update your password securely.')).toBeTruthy()
    expect(field('Current password').getAttribute('autocomplete')).toBe('current-password')
    expect(field('Current password').getAttribute('placeholder')).toBe('Enter current password')
    expect(field('New password').getAttribute('autocomplete')).toBe('new-password')
    expect(field('New password').getAttribute('placeholder')).toBe('Enter new password')
    expect(field('Confirm new password').getAttribute('autocomplete')).toBe('new-password')
    expect(field('Confirm new password').getAttribute('placeholder')).toBe('Confirm new password')
    expect(['Current password', 'New password', 'Confirm new password'].every((label) => field(label).type === 'password')).toBe(true)
    expect(screen.queryByText(/sign in again/i)).toBeNull()
  })

  test('client checks: required fields, rules, same password, confirmation mismatch; nothing is sent', async () => {
    const user = userEvent.setup()
    const fetchMock = await open('/settings/password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(screen.getByText('Enter your current password.')).toBeTruthy()
    expect(screen.getByText('Password is required.')).toBeTruthy()
    expect(screen.getByText('Please confirm your new password.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Current password'))

    await fill(user, 'old password 1', 'short', 'shorter')
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy()
    await user.clear(field('New password'))
    await user.type(field('New password'), 'old password 1')
    expect(screen.getByText('Choose a password different from your current one.')).toBeTruthy()
    await user.clear(field('New password'))
    await user.type(field('New password'), 'brand new password')
    expect(screen.getByText('Passwords don’t match.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(calls(fetchMock, 'PUT /api/v1/account/password')).toHaveLength(0)
  })

  test('success: request body, fields cleared, success message, still signed in on this page', async () => {
    const user = userEvent.setup()
    const fetchMock = await open('/settings/password')
    await fill(user, 'old password 1', 'brand new password', 'brand new password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Password updated')).toBeTruthy()
    const [request] = calls(fetchMock, 'PUT /api/v1/account/password')
    expect(request[1]).toMatchObject({ method: 'PUT', credentials: 'include' })
    expect(bodyOf(request)).toEqual({ currentPassword: 'old password 1', newPassword: 'brand new password' }) // no confirmation, no user id
    expect(['Current password', 'New password', 'Confirm new password'].map((label) => field(label).value)).toEqual(['', '', ''])
    expect(location()).toBe('/settings/password')
    expect(screen.getByRole('heading', { level: 1, name: 'Password' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My profile' })).toBeTruthy() // signed-in header
    expect(calls(fetchMock, 'POST /api/v1/auth/logout')).toHaveLength(0)
  })

  test('wrong current password (400): shown on that field, not as a signed-out session', async () => {
    const user = userEvent.setup()
    const fetchMock = await open('/settings/password', {
      password: () => error(400, { errors: { currentPassword: 'Your current password is incorrect.' } }),
    })
    await fill(user, 'not my password', 'brand new password', 'brand new password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Your current password is incorrect.')).toBeTruthy()
    expect(document.activeElement).toBe(field('Current password'))
    expect(field('New password').value).toBe('brand new password')
    expect(calls(fetchMock, 'GET /api/v1/auth/me')).toHaveLength(1) // no session re-check
  })

  test('while saving: one request only', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    const fetchMock = await open('/settings/password', { password: () => answer.promise })
    await fill(user, 'old password 1', 'brand new password', 'brand new password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await user.keyboard('{Enter}')
    expect(calls(fetchMock, 'PUT /api/v1/account/password')).toHaveLength(1)
    answer.resolve(jsonResponse(200, { status: 'ok', message: 'Password updated.' }))
    expect(await screen.findByText('Password updated')).toBeTruthy()
  })

  test('server error: friendly message, the typed passwords stay for another try', async () => {
    const user = userEvent.setup()
    await open('/settings/password', { password: () => error(500) })
    await fill(user, 'old password 1', 'brand new password', 'brand new password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong on our side')
    expect(field('Current password').value).toBe('old password 1')
  })
})

// ---------- Delete account ----------

describe('Delete Account', () => {
  const deleteButton = () => screen.getByRole('button', { name: /Permanently delete account/ })

  test('texts, warning and the confirmation field; the button is disabled until exactly DELETE', async () => {
    const user = userEvent.setup()
    await open('/settings/delete-account')
    expect(screen.getByRole('heading', { level: 2, name: 'Delete your Sesh account?' })).toBeTruthy()
    expect(screen.getByText('This action permanently removes your account and profile and cannot be undone.')).toBeTruthy()
    expect(screen.getByText('Your messages and profile data will be deleted.')).toBeTruthy()
    expect(document.querySelector('input[type="password"]')).toBeNull()
    expect(deleteButton().disabled).toBe(true)
    expect(deleteButton().className).toContain('bg-danger')

    for (const text of ['delete', 'DELET', ' DELETE', 'DELETE ', 'DELETED']) {
      await user.clear(field('Type DELETE to confirm'))
      await user.type(field('Type DELETE to confirm'), text)
      expect(deleteButton().disabled, text).toBe(true)
    }
    await user.clear(field('Type DELETE to confirm'))
    await user.type(field('Type DELETE to confirm'), 'DELETE')
    expect(deleteButton().disabled).toBe(false)
    expect(field('Type DELETE to confirm').getAttribute('aria-describedby')).toBeTruthy() // the warning
  })

  test('Cancel and go back: returns to Settings without any request', async () => {
    const user = userEvent.setup()
    const fetchMock = await open('/settings/delete-account')
    await user.type(field('Type DELETE to confirm'), 'DELETE')
    await user.click(screen.getByRole('link', { name: 'Cancel and go back' }))
    expect(location()).toBe('/settings')
    expect(calls(fetchMock, 'DELETE /api/v1/account')).toHaveLength(0)
  })

  test('deleting (keyboard): one request with the confirmation, then signed out on the home page; protected pages closed', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    const fetchMock = await open('/settings/delete-account', { remove: () => answer.promise })
    await user.type(field('Type DELETE to confirm'), 'DELETE')
    await user.tab()
    expect(document.activeElement).toBe(deleteButton())
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')
    expect(calls(fetchMock, 'DELETE /api/v1/account')).toHaveLength(1)
    expect(deleteButton().disabled).toBe(true)
    expect(location()).toBe('/settings/delete-account') // nothing happens before the server confirms

    answer.resolve(jsonResponse(200, { status: 'ok', message: 'Account deleted.' }))
    await waitFor(() => expect(location()).toBe('/'))
    const [request] = calls(fetchMock, 'DELETE /api/v1/account')
    expect(request[1]).toMatchObject({ method: 'DELETE', credentials: 'include' })
    expect(bodyOf(request)).toEqual({ confirmation: 'DELETE' })
    expect(await screen.findByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'My profile' })).toBeNull() // visitor header
  })

  test('a server refusal (Cloudinary failure, 502): its explanation, the account stays, trying again works', async () => {
    const user = userEvent.setup()
    let fail = true
    await open('/settings/delete-account', {
      remove: () =>
        fail
          ? error(502, { message: 'We couldn’t remove your profile picture, so your account wasn’t deleted. Please try again.' })
          : jsonResponse(200, { status: 'ok', message: 'Account deleted.' }),
    })
    await user.type(field('Type DELETE to confirm'), 'DELETE')
    await user.click(deleteButton())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Your account wasn’t deleted')
    expect(alert.textContent).toContain('profile picture')
    expect(location()).toBe('/settings/delete-account')
    expect(deleteButton().disabled).toBe(false)

    fail = false
    await user.click(deleteButton())
    await waitFor(() => expect(location()).toBe('/'))
  })

  test('network failure: friendly message, still signed in', async () => {
    const user = userEvent.setup()
    await open('/settings/delete-account', { remove: responses.networkError })
    await user.type(field('Type DELETE to confirm'), 'DELETE')
    await user.click(deleteButton())
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t reach Sesh')
    expect(screen.getByRole('button', { name: 'My profile' })).toBeTruthy()
  })

  test('expired session (401): sent to log in', async () => {
    const user = userEvent.setup()
    let signedIn = true
    await open('/settings/delete-account', {
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      remove: () => {
        signedIn = false
        return error(401)
      },
    })
    await user.type(field('Type DELETE to confirm'), 'DELETE')
    await user.click(deleteButton())
    await waitFor(() => expect(location()).toBe(`/login?returnTo=${encodeURIComponent('/settings/delete-account')}`))
  })
})
