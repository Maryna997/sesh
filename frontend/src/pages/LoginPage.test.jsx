import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, requestBody, responses, TEST_USER } from '../test/utils'

const LOGIN = 'POST /api/v1/auth/login'
const PASSWORD = 'correct horse battery'

async function openLogin(path = '/login', routes = {}) {
  const fetchMock = mockApi({ 'GET /api/v1/auth/me': responses.signedOut, ...routes })
  renderApp(path)
  await screen.findByRole('heading', { name: 'Welcome back' })
  return fetchMock
}

async function logInWith(user, email = TEST_USER.email, password = PASSWORD) {
  if (email) await user.type(screen.getByLabelText(/^email/i), email)
  if (password) await user.type(screen.getByLabelText(/^password/i), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

const location = () => screen.getByTestId('location').textContent
const loginCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/login')

describe('Login page', () => {
  test('successful login updates the header and goes to /discover', async () => {
    const user = userEvent.setup()
    const fetchMock = await openLogin('/login', { [LOGIN]: () => responses.signedIn() })

    await logInWith(user, '  Surfer@Example.COM ')

    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(location()).toBe('/discover')
    expect(requestBody(fetchMock, LOGIN)).toEqual({ email: 'surfer@example.com', password: PASSWORD })
    // Request carries the cookie; no token is ever handled by the page
    expect(fetchMock.mock.calls.find(([url]) => url === '/api/v1/auth/login')[1].credentials).toBe('include')
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull()
  })

  test('returns to the originally requested page after login', async () => {
    const user = userEvent.setup()
    await openLogin('/login?returnTo=%2Fmessages', { [LOGIN]: () => responses.signedIn() })
    await logInWith(user)
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeTruthy()
    expect(location()).toBe('/messages')
  })

  test('ignores an unsafe returnTo and goes to /discover', async () => {
    const user = userEvent.setup()
    await openLogin('/login?returnTo=https%3A%2F%2Fevil.example', { [LOGIN]: () => responses.signedIn() })
    await logInWith(user)
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(location()).toBe('/discover')
  })

  test('invalid credentials show one generic message', async () => {
    const user = userEvent.setup()
    await openLogin('/login', {
      [LOGIN]: () => jsonResponse(401, { status: 'error', message: 'Incorrect email or password.' }),
    })
    await logInWith(user)
    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect email or password.')
    expect(location()).toBe('/login')
    expect(screen.queryByText(/no account|not registered|wrong password/i)).toBeNull()
  })

  test('missing fields: errors shown and nothing sent', async () => {
    const user = userEvent.setup()
    const fetchMock = await openLogin()
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Email is required.')).toBeTruthy()
    expect(screen.getByText('Password is required.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/^email/i))
    expect(loginCalls(fetchMock)).toHaveLength(0)
  })

  test('login does not reveal password length rules', async () => {
    const user = userEvent.setup()
    const fetchMock = await openLogin('/login', {
      [LOGIN]: () => jsonResponse(401, { status: 'error', message: 'Incorrect email or password.' }),
    })
    await logInWith(user, TEST_USER.email, 'short')
    expect(loginCalls(fetchMock)).toHaveLength(1)
    expect(screen.queryByText(/at least 8/)).toBeNull()
  })

  test('network error', async () => {
    const user = userEvent.setup()
    await openLogin('/login', { [LOGIN]: responses.networkError })
    await logInWith(user)
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
    expect(location()).toBe('/login')
  })

  test('server error', async () => {
    const user = userEvent.setup()
    await openLogin('/login', { [LOGIN]: responses.serverError })
    await logInWith(user)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong on our side/)
  })

  test('prevents duplicate submissions', async () => {
    const user = userEvent.setup()
    let finish
    const fetchMock = await openLogin('/login', { [LOGIN]: () => new Promise((resolve) => (finish = resolve)) })
    await logInWith(user)
    screen.getByRole('form', { name: 'Log in' }).requestSubmit()
    expect(loginCalls(fetchMock)).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Logging in/ }).disabled).toBe(true)
    finish(responses.signedIn())
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
  })

  test('the back arrow returns to the home page', async () => {
    const user = userEvent.setup()
    await openLogin()
    await user.click(screen.getByRole('link', { name: 'Back to home page' }))
    expect(await screen.findByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeTruthy()
    expect(location()).toBe('/')
  })

  test('the password field has a show/hide toggle', async () => {
    const user = userEvent.setup()
    await openLogin()
    const field = screen.getByLabelText(/^password/i)
    expect(field.type).toBe('password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field.type).toBe('text')
  })
})
