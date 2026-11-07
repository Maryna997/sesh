// Public surfer profile tests (mocked API).
// The device time zone is New York for this file, so arrival times must come
// from Lisbon time, not the device.
process.env.TZ = 'America/New_York'

import { describe, expect, test, vi } from 'vitest'
import { renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, renderApp, responses } from '../test/utils'
import AuthProvider from '../auth/AuthProvider'
import { usePublicProfile } from '../hooks/usePublicProfile'

const MARIANA_ID = '7f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const LUCAS_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const spot = (id, name, area) => ({ id, name, kind: 'beach', area, municipality: area, region: 'Lisbon', country: 'Portugal' })
const CARCAVELOS = spot('pt-cascais-carcavelos', 'Praia de Carcavelos', 'Carcavelos')
const GUINCHO = spot('pt-cascais-guincho', 'Praia do Guincho', 'Cascais')
const SUPERTUBOS = spot('pt-peniche-supertubos', 'Supertubos', 'Peniche')
const cardSpot = ({ id, name, area }) => ({ id, name, area })

const AVAILABILITY = {
  activeWithSpot: { status: 'ACTIVE', spot: cardSpot(CARCAVELOS), arrival: null },
  activeNoSpot: { status: 'ACTIVE', spot: null, arrival: null },
  relative: { status: 'COMING_SOON', spot: cardSpot(GUINCHO), arrival: { type: 'relative', arrivesAt: '2026-07-15T16:00:00.000Z' } },
  window: {
    status: 'COMING_SOON',
    spot: cardSpot(GUINCHO),
    arrival: { type: 'window', startsAt: '2026-07-15T15:00:00.000Z', endsAt: '2026-07-15T17:00:00.000Z' },
  },
  atSpot: { status: 'AT_SPOT', spot: cardSpot(GUINCHO), arrival: null },
}

const profile = (fields = {}) => ({
  userId: MARIANA_ID,
  displayName: 'Mariana Silva',
  skillLevel: 'intermediate',
  boardType: 'shortboard',
  about: 'Easygoing shortboarder.\nAlways up for a fun session.',
  avatarUrl: 'https://res.cloudinary.com/demo/mariana.jpg',
  favoriteSpots: [CARCAVELOS, SUPERTUBOS],
  availability: AVAILABILITY.activeWithSpot,
  ...fields,
})
const EMPTY_PROFILE = profile({ boardType: null, about: null, favoriteSpots: [], avatarUrl: null, availability: null })

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

