import { describe, expect, test } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, requestBody, responses } from '../test/utils'

const REGISTER = 'POST /api/v1/auth/register'
const PASSWORD = 'correct horse battery'

function created(email = 'surfer@example.com') {
  return jsonResponse(201, { user: { id: 'u1', email, createdAt: '2026-10-28T12:00:00.000Z' } })
}

async function openRegister(routes = {}) {
  const fetchMock = mockApi({ 'GET /api/v1/auth/me': responses.signedOut, ...routes })
  renderApp('/register')
  await screen.findByRole('heading', { name: 'Create your account' })
  return fetchMock
}

async function fillForm(user, { email = 'surfer@example.com', password = PASSWORD, confirm = PASSWORD } = {}) {
  if (email) await user.type(screen.getByLabelText(/^email/i), email)
  if (password) await user.type(screen.getByLabelText(/^password/i), password)
  if (confirm) await user.type(screen.getByLabelText(/^confirm password/i), confirm)
}

const submit = (user) => user.click(screen.getByRole('button', { name: 'Create account' }))
const registerCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/register')

describe('Registration page', () => {
  test('shows the Figma register photo (decorative)', async () => {
    await openRegister()
    const photos = [...document.querySelectorAll('main img')]
    expect(photos).toHaveLength(1)
    expect(photos[0].getAttribute('src')).toMatch(/register-ocean/)
    expect(photos[0].getAttribute('alt')).toBe('')
  })

  test('successful registration shows a confirmation and a link to log in', async () => {
    const user = userEvent.setup()
    const fetchMock = await openRegister({ [REGISTER]: () => created() })

    await fillForm(user, { email: '  Surfer@Example.COM ' })
    await submit(user)

    expect(await screen.findByText('Your account has been created')).toBeTruthy()
    expect(screen.getByText('surfer@example.com')).toBeTruthy()
    // Email normalized like the backend; password sent exactly as typed
    expect(requestBody(fetchMock, REGISTER)).toEqual({ email: 'surfer@example.com', password: PASSWORD })
    // Not logged in automatically: the header still shows visitor actions
    const header = screen.getByRole('navigation', { name: 'Account' })
    expect(within(header).getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
  })

  test('the "Log in" button carries the new email to the login form', async () => {
    const user = userEvent.setup()
    await openRegister({ [REGISTER]: () => created() })
    await fillForm(user)
    await submit(user)
    const main = await screen.findByText('Your account has been created')
    expect(main).toBeTruthy()

    const loginButtons = screen.getAllByRole('link', { name: 'Log in' })
    await user.click(loginButtons[loginButtons.length - 1])
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getByLabelText(/^email/i).value).toBe('surfer@example.com')
  })

  test('missing fields: errors shown, nothing sent, focus on the first field', async () => {
    const user = userEvent.setup()
    const fetchMock = await openRegister()
    await submit(user)

    expect(screen.getByText('Email is required.')).toBeTruthy()
    expect(screen.getByText('Password is required.')).toBeTruthy()
    expect(screen.getByText('Please confirm your password.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/^email/i))
    expect(screen.getByLabelText(/^email/i).getAttribute('aria-invalid')).toBe('true')
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  test('invalid email', async () => {
    const user = userEvent.setup()
    const fetchMock = await openRegister()
    await fillForm(user, { email: 'not-an-email' })
    await submit(user)
    expect(screen.getByText('Enter a valid email address, like you@example.com.')).toBeTruthy()
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  test('password too short', async () => {
    const user = userEvent.setup()
    const fetchMock = await openRegister()
    await fillForm(user, { password: '1234567', confirm: '1234567' })
    await submit(user)
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy()
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  test('password over 72 UTF-8 bytes', async () => {
    const user = userEvent.setup()
    const fetchMock = await openRegister()
    const tooLong = '😀'.repeat(19) // 19 characters, 76 bytes
    await fillForm(user, { password: tooLong, confirm: tooLong })
    await submit(user)
    expect(screen.getByText(/Password is too long/)).toBeTruthy()
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  test('password confirmation mismatch', async () => {
    const user = userEvent.setup()
    const fetchMock = await openRegister()
    await fillForm(user, { confirm: `${PASSWORD}!` })
    await submit(user)
    expect(screen.getByText('Passwords don’t match.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/^confirm password/i))
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  test('errors appear after leaving a field and clear as it is corrected', async () => {
    const user = userEvent.setup()
    await openRegister()
    await user.type(screen.getByLabelText(/^email/i), 'surfer@')
    expect(screen.queryByText(/valid email/)).toBeNull()
    await user.tab()
    expect(screen.getByText('Enter a valid email address, like you@example.com.')).toBeTruthy()
    await user.type(screen.getByLabelText(/^email/i), 'example.com')
    expect(screen.queryByText(/valid email/)).toBeNull()
  })

  test('duplicate email (409) is shown on the email field', async () => {
    const user = userEvent.setup()
    await openRegister({
      [REGISTER]: () => jsonResponse(409, { status: 'error', message: 'An account with this email already exists.' }),
    })
    await fillForm(user)
    await submit(user)
    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy()
    expect(screen.getByLabelText(/^email/i).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText(/^email/i))
  })

  test('backend validation errors (400) are shown on their fields', async () => {
    const user = userEvent.setup()
    await openRegister({
      [REGISTER]: () =>
        jsonResponse(400, { status: 'error', message: 'Please check the registration details.', errors: { email: 'Email must be at most 254 characters.' } }),
    })
    await fillForm(user)
    await submit(user)
    expect(await screen.findByText('Email must be at most 254 characters.')).toBeTruthy()
  })

  test('network error shows a friendly alert and keeps the form', async () => {
    const user = userEvent.setup()
    await openRegister({ [REGISTER]: responses.networkError })
    await fillForm(user)
    await submit(user)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/couldn’t reach Sesh/)
    expect(screen.getByRole('button', { name: 'Create account' }).disabled).toBe(false)
  })

  test('server error (500) and unexpected responses show a generic alert', async () => {
    const user = userEvent.setup()
    await openRegister({ [REGISTER]: responses.serverError })
    await fillForm(user)
    await submit(user)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong on our side/)

    // Unexpected: a 201 that isn't JSON
    const fetchMock = mockApi({ [REGISTER]: () => new Response('<html></html>', { status: 201, headers: { 'Content-Type': 'text/html' } }) })
    await submit(user)
    await waitFor(() => expect(registerCalls(fetchMock)).toHaveLength(1))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong/)
    expect(screen.queryByText('Your account has been created')).toBeNull()
  })

  test('prevents duplicate submissions while a request is pending', async () => {
    const user = userEvent.setup()
    let finish
    const fetchMock = await openRegister({ [REGISTER]: () => new Promise((resolve) => (finish = resolve)) })
    await fillForm(user)

    const form = screen.getByRole('form', { name: 'Create account' })
    await submit(user)
    form.requestSubmit() // a second submit (e.g. pressing Enter again)
    await user.click(screen.getByRole('button', { name: /Creating account/ }))

    expect(registerCalls(fetchMock)).toHaveLength(1)
    const button = screen.getByRole('button', { name: /Creating account/ })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')

    finish(created())
    expect(await screen.findByText('Your account has been created')).toBeTruthy()
    expect(registerCalls(fetchMock)).toHaveLength(1)
  })
})
