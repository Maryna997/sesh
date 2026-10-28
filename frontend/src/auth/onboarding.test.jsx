import { describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { jsonResponse, mockApi, renderApp, responses } from '../test/utils'

const ME = 'GET /api/v1/auth/me'
const MY_PROFILE = 'GET /api/v1/profile/me'
const SPOTS = 'GET /api/v1/surf-spots'
const CREATE_PROFILE_HEADING = 'Tell us about your surfing'
const location = () => screen.getByTestId('location').textContent

// A signed-in user without a surfer profile, as GET /auth/me reports it
const withoutProfile = () => responses.signedIn(undefined, { hasCompletedProfile: false })

// What the Create Profile page loads
const onboardingRoutes = {
  [MY_PROFILE]: () => jsonResponse(200, { profile: null }),
  [SPOTS]: () => jsonResponse(200, { spots: [] }),
}

describe('onboarding routes', () => {
  test('visitors cannot open Create Profile (sent to login, then back)', async () => {
    mockApi({ [ME]: responses.signedOut })
    renderApp('/create-profile')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(location()).toBe('/login?returnTo=%2Fcreate-profile')
    expect(screen.queryByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeNull()
  })

  test.each(['/discover', '/status', '/messages', '/profile', '/settings'])(
    'signed-in users without a profile are sent from %s to Create Profile',
    async (path) => {
      mockApi({ [ME]: withoutProfile, ...onboardingRoutes })
      renderApp(path)
      expect(await screen.findByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeTruthy()
      expect(location()).toBe('/create-profile')
    },
  )

  test('signed-in users without a profile can open Create Profile directly', async () => {
    mockApi({ [ME]: withoutProfile, ...onboardingRoutes })
    renderApp('/create-profile')
    expect(await screen.findByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeTruthy()
    expect(location()).toBe('/create-profile')
  })

  test.each(['/discover', '/status', '/messages', '/profile', '/settings'])(
    'users with a profile can open %s',
    async (path) => {
      mockApi({ [ME]: () => responses.signedIn() })
      renderApp(path)
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
      expect(location()).toBe(path)
    },
  )

  test('users with a profile are not taken through onboarding again', async () => {
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/create-profile')
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(location()).toBe('/discover')
  })

  test('signed-in users without a profile visiting /login go to Create Profile', async () => {
    mockApi({ [ME]: withoutProfile, ...onboardingRoutes })
    renderApp('/login?returnTo=%2Fmessages')
    expect(await screen.findByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeTruthy()
    expect(location()).toBe('/create-profile')
  })

  test('public pages stay available to users without a profile', async () => {
    mockApi({ [ME]: withoutProfile })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeTruthy()
    expect(location()).toBe('/')
  })

  test('a reload decides from GET /auth/me every time (no browser storage)', async () => {
    const storageBefore = { local: localStorage.length, session: sessionStorage.length }

    const first = mockApi({ [ME]: withoutProfile, ...onboardingRoutes })
    const view = renderApp('/messages')
    await screen.findByRole('heading', { name: CREATE_PROFILE_HEADING })
    expect(first.mock.calls.filter(([url]) => url === '/api/v1/auth/me')).toHaveLength(1)
    view.unmount()

    // "Reload" after the profile was created: the server now says complete
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/messages')
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeTruthy()
    expect(location()).toBe('/messages')

    expect({ local: localStorage.length, session: sessionStorage.length }).toEqual(storageBefore)
  })

  test('while the session is checked, neither the page nor the form is shown', async () => {
    let answer
    mockApi({ [ME]: () => new Promise((resolve) => (answer = resolve)), ...onboardingRoutes })
    renderApp('/discover')

    expect(screen.getByRole('status').textContent).toMatch(/Checking your session/)
    expect(screen.queryByRole('heading', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeNull()
    expect(location()).toBe('/discover')

    answer(withoutProfile())
    expect(await screen.findByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Discover' })).toBeNull()
  })

  test('Create Profile also waits for the session check', async () => {
    let answer
    mockApi({ [ME]: () => new Promise((resolve) => (answer = resolve)), ...onboardingRoutes })
    renderApp('/create-profile')
    expect(screen.getByRole('status').textContent).toMatch(/Checking your session/)
    expect(screen.queryByRole('heading', { name: CREATE_PROFILE_HEADING })).toBeNull()
    answer(responses.signedIn())
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
  })

  test('a failed session check shows "try again", not a redirect', async () => {
    mockApi({ [ME]: responses.networkError })
    renderApp('/create-profile')
    expect(await screen.findByText('We couldn’t check your session')).toBeTruthy()
    expect(location()).toBe('/create-profile')
  })

  test('no redirect loop: each user settles on one page with one session check', async () => {
    const fetchMock = mockApi({ [ME]: withoutProfile, ...onboardingRoutes })
    renderApp('/discover')
    await screen.findByRole('heading', { name: CREATE_PROFILE_HEADING })
    // Give any further redirects a chance to happen
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(location()).toBe('/create-profile')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/me')).toHaveLength(1)
  })

  test('if the profile already exists (e.g. another tab), Create Profile moves on to Discover', async () => {
    let meCalls = 0
    mockApi({
      // First check: no profile yet; the refresh after loading the profile: complete
      [ME]: () => (++meCalls === 1 ? withoutProfile() : responses.signedIn()),
      [MY_PROFILE]: () => jsonResponse(200, { profile: { userId: 'x', displayName: 'Kai', skillLevel: 'beginner' } }),
      [SPOTS]: () => jsonResponse(200, { spots: [] }),
    })
    renderApp('/create-profile')
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(location()).toBe('/discover')
  })
})