// Fake backend: `profiles(userId)` answers GET /api/v1/profiles/:userId
function mockBackend({ profiles = () => jsonResponse(200, { profile: profile() }), me = () => responses.signedIn(), discover } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const { pathname } = new URL(url, 'http://localhost')
    if (pathname === '/api/v1/auth/me') return me()
    if (pathname.startsWith('/api/v1/profiles/')) return profiles(decodeURIComponent(pathname.split('/').pop()))
    if (pathname === '/api/v1/discover' && discover) return discover()
    if (pathname === '/api/v1/surf-spots') return jsonResponse(200, { spots: [CARCAVELOS, GUINCHO, SUPERTUBOS] })
    throw new Error(`Unexpected request in test: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const location = () => screen.getByTestId('location').textContent
const profileCalls = (fetchMock) => fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/v1/profiles/'))
const surferHeading = (name = 'Mariana Silva') => screen.findByRole('heading', { level: 2, name })
// My Profile's detail rows (ProfileSummary): <dt>Label: </dt><dd>value</dd>
const details = () => screen.getByLabelText('Profile details')
const rowValue = (label) => within(details()).getByText(`${label}:`, { exact: false, selector: 'dt' }).nextElementSibling
const hero = () => screen.getByRole('region', { name: 'Mariana Silva' })

async function openProfile(backend, id = MARIANA_ID) {
  const fetchMock = mockBackend(backend)
  renderApp(`/surfers/${id}`)
  return fetchMock
}

describe('routing', () => {
  test('a Discover card opens that surfer’s public profile', async () => {
    const user = userEvent.setup()
    const fetchMock = mockBackend({
      discover: () =>
        jsonResponse(200, {
          surfers: [{ userId: MARIANA_ID, displayName: 'Mariana Silva', avatarUrl: null, skillLevel: 'intermediate', availability: AVAILABILITY.activeWithSpot }],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
    })
    renderApp('/discover')
    // First test of the file: the whole Discover page loads, so allow more time under full-suite load
    await user.click(await screen.findByRole('link', { name: 'Mariana Silva' }, { timeout: 4000 }))
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)
    expect(await surferHeading()).toBeTruthy()
    expect(profileCalls(fetchMock)).toEqual([`/api/v1/profiles/${MARIANA_ID}`])
  })

  test('direct navigation (or a refresh) loads the surfer in the URL, with the session cookie', async () => {
    const fetchMock = await openProfile({ profiles: (id) => jsonResponse(200, { profile: profile({ userId: id, displayName: 'Lucas Costa' }) }) }, LUCAS_ID)
    expect(await surferHeading('Lucas Costa')).toBeTruthy()
    expect(profileCalls(fetchMock)).toEqual([`/api/v1/profiles/${LUCAS_ID}`])
    const call = fetchMock.mock.calls.find(([url]) => url.startsWith('/api/v1/profiles/'))
    expect(call[1].credentials).toBe('include')
    expect(screen.getByRole('heading', { level: 1, name: 'Surfer profile' })).toBeTruthy()
  })

  test('Back to Discover (button and back arrow)', async () => {
    const user = userEvent.setup()
    await openProfile({ discover: () => jsonResponse(200, { surfers: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }) })
    await surferHeading()
    const links = screen.getAllByRole('link', { name: 'Back to Discover' })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link.getAttribute('href')).toBe('/discover')
    await user.click(screen.getByText('Back to Discover', { selector: 'a' }))
    expect(location()).toBe('/discover')
  })

  test('Discover stays highlighted (top nav and burger menu); My Profile is not', async () => {
    const user = userEvent.setup()
    await openProfile()
    await surferHeading()
    const topNav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Main' })
    const discover = within(topNav).getByRole('link', { name: 'Discover' })
    expect(discover.getAttribute('aria-current')).toBe('true') // the current section
    expect(discover.className).toContain('font-bold')
    expect(within(topNav).getByRole('link', { name: 'Status' }).getAttribute('aria-current')).toBeNull()
    const current = [...document.querySelectorAll('[aria-current]')].map((element) => element.textContent)
    expect(current.some((text) => /my profile/i.test(text))).toBe(false)
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menuDiscover = screen.getAllByRole('link', { name: 'Discover' }).find((link) => link !== discover)
    expect(menuDiscover.getAttribute('aria-current')).toBe('true')
    expect(menuDiscover.className).toContain('bg-menu-active font-bold')
    const menuProfile = screen.getByRole('link', { name: 'My Profile' })
    expect(menuProfile.getAttribute('aria-current')).toBeNull()
    expect(menuProfile.className).not.toContain('bg-menu-active font-bold')
  })

  test('changing the surfer id never shows the previous surfer; late answers are ignored', async () => {
    mockBackend()
    const answers = { [MARIANA_ID]: deferred(), [LUCAS_ID]: deferred() }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => (url === '/api/v1/auth/me' ? responses.signedIn() : answers[url.split('/').pop()].promise)),
    )
    const { result, rerender } = renderHook(({ id }) => usePublicProfile(id), { initialProps: { id: MARIANA_ID }, wrapper: AuthProvider })
    expect(result.current.status).toBe('loading')

    rerender({ id: LUCAS_ID })
    answers[LUCAS_ID].resolve(jsonResponse(200, { profile: profile({ userId: LUCAS_ID, displayName: 'Lucas Costa' }) }))
    await waitFor(() => expect(result.current.profile?.displayName).toBe('Lucas Costa'))
    answers[MARIANA_ID].resolve(jsonResponse(200, { profile: profile() }))
    await new Promise((done) => setTimeout(done, 50))
    expect(result.current.profile.displayName).toBe('Lucas Costa')

    rerender({ id: MARIANA_ID }) // back to the first surfer: loading again, not Lucas
    expect(result.current.status).toBe('loading')
    expect(result.current.profile).toBeNull()
  })
})

describe('profile details', () => {
  test('name, photo, level, board, about (line breaks kept) and favorite spots in API order', async () => {
    await openProfile()
    await surferHeading()
    expect(hero().querySelector('img[src="https://res.cloudinary.com/demo/mariana.jpg"]')).toBeTruthy()
    expect(rowValue('Surf level').textContent).toBe('Intermediate')
    expect(rowValue('Board').textContent).toBe('Shortboard')
    expect(rowValue('Favorite spots').textContent).toBe('Praia de Carcavelos, Supertubos (Peniche)') // API order
    const about = rowValue('About').firstChild
    expect(about.textContent).toBe('Easygoing shortboarder.\nAlways up for a fun session.')
    expect(about.className).toContain('whitespace-pre-line')
  })

  test('missing optional details show muted placeholders; initials replace the photo', async () => {
    await openProfile({ profiles: () => jsonResponse(200, { profile: EMPTY_PROFILE }) })
    await surferHeading()
    expect(within(hero()).getByText('MS')).toBeTruthy()
    expect(hero().querySelector('img')).toBeNull()
    expect(rowValue('Board').textContent).toBe('Not specified')
    expect(rowValue('Favorite spots').textContent).toBe('No favorite spots added yet')
    expect(rowValue('About').textContent).toBe('No bio added yet')
    expect(screen.getByText('No bio added yet').className).toContain('text-muted')
    expect(screen.getByText('Not specified').className).toContain('text-muted')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('placeholders never appear while loading or after an error', async () => {
    const slow = deferred()
    await openProfile({ profiles: () => slow.promise })
    await screen.findByRole('heading', { level: 1, name: 'Surfer profile' })
    for (const text of ['Not specified', 'No bio added yet', 'No favorite spots added yet', 'Not currently available']) {
      expect(screen.queryByText(text)).toBeNull()
    }
    slow.resolve(responses.serverError())
    await screen.findByRole('alert')
    for (const text of ['Not specified', 'No bio added yet', 'No favorite spots added yet', 'Not currently available']) {
      expect(screen.queryByText(text)).toBeNull()
    }
  })

  test('long texts and spot names wrap instead of overflowing; duplicate spot names show their area', async () => {
    const longAbout = 'Waves '.repeat(300).trim()
    const longName = 'Praia da Costa Muito Comprida Com Um Nome Enorme Para Testar'
    await openProfile({
      profiles: () =>
        jsonResponse(200, {
          profile: profile({
            about: longAbout,
            favoriteSpots: [
              spot('pt-figueira-cabedelo', 'Praia do Cabedelo', 'Figueira da Foz'),
              spot('pt-viana-cabedelo', 'Praia do Cabedelo', 'Viana do Castelo'),
              spot('pt-long', longName, 'Somewhere'),
            ],
          }),
        }),
    })
    await surferHeading()
    expect(rowValue('About').textContent).toBe(longAbout)
    expect(rowValue('About').className).toContain('break-words')
    expect(rowValue('Favorite spots').textContent).toBe(
      `Praia do Cabedelo (Figueira da Foz), Praia do Cabedelo (Viana do Castelo), ${longName} (Somewhere)`,
    )
    expect(rowValue('Favorite spots').className).toContain('break-words')
  })
})

describe('My Profile layout', () => {
  test('same header and detail rows as My Profile (labels, order, icons); Message instead of Edit profile', async () => {
    await openProfile()
    await surferHeading()
    // Header: 82px avatar next to the name (My Profile's size)
    expect(hero().querySelector('img').className).toContain('size-[82px]')
    // The four ProfileSummary rows, in My Profile's order, each with its icon
    const labels = within(details()).getAllByText(/:\s*$/, { selector: 'dt' }).map((dt) => dt.textContent.trim())
    expect(labels).toEqual(['Surf level:', 'Board:', 'Favorite spots:', 'About:'])
    expect(within(details()).queryByText(/About me/)).toBeNull() // My Profile's own label is not used here
    for (const dt of within(details()).getAllByText(/:\s*$/, { selector: 'dt' })) {
      const row = dt.closest('div').parentElement
      expect(row.querySelector('img, svg'), dt.textContent).toBeTruthy()
      // Same typography as My Profile: semibold label with its colon, regular value
      expect(dt.className).toContain('font-semibold')
      expect(dt.nextElementSibling.className).not.toMatch(/font-(semibold|bold)/)
    }
    // No Figma-only sections any more
    expect(screen.queryByRole('heading', { name: /surf snapshot|about mariana/i })).toBeNull()
    // Message comes after the details, like Edit profile on My Profile
    const message = screen.getByRole('button', { name: 'Message' })
    expect(details().compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(message.className).toContain('w-full')
    expect(message.className).toContain('mt-10')
    expect(screen.queryByRole('button', { name: /edit profile/i })).toBeNull()
  })
})

describe('availability', () => {
  const heroText = async (availability) => {
    await openProfile({ profiles: () => jsonResponse(200, { profile: profile({ availability }) }) })
    await surferHeading()
    return hero().textContent
  }

  test('Active with a preferred spot: a preference, not a location', async () => {
    const text = await heroText(AVAILABILITY.activeWithSpot)
    expect(text).toContain('Active')
    expect(text).toContain('Open to a session today')
    expect(text).toContain('Preferred spot: Praia de Carcavelos')
    expect(text).not.toMatch(/\bAt Praia|Heading|Coming/)
  })

  test('Active without a spot', async () => {
    const text = await heroText(AVAILABILITY.activeNoSpot)
    expect(text).toContain('No preferred spot')
  })

  test('Coming Soon with a relative arrival (Lisbon time)', async () => {
    const text = await heroText(AVAILABILITY.relative)
    expect(text).toContain('Coming Soon')
    expect(text).toContain('Heading to Praia do Guincho (Cascais)')
    expect(text).toContain('Coming around 17:00')
  })

  test('Coming Soon with a window: the window, never one exact time', async () => {
    const text = await heroText(AVAILABILITY.window)
    expect(text).toContain('Coming between 16:00–18:00')
    expect(text).not.toContain('around')
  })

  test('At the Spot: the surfer’s own report, no tracking claimed', async () => {
    const text = await heroText(AVAILABILITY.atSpot)
    expect(text).toContain('At the Spot')
    expect(text).toContain('At Praia do Guincho (Cascais)')
    expect(text).toContain('Shared by the surfer, not tracked by GPS')
    expect(text).not.toMatch(/Coming|verified|live location/i)
  })

  test.each([
    ['no availability (Off, expired or never set)', null],
    ['an unexpected OFF status', { status: 'OFF', spot: null, arrival: null }],
  ])('%s: not currently available', async (_, availability) => {
    const text = await heroText(availability)
    expect(text).toContain('Not currently available')
    expect(text).not.toMatch(/Active|Coming Soon|At the Spot|Preferred spot/)
  })
})

describe('privacy and read-only', () => {
  test('private or internal fields are never shown, even if sent; no ids; no editing controls', async () => {
    const leaky = profile({
      email: 'mariana@example.com',
      passwordHash: '$2b$12$secret',
      avatarPublicId: 'sesh/avatars/private-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      availability: { ...AVAILABILITY.relative, expiresAt: '2026-07-15T23:59:00.000Z', minutes: 120 },
    })
    await openProfile({ profiles: () => jsonResponse(200, { profile: leaky }) })
    await surferHeading()
    const text = screen.getByRole('main').textContent // (the test's URL probe is outside <main>)
    for (const hidden of [MARIANA_ID, 'mariana@example.com', '$2b$', 'private-id', '2026-01-01', '23:59', '00:59', '120', 'pt-cascais']) {
      expect(text).not.toContain(hidden)
    }
    expect(screen.queryByRole('button', { name: /edit|change|remove|delete|save|upload/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})

describe('Message button (placeholder)', () => {
  test('visible, disabled, explained, and does nothing', async () => {
    const user = userEvent.setup()
    const fetchMock = await openProfile()
    await surferHeading()
    const button = screen.getByRole('button', { name: 'Message' })
    expect(button.disabled).toBe(true)
    const note = document.getElementById(button.getAttribute('aria-describedby'))
    expect(note.textContent).toBe('Messaging coming soon')

    const callsBefore = fetchMock.mock.calls.length
    await user.click(button)
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)
    expect(fetchMock.mock.calls).toHaveLength(callsBefore)
  })
})

describe('states', () => {
  test('loading is announced, without another surfer’s data', async () => {
    const slow = deferred()
    await openProfile({ profiles: () => slow.promise })
    await screen.findByText('Loading surfer profile…', { selector: '[aria-hidden="true"]' })
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('Loading surfer profile…')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    slow.resolve(jsonResponse(200, { profile: profile() }))
    expect(await surferHeading()).toBeTruthy()
  })

  test('404: Surfer not found, with Back to Discover', async () => {
    await openProfile({ profiles: () => jsonResponse(404, { status: 'error', message: 'Surfer profile not found.' }) })
    expect(await screen.findByRole('heading', { name: 'Surfer not found' })).toBeTruthy()
    expect(screen.queryByText('Surfer profile not found.')).toBeNull() // server text
    const back = screen.getAllByRole('link', { name: 'Back to Discover' })
    expect(back.length).toBeGreaterThanOrEqual(2) // arrow + button
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
  })

  test('server failure: friendly message, Try again keeps the route and loads the profile', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openProfile({
      profiles: () => (fail ? jsonResponse(500, { status: 'error', message: 'SequelizeDatabaseError at line 42' }) : jsonResponse(200, { profile: profile() })),
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('We couldn’t load this profile')
    expect(alert.textContent).not.toMatch(/Sequelize|line 42/)

    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await surferHeading()).toBeTruthy()
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)
    expect(profileCalls(fetchMock)).toHaveLength(2)
  })

  test('network failure: connection message', async () => {
    await openProfile({ profiles: responses.networkError })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
  })

  test('expired session (401): sent to log in', async () => {
    let signedIn = true
    await openProfile({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      profiles: () => {
        signedIn = false
        return jsonResponse(401, { status: 'error', message: 'Authentication required.' })
      },
    })
    await waitFor(() => expect(location()).toBe(`/login?returnTo=%2Fsurfers%2F${MARIANA_ID}`))
  })

  test('401 while the session still looks valid: a clear message, one re-check, no loop', async () => {
    const fetchMock = await openProfile({ profiles: () => jsonResponse(401, { status: 'error', message: 'Authentication required.' }) })
    expect((await screen.findByRole('alert')).textContent).toContain('Your session has ended. Please log in again.')
    await new Promise((done) => setTimeout(done, 100))
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(profileCalls(fetchMock)).toHaveLength(1)
    expect(urls.filter((url) => url === '/api/v1/auth/me')).toHaveLength(2)
  })

  test('403 PROFILE_REQUIRED: the onboarding guard takes over', async () => {
    let hasProfile = true
    await openProfile({
      me: () => responses.signedIn(undefined, { hasCompletedProfile: hasProfile }),
      profiles: () => {
        hasProfile = false
        return jsonResponse(403, { status: 'error', message: 'Complete your surfer profile to use this feature.', code: 'PROFILE_REQUIRED' })
      },
    })
    await waitFor(() => expect(location()).toBe('/create-profile'))
  })

  test('visitors and users without a profile are still guarded', async () => {
    mockBackend({ me: () => responses.signedOut() })
    const { unmount } = renderApp(`/surfers/${MARIANA_ID}`)
    await waitFor(() => expect(location()).toBe(`/login?returnTo=%2Fsurfers%2F${MARIANA_ID}`))
    unmount()

    const fetchMock = mockBackend({ me: () => responses.signedIn(undefined, { hasCompletedProfile: false }) })
    renderApp(`/surfers/${MARIANA_ID}`)
    await waitFor(() => expect(location()).toBe('/create-profile'))
    expect(profileCalls(fetchMock)).toHaveLength(0)
  })
})
