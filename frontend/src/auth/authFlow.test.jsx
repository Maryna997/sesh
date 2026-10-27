import { describe, expect, test } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, responses } from '../test/utils'

const ME = 'GET /api/v1/auth/me'
const LOGIN = 'POST /api/v1/auth/login'
const LOGOUT = 'POST /api/v1/auth/logout'
const location = () => screen.getByTestId('location').textContent

describe('session restoration', () => {
  test('a valid session restores the signed-in state on load', async () => {
    const fetchMock = mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/status')
    expect(await screen.findByRole('heading', { name: 'My Status' })).toBeTruthy()
    expect(location()).toBe('/status')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  })

  test('while checking, protected pages show a loading message (no redirect, no flicker)', async () => {
    let answer
    mockApi({ [ME]: () => new Promise((resolve) => (answer = resolve)) })
    renderApp('/discover')

    expect(screen.getByRole('status').textContent).toMatch(/Checking your session/)
    expect(location()).toBe('/discover')
    expect(screen.queryByRole('heading', { name: 'Discover' })).toBeNull()
    // Neither visitor actions nor app navigation are shown yet
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()

    answer(responses.signedIn())
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
  })

  test('a network failure is not treated as logged out', async () => {
    const user = userEvent.setup()
    let failNext = true
    const fetchMock = mockApi({
      [ME]: () => {
        if (failNext) {
          failNext = false
          throw new TypeError('Failed to fetch')
        }
        return responses.signedIn()
      },
    })
    renderApp('/messages')

    expect(await screen.findByText('We couldn’t check your session')).toBeTruthy()
    expect(location()).toBe('/messages') // not redirected to /login

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('a server error during the check is also shown as a failed check', async () => {
    mockApi({ [ME]: responses.serverError })
    renderApp('/profile')
    expect(await screen.findByText('We couldn’t check your session')).toBeTruthy()
    expect(location()).toBe('/profile')
  })
})

describe('protected and public routes', () => {
  test.each(['/discover', '/status', '/messages', '/profile', '/settings'])('%s redirects visitors to login', async (path) => {
    mockApi({ [ME]: responses.signedOut })
    renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(location()).toBe(`/login?returnTo=${encodeURIComponent(path)}`)
  })

  test('full flow: protected page -> login -> back to that page', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: responses.signedOut, [LOGIN]: () => responses.signedIn() })
    renderApp('/settings')
    await screen.findByRole('heading', { name: 'Welcome back' })

    await user.type(screen.getByLabelText(/^email/i), 'surfer@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: 'Settings & Privacy' })).toBeTruthy()
    expect(location()).toBe('/settings')
  })

  test.each(['/', '/login', '/register'])('%s is public', async (path) => {
    mockApi({ [ME]: responses.signedOut })
    renderApp(path)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(location()).toBe(path)
  })

  test.each([
    ['/login', '/discover'],
    ['/register', '/discover'],
    ['/login?returnTo=%2Fmessages', '/messages'],
    ['/login?returnTo=%2F%2Fevil.example', '/discover'],
  ])('signed-in users visiting %s are sent to %s', async (path, expected) => {
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp(path)
    await waitFor(() => expect(location()).toBe(expected))
  })

  test('the landing page stays available to signed-in users', async () => {
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeTruthy()
    expect(location()).toBe('/')
  })
})

describe('logout', () => {
  test('ends the session on the server, then goes home as a visitor', async () => {
    const user = userEvent.setup()
    const fetchMock = mockApi({
      [ME]: () => responses.signedIn(),
      [LOGOUT]: () => jsonResponse(200, { status: 'ok', message: 'Logged out.' }),
    })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Discover' })

    await user.click(screen.getByRole('button', { name: 'My profile' }))
    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeTruthy()
    expect(location()).toBe('/')
    const logoutCall = fetchMock.mock.calls.find(([url]) => url === '/api/v1/auth/logout')
    expect(logoutCall[1]).toMatchObject({ method: 'POST', credentials: 'include' })
    // Visitor header again
    const header = screen.getByRole('navigation', { name: 'Account' })
    expect(within(header).getByRole('link', { name: 'Create account' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  test('after logout the user is really signed out (login page is reachable again)', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn(), [LOGOUT]: () => jsonResponse(200, { status: 'ok', message: 'Logged out.' }) })
    renderApp('/messages')
    await screen.findByRole('heading', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'My profile' }))
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByRole('heading', { name: 'Find your people. Catch more waves.' })

    // Signed-in users would be redirected away from /login
    const header = screen.getByRole('navigation', { name: 'Account' })
    await user.click(within(header).getByRole('link', { name: 'Log in' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(location()).toBe('/login')
  })

  test('a failed logout keeps the user signed in and explains why', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn(), [LOGOUT]: responses.networkError })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Discover' })

    await user.click(screen.getByRole('button', { name: 'My profile' }))
    await user.click(screen.getByRole('button', { name: 'Log out' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Logout failed/)
    expect(location()).toBe('/discover')
    expect(screen.getByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull()
    expect(within(alert.parentElement).getByRole('button', { name: 'Log out' })).toBeTruthy()
  })
})
