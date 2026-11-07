// Discover page tests (mocked API; the backend does the real filtering).
// The device time zone is New York for this file, so arrival times shown on
// cards must come from Lisbon time, not the device.
process.env.TZ = 'America/New_York'

import { afterEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, renderApp, responses } from '../test/utils'
import { NO_MATCHES_TITLE, NO_SURFERS_TITLE } from '../components/discover/DiscoverResults'
import { PROFILE_REQUIRED_MESSAGE } from '../api/errorMessages'

const CARCAVELOS = { id: 'pt-cascais-carcavelos', name: 'Carcavelos', kind: 'beach', area: 'Carcavelos', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' }
const GUINCHO = { id: 'pt-cascais-guincho', name: 'Guincho', kind: 'beach', area: 'Cascais', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' }
const CABEDELO_FIGUEIRA = { id: 'pt-figueira-cabedelo', name: 'Praia do Cabedelo', kind: 'beach', area: 'Figueira da Foz', municipality: 'Figueira da Foz', region: 'Coimbra', country: 'Portugal' }
const CABEDELO_VIANA = { id: 'pt-viana-cabedelo', name: 'Praia do Cabedelo', kind: 'beach', area: 'Viana do Castelo', municipality: 'Viana do Castelo', region: 'Viana do Castelo', country: 'Portugal' }
const SPOTS = [CARCAVELOS, GUINCHO, CABEDELO_FIGUEIRA, CABEDELO_VIANA]
const cardSpot = ({ id, name, area }) => ({ id, name, area })

const surfer = (userId, displayName, availability, fields = {}) => ({
  userId,
  displayName,
  avatarUrl: null,
  skillLevel: 'intermediate',
  availability: { spot: null, arrival: null, ...availability },
  ...fields,
})
const MARIANA = surfer('user-mariana', 'Mariana Silva', { status: 'ACTIVE', spot: cardSpot(CARCAVELOS) })
const LUCAS = surfer(
  'user-lucas',
  'Lucas Costa',
  { status: 'COMING_SOON', spot: cardSpot(GUINCHO), arrival: { type: 'relative', arrivesAt: '2026-07-15T16:00:00.000Z' } },
  { skillLevel: 'beginner' },
)
const JAMIE = surfer('user-jamie', 'Jamie Lee', { status: 'AT_SPOT', spot: cardSpot(CABEDELO_VIANA) }, { skillLevel: 'advanced' })
const EMMA = surfer('user-emma', 'Emma Laurent', {
  status: 'COMING_SOON',
  spot: cardSpot(CARCAVELOS),
  arrival: { type: 'window', startsAt: '2026-07-15T15:00:00.000Z', endsAt: '2026-07-15T17:00:00.000Z' },
})
const NOA = surfer('user-noa', 'Noa Reis', { status: 'ACTIVE', spot: null })

const page = (surfers, { page: number = 1, total = surfers.length, totalPages = total ? 1 : 0 } = {}) =>
  jsonResponse(200, { surfers, pagination: { page: number, limit: 20, total, totalPages } })

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

// Fake backend: `discover(params, options)` answers GET /api/v1/discover.
function mockBackend({ discover = () => page([]), spots = () => jsonResponse(200, { spots: SPOTS }), me = () => responses.signedIn() } = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost')
    if (pathname === '/api/v1/auth/me') return me()
    if (pathname === '/api/v1/surf-spots') return spots()
    if (pathname === '/api/v1/discover') return discover(Object.fromEntries(searchParams), options)
    throw new Error(`Unexpected request in test: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const discoverCalls = (fetchMock) =>
  fetchMock.mock.calls
    .filter(([url]) => url.startsWith('/api/v1/discover'))
    .map(([url]) => Object.fromEntries(new URL(url, 'http://localhost').searchParams))

const location = () => screen.getByTestId('location').textContent
const results = () => screen.findByRole('list', { name: 'Available surfers' })
const cardNames = () => within(screen.getByRole('list', { name: 'Available surfers' })).getAllByRole('heading').map((h) => h.textContent)
const field = (label) => screen.getByLabelText(label)
const arrivalField = () => screen.queryByLabelText('Approximate arrival')
// The Discover results count (the spot field has its own screen-reader status)
const resultCount = () => screen.getByText(/surfers? available/, { selector: '[aria-hidden="true"]' })
// Texts of the screen-reader status regions (Discover's and the spot field's)
const announced = () => screen.getAllByRole('status').map((region) => region.textContent)
const resultsRegion = () => screen.getByRole('region', { name: 'Search results' })
// Suggestions of the surf spot field (not the <option>s of the other filters)
const spotOptions = () => within(screen.getByRole('listbox')).getAllByRole('option')

// Types into the surf spot search field and picks the matching suggestion
async function chooseSpot(user, text, optionName) {
  await user.clear(field('Surf spot'))
  await user.type(field('Surf spot'), text)
  await user.click(screen.getByRole('option', { name: optionName }))
}

async function openDiscover(backend) {
  const fetchMock = mockBackend(backend)
  renderApp('/discover')
  await screen.findByRole('heading', { name: 'Available surfers' })
  await waitFor(() => expect(field('Surf spot').disabled).toBe(false))
  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Discover cards', () => {
  test('show the public card fields per status', async () => {
    await openDiscover({ discover: () => page([MARIANA, LUCAS, JAMIE, EMMA, NOA]) })
    const list = await results()
    const card = (name) => within(list).getByRole('heading', { name }).closest('article')

    expect(card('Mariana Silva').textContent).toContain('Intermediate · Active now')
    expect(card('Mariana Silva').textContent).toContain('Preferred spot: Carcavelos')
    expect(card('Mariana Silva').textContent).not.toMatch(/Coming/)

    expect(card('Noa Reis').textContent).toContain('No preferred spot')

    expect(card('Lucas Costa').textContent).toContain('Beginner · Coming soon')
    expect(card('Lucas Costa').textContent).toContain('Guincho')
    expect(card('Lucas Costa').textContent).toContain('Coming around 17:00')

    expect(card('Emma Laurent').textContent).toContain('Coming between 16:00–18:00')
    expect(card('Emma Laurent').textContent).not.toMatch(/around/)

    expect(card('Jamie Lee').textContent).toContain('Advanced · At the spot')
    expect(card('Jamie Lee').textContent).not.toMatch(/Coming/)

    expect(resultCount().textContent).toBe('5 surfers available')
  })

  test('never show the user id or private fields, even if the API sent them', async () => {
    const leaky = {
      ...MARIANA,
      boardType: 'shortboard',
      about: 'Private bio text',
      favoriteSpots: [cardSpot(GUINCHO)],
      expiresAt: '2026-07-15T23:00:00.000Z',
      email: 'mariana@example.com',
    }
    await openDiscover({ discover: () => page([leaky]) })
    const text = (await results()).textContent
    for (const hidden of ['user-mariana', 'hortboard', 'Private bio text', 'Guincho', '23:00', '00:00', 'mariana@example.com']) {
      expect(text).not.toContain(hidden)
    }
  })

  test('avatar: the photo when there is one, initials otherwise', async () => {
    await openDiscover({ discover: () => page([{ ...MARIANA, avatarUrl: 'https://res.cloudinary.com/demo/mariana.jpg' }, NOA]) })
    const list = await results()
    expect(list.querySelector('img[src="https://res.cloudinary.com/demo/mariana.jpg"]')).toBeTruthy()
    expect(within(list).getByText('NR')).toBeTruthy()
  })

  test('spots with the same name are told apart by area on cards', async () => {
    await openDiscover({ discover: () => page([JAMIE]) })
    expect((await results()).textContent).toContain('Praia do Cabedelo, Viana do Castelo')
  })

  test('a card opens the surfer’s public profile route (placeholder), also with the keyboard', async () => {
    const user = userEvent.setup()
    await openDiscover({ discover: () => page([MARIANA]) })
    const link = within(await results()).getByRole('link', { name: 'Mariana Silva' })
    expect(link.getAttribute('href')).toBe('/surfers/user-mariana')

    link.focus()
    await user.keyboard('{Enter}')
    expect(location()).toBe('/surfers/user-mariana')
    expect(await screen.findByRole('heading', { name: 'Surfer profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Discover' })).toBeTruthy()
  })
})

describe('filters', () => {
  test('defaults: all spots, levels and statuses; first request has no filters', async () => {
    const fetchMock = await openDiscover()
    expect(screen.getByText('Explore who’s available for a session today.')).toBeTruthy()
    expect(field('Surf spot').value).toBe('')
    expect(field('Surf spot').getAttribute('placeholder')).toBe('All spots')
    expect(field('Skill level').value).toBe('')
    expect(field('Availability').value).toBe('')
    expect(arrivalField()).toBeNull()
    expect(within(field('Availability')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All available',
      'Active',
      'Coming Soon',
      'At the Spot',
    ])
    expect(within(field('Skill level')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All levels',
      'Beginner',
      'Intermediate',
      'Advanced',
    ])
    expect(discoverCalls(fetchMock)).toEqual([{}])
  })

  test('each filter sends its value; filters combine; one request per change', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()

    await user.selectOptions(field('Skill level'), 'beginner')
    await waitFor(() => expect(discoverCalls(fetchMock)).toHaveLength(2))
    expect(discoverCalls(fetchMock)[1]).toEqual({ skillLevel: 'beginner' })

    await user.selectOptions(field('Availability'), 'AT_SPOT')
    await waitFor(() => expect(discoverCalls(fetchMock)).toHaveLength(3))
    expect(discoverCalls(fetchMock)[2]).toEqual({ skillLevel: 'beginner', status: 'AT_SPOT' })

    await chooseSpot(user, 'carc', /^Carcavelos/)
    await waitFor(() => expect(discoverCalls(fetchMock)).toHaveLength(4))
    expect(discoverCalls(fetchMock)[3]).toEqual({ skillLevel: 'beginner', status: 'AT_SPOT', spotId: 'pt-cascais-carcavelos' })

    await user.selectOptions(field('Skill level'), '')
    await waitFor(() => expect(discoverCalls(fetchMock)).toHaveLength(5))
    expect(discoverCalls(fetchMock)[4]).toEqual({ status: 'AT_SPOT', spotId: 'pt-cascais-carcavelos' })
  })

  test('the results shown are the ones the backend returned for the filters', async () => {
    const user = userEvent.setup()
    await openDiscover({ discover: (params) => page(params.status === 'AT_SPOT' ? [JAMIE] : [MARIANA, JAMIE]) })
    await results()
    expect(cardNames()).toEqual(['Mariana Silva', 'Jamie Lee'])
    await user.selectOptions(field('Availability'), 'AT_SPOT')
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))
  })

  test('Approximate arrival appears only for Coming Soon, defaulting to Any time today (no bounds)', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()

    for (const status of ['ACTIVE', 'AT_SPOT']) {
      await user.selectOptions(field('Availability'), status)
      expect(arrivalField()).toBeNull()
    }
    await user.selectOptions(field('Availability'), 'COMING_SOON')
    expect(arrivalField().value).toBe('any')
    expect(within(arrivalField()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any time today',
      'Within 1 hour',
      'Within 2 hours',
    ])
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ status: 'COMING_SOON' }))
  })

  test('Within 1 hour / 2 hours send an interval starting now, in UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-06T14:10:00.000Z') })
    const user = userEvent.setup()
    const fetchMock = await openDiscover()

    await user.selectOptions(field('Availability'), 'COMING_SOON')
    await user.selectOptions(arrivalField(), 'within_1_hour')
    await waitFor(() =>
      expect(discoverCalls(fetchMock).at(-1)).toEqual({
        status: 'COMING_SOON',
        arrivalFrom: '2026-11-06T14:10:00.000Z',
        arrivalTo: '2026-11-06T15:10:00.000Z',
      }),
    )

    await user.selectOptions(arrivalField(), 'within_2_hours')
    await waitFor(() =>
      expect(discoverCalls(fetchMock).at(-1)).toEqual({
        status: 'COMING_SOON',
        arrivalFrom: '2026-11-06T14:10:00.000Z',
        arrivalTo: '2026-11-06T16:10:00.000Z',
      }),
    )
    // The exact request URL is URL-encoded
    expect(fetchMock.mock.calls.at(-1)[0]).toBe(
      '/api/v1/discover?status=COMING_SOON&arrivalFrom=2026-11-06T14%3A10%3A00.000Z&arrivalTo=2026-11-06T16%3A10%3A00.000Z',
    )
  })

  test('switching status drops the hidden arrival choice; returning to Coming Soon starts at Any time today', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()

    await user.selectOptions(field('Availability'), 'COMING_SOON')
    await user.selectOptions(arrivalField(), 'within_1_hour')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toHaveProperty('arrivalFrom'))

    await user.selectOptions(field('Availability'), 'ACTIVE')
    expect(arrivalField()).toBeNull()
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ status: 'ACTIVE' }))

    await user.selectOptions(field('Availability'), '')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({}))

    await user.selectOptions(field('Availability'), 'COMING_SOON')
    expect(arrivalField().value).toBe('any')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ status: 'COMING_SOON' }))
  })

  test('if the surf spots cannot be loaded, Discover still works and the spots can be retried', async () => {
    const user = userEvent.setup()
    let spotsFail = true
    mockBackend({
      discover: () => page([MARIANA]),
      spots: () => (spotsFail ? responses.serverError() : jsonResponse(200, { spots: SPOTS })),
    })
    renderApp('/discover')
    expect(await results()).toBeTruthy()
    expect(screen.getByText(/We couldn’t load the surf spots/)).toBeTruthy()
    expect(field('Surf spot').disabled).toBe(true)

    spotsFail = false
    await user.click(screen.getByRole('button', { name: 'Reload surf spots' }))
    await waitFor(() => expect(field('Surf spot').disabled).toBe(false))
    await user.click(field('Surf spot'))
    expect(spotOptions()).toHaveLength(5) // All spots + 4
  })
})

describe('surf spot filter (searchable)', () => {
  const optionNames = () => spotOptions().map((option) => option.firstChild.firstChild.textContent)

  test('clicking the field lists every spot for browsing, All spots first and selected', async () => {
    const user = userEvent.setup()
    await openDiscover()
    await user.click(field('Surf spot'))
    expect(field('Surf spot').getAttribute('aria-expanded')).toBe('true')
    expect(optionNames()).toEqual(['All spots', 'Carcavelos', 'Guincho', 'Praia do Cabedelo', 'Praia do Cabedelo'])
    expect(screen.getByRole('option', { name: 'All spots' }).getAttribute('aria-selected')).toBe('true')
    // Duplicate names show their location in the list
    expect(screen.getByRole('option', { name: /^Praia do Cabedelo.*Viana do Castelo/ })).toBeTruthy()
  })

  test('typing searches the loaded spots, ignoring case, without a new Discover request', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await user.type(field('Surf spot'), 'CAR')
    expect(optionNames()).toEqual(['Carcavelos'])
    await user.clear(field('Surf spot'))
    await user.type(field('Surf spot'), 'cabedelo')
    expect(optionNames()).toEqual(['Praia do Cabedelo', 'Praia do Cabedelo'])
    expect(discoverCalls(fetchMock)).toEqual([{}])
  })

  test('selecting a spot sends its id and shows it in the field', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await chooseSpot(user, 'guin', /^Guincho/)
    expect(field('Surf spot').value).toBe('Guincho')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ spotId: 'pt-cascais-guincho' }))
  })

  test('a selected duplicate name shows its area', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await chooseSpot(user, 'viana', /^Praia do Cabedelo/)
    expect(field('Surf spot').value).toBe('Praia do Cabedelo, Viana do Castelo')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ spotId: 'pt-viana-cabedelo' }))
  })

  test('keyboard: arrows and Enter select, Escape closes', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    field('Surf spot').focus()
    await user.keyboard('{ArrowDown}') // opens on "All spots" (current)
    expect(field('Surf spot').getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'All spots' }).id)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(field('Surf spot').value).toBe('Guincho')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ spotId: 'pt-cascais-guincho' }))

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(field('Surf spot').value).toBe('Guincho')
    // Escape again (list closed) keeps the spot: no new search
    await user.keyboard('{Escape}')
    expect(field('Surf spot').value).toBe('Guincho')
    expect(discoverCalls(fetchMock).at(-1)).toEqual({ spotId: 'pt-cascais-guincho' })
    expect(discoverCalls(fetchMock)).toHaveLength(2)
  })

  test('typing and leaving the field keeps the selected spot (no request)', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await chooseSpot(user, 'carc', /^Carcavelos/)
    await waitFor(() => expect(discoverCalls(fetchMock)).toHaveLength(2))

    await user.type(field('Surf spot'), 'xyz')
    await user.click(screen.getByLabelText('Skill level')) // leave the field
    expect(field('Surf spot').value).toBe('Carcavelos')
    expect(discoverCalls(fetchMock)).toHaveLength(2)
  })

  test('no matching spots: a clear message, nothing selected or requested', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await user.type(field('Surf spot'), 'zzz')
    expect(screen.getByText('No surf spots match “zzz”.')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByText('No surf spots found.')).toBeTruthy() // screen reader announcement
    expect(discoverCalls(fetchMock)).toEqual([{}])
  })

  test('back to All spots: with the clear button or the All spots option', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await chooseSpot(user, 'carc', /^Carcavelos/)
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ spotId: 'pt-cascais-carcavelos' }))

    await user.click(screen.getByRole('button', { name: 'Clear surf spot' }))
    expect(field('Surf spot').value).toBe('')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({}))

    await chooseSpot(user, 'guin', /^Guincho/)
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({ spotId: 'pt-cascais-guincho' }))
    await user.click(field('Surf spot'))
    await user.click(screen.getByRole('option', { name: 'All spots' }))
    expect(field('Surf spot').value).toBe('')
    await waitFor(() => expect(discoverCalls(fetchMock).at(-1)).toEqual({}))
  })

  test('picking the same spot again does not search again', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()
    await user.click(field('Surf spot'))
    await user.click(screen.getByRole('option', { name: 'All spots' }))
    await chooseSpot(user, 'carc', /^Carcavelos/)
    await chooseSpot(user, 'carc', /^Carcavelos/)
    await waitFor(() => expect(discoverCalls(fetchMock)).toHaveLength(2))
    await new Promise((done) => setTimeout(done, 50))
    expect(discoverCalls(fetchMock)).toEqual([{}, { spotId: 'pt-cascais-carcavelos' }])
  })

  test('changing the spot starts again from page 1 and keeps the other filters', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover({
      discover: (params) =>
        params.spotId
          ? page([JAMIE])
          : params.page === '2'
            ? page([LUCAS], { page: 2, total: 2, totalPages: 2 })
            : page([MARIANA], { total: 2, totalPages: 2 }),
    })
    await user.selectOptions(field('Skill level'), 'advanced')
    await results()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva', 'Lucas Costa']))

    await chooseSpot(user, 'viana', /^Praia do Cabedelo/)
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({ skillLevel: 'advanced', spotId: 'pt-viana-cabedelo' })
  })
})

describe('API integration', () => {
  test('requests send the session cookie', async () => {
    const fetchMock = await openDiscover()
    const call = fetchMock.mock.calls.find(([url]) => url.startsWith('/api/v1/discover'))
    expect(call[1].credentials).toBe('include')
  })

  test('a slow older response never replaces newer results', async () => {
    const user = userEvent.setup()
    const slow = deferred()
    await openDiscover({ discover: (params) => (params.skillLevel ? page([JAMIE]) : slow.promise) })

    await user.selectOptions(field('Skill level'), 'advanced')
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))

    slow.resolve(page([MARIANA, LUCAS]))
    await new Promise((done) => setTimeout(done, 50))
    expect(cardNames()).toEqual(['Jamie Lee'])
  })

  test('Load more appends the next page without duplicates and keeps the filters', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover({
      discover: (params) =>
        params.page === '2'
          ? page([LUCAS, JAMIE], { page: 2, total: 4, totalPages: 2 }) // Lucas moved down a page meanwhile
          : page([MARIANA, LUCAS], { page: 1, total: 4, totalPages: 2 }),
    })
    await user.selectOptions(field('Skill level'), 'beginner')
    await results()
    expect(resultCount().textContent).toBe('4 surfers available · showing 2')

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva', 'Lucas Costa', 'Jamie Lee']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({ skillLevel: 'beginner', page: '2' })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull() // last page
  })

  test('Load more can’t be triggered twice while a page is loading', async () => {
    const user = userEvent.setup()
    const next = deferred()
    const fetchMock = await openDiscover({
      discover: (params) => (params.page === '2' ? next.promise : page([MARIANA], { total: 2, totalPages: 2 })),
    })
    await results()
    const button = screen.getByRole('button', { name: 'Load more' })
    await user.click(button)
    expect(button.disabled).toBe(true)
    await user.click(button)
    expect(discoverCalls(fetchMock).filter((params) => params.page === '2')).toHaveLength(1)

    next.resolve(page([NOA], { page: 2, total: 2, totalPages: 2 }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva', 'Noa Reis']))
  })

  test('changing a filter starts again from page 1', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover({
      discover: (params) =>
        params.status
          ? page([JAMIE])
          : params.page === '2'
            ? page([LUCAS], { page: 2, total: 2, totalPages: 2 })
            : page([MARIANA], { total: 2, totalPages: 2 }),
    })
    await results()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva', 'Lucas Costa']))

    await user.selectOptions(field('Availability'), 'AT_SPOT')
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({ status: 'AT_SPOT' })
  })

  test('an ended session (401) sends the user to log in', async () => {
    let signedIn = true
    mockBackend({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      discover: () => {
        signedIn = false
        return jsonResponse(401, { status: 'error', message: 'Authentication required.' })
      },
    })
    renderApp('/discover')
    await waitFor(() => expect(location()).toBe('/login?returnTo=%2Fdiscover'))
  })
})

describe('states', () => {
  test('initial loading is announced', async () => {
    const slow = deferred()
    mockBackend({ discover: () => slow.promise })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Available surfers' })
    // Visible message, announced once by the status region, filters usable
    expect(screen.getByText('Finding surfers…', { selector: '[aria-hidden="true"]' })).toBeTruthy()
    expect(announced()).toContain('Finding surfers…')
    expect(resultsRegion().getAttribute('aria-busy')).toBe('true')
    expect(field('Skill level').disabled).toBe(false)
    expect(screen.queryByRole('heading', { name: NO_SURFERS_TITLE })).toBeNull()

    slow.resolve(page([MARIANA]))
    expect(await results()).toBeTruthy()
    expect(resultsRegion().getAttribute('aria-busy')).toBe('false')
    expect(announced()).toContain('1 surfer available')
  })

  test('nobody available (no filters): invites the user to set a status', async () => {
    await openDiscover({ discover: () => page([]) })
    expect(await screen.findByRole('heading', { name: 'No surfers are available right now' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set my status' }).getAttribute('href')).toBe('/status')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  test('nobody matches the filters: Clear filters resets them and searches again', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover({ discover: (params) => page(params.skillLevel ? [] : [MARIANA]) })
    await user.selectOptions(field('Skill level'), 'advanced')
    await user.selectOptions(field('Availability'), 'COMING_SOON')
    expect(await screen.findByRole('heading', { name: 'No surfers match these filters' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(field('Skill level').value).toBe('')
    expect(field('Availability').value).toBe('')
    expect(arrivalField()).toBeNull()
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({})
  })

  test('an error shows a friendly message; Try again keeps the filters', async () => {
    const user = userEvent.setup()
    let fail = true
    let calls = 0
    const fetchMock = await openDiscover({
      // The first (unfiltered) search works; the filtered one fails until retried
      discover: () => (++calls > 1 && fail ? responses.serverError() : page([MARIANA])),
    })
    await user.selectOptions(field('Skill level'), 'intermediate')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('We couldn’t load surfers')
    expect(alert.textContent).not.toContain('Something went wrong. Please try again later.') // raw server text

    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({ skillLevel: 'intermediate' })
  })

  test('a network error explains the connection problem', async () => {
    await openDiscover({ discover: responses.networkError })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
  })

  test('Load more failure keeps the results and can be retried', async () => {
    const user = userEvent.setup()
    let failPage2 = true
    await openDiscover({
      discover: (params) => {
        if (params.page === '2') return failPage2 ? responses.networkError() : page([NOA], { page: 2, total: 2, totalPages: 2 })
        return page([MARIANA], { total: 2, totalPages: 2 })
      },
    })
    await results()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t load more surfers')
    expect(cardNames()).toEqual(['Mariana Silva'])

    failPage2 = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva', 'Noa Reis']))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// Task 8.4: refined states, races and session handling
describe('loading after a filter change', () => {
  test('old cards disappear at once; loading, never an empty state, until the new answer', async () => {
    const user = userEvent.setup()
    const next = deferred()
    await openDiscover({ discover: (params) => (params.status ? next.promise : page([MARIANA, LUCAS])) })
    await results()

    await user.selectOptions(field('Availability'), 'AT_SPOT')
    expect(screen.queryByRole('list', { name: 'Available surfers' })).toBeNull()
    expect(screen.queryByText('Mariana Silva')).toBeNull()
    expect(announced()).toContain('Finding surfers…')
    expect(resultsRegion().getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('heading', { name: NO_MATCHES_TITLE })).toBeNull()

    next.resolve(page([JAMIE]))
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))
  })

  test('a search that finds nobody after an earlier success shows the filtered empty state, no old cards', async () => {
    const user = userEvent.setup()
    await openDiscover({ discover: (params) => page(params.skillLevel ? [] : [MARIANA]) })
    await results()
    await user.selectOptions(field('Skill level'), 'advanced')
    expect(await screen.findByRole('heading', { name: NO_MATCHES_TITLE })).toBeTruthy()
    expect(screen.queryByText('Mariana Silva')).toBeNull()
    expect(announced()).toContain(NO_MATCHES_TITLE + '.')
  })

  test('no arrivals in the chosen interval: the filtered empty state, not "nobody available"', async () => {
    const user = userEvent.setup()
    await openDiscover({ discover: (params) => page(params.arrivalFrom ? [] : [LUCAS]) })
    await user.selectOptions(field('Availability'), 'COMING_SOON')
    await user.selectOptions(arrivalField(), 'within_1_hour')
    expect(await screen.findByRole('heading', { name: NO_MATCHES_TITLE })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: NO_SURFERS_TITLE })).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })
})

describe('empty-state actions', () => {
  test('Clear filters (keyboard) resets all four filters, searches again and keeps focus in the results', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover({ discover: (params) => page(Object.keys(params).length ? [] : [MARIANA]) })
    await chooseSpot(user, 'carc', /^Carcavelos/)
    await user.selectOptions(field('Skill level'), 'beginner')
    await user.selectOptions(field('Availability'), 'COMING_SOON')
    await user.selectOptions(arrivalField(), 'within_2_hours')
    const clear = await screen.findByRole('button', { name: 'Clear filters' })

    clear.focus()
    await user.keyboard('{Enter}')
    expect(field('Surf spot').value).toBe('')
    expect(field('Skill level').value).toBe('')
    expect(field('Availability').value).toBe('')
    expect(arrivalField()).toBeNull()
    expect(document.activeElement).toBe(resultsRegion())
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({})

    // Coming Soon again starts from "Any time today"
    await user.selectOptions(field('Availability'), 'COMING_SOON')
    expect(arrivalField().value).toBe('any')
  })

  test('Set my status opens My Status', async () => {
    const user = userEvent.setup()
    await openDiscover({ discover: () => page([]) })
    await user.click(await screen.findByRole('link', { name: 'Set my status' }))
    expect(location()).toBe('/status')
  })
})

describe('errors and retry', () => {
  test('server details are never shown; Try again (keyboard) keeps the filters and focus', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openDiscover({
      discover: () =>
        fail ? jsonResponse(500, { status: 'error', message: 'SequelizeDatabaseError: relation "surfer_availability" at line 42' }) : page([MARIANA]),
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/Sequelize|relation|line 42/)
    expect(screen.queryByRole('heading', { name: NO_SURFERS_TITLE })).toBeNull() // not an empty state

    await user.selectOptions(field('Skill level'), 'beginner')
    await screen.findByRole('alert')
    fail = false
    screen.getByRole('button', { name: 'Try again' }).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(resultsRegion())
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva']))
    expect(discoverCalls(fetchMock).at(-1)).toEqual({ skillLevel: 'beginner' })
  })
})

describe('Load more states', () => {
  test('while the next page loads: cards stay, button shows "Loading more…" and is disabled', async () => {
    const user = userEvent.setup()
    const next = deferred()
    await openDiscover({ discover: (params) => (params.page === '2' ? next.promise : page([MARIANA], { total: 2, totalPages: 2 })) })
    await results()
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    const button = screen.getByRole('button', { name: /Loading more…/ })
    expect(button.disabled).toBe(true)
    expect(cardNames()).toEqual(['Mariana Silva'])
    expect(announced()).toContain('Loading more surfers…')
    expect(resultsRegion().getAttribute('aria-busy')).toBe('false') // the list itself is not reloading

    next.resolve(page([NOA], { page: 2, total: 2, totalPages: 2 }))
    await waitFor(() => expect(cardNames()).toEqual(['Mariana Silva', 'Noa Reis']))
    expect(announced()).toContain('2 surfers available')
  })

  test('retrying a failed page asks for the same page with the same arrival bounds', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-06T14:10:00.000Z') })
    const user = userEvent.setup()
    let failPage2 = true
    const fetchMock = await openDiscover({
      discover: (params) => {
        if (params.page === '2') return failPage2 ? responses.serverError() : page([EMMA], { page: 2, total: 2, totalPages: 2 })
        return page([LUCAS], { total: 2, totalPages: 2 })
      },
    })
    await user.selectOptions(field('Availability'), 'COMING_SOON')
    await user.selectOptions(arrivalField(), 'within_1_hour')
    await waitFor(() => expect(cardNames()).toEqual(['Lucas Costa']))
    const firstPage = discoverCalls(fetchMock).at(-1)

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t load more surfers')
    vi.setSystemTime(new Date('2026-11-06T14:25:00.000Z')) // time passes before the retry
    failPage2 = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toEqual(['Lucas Costa', 'Emma Laurent']))

    const pageCalls = discoverCalls(fetchMock).filter((params) => params.page === '2')
    expect(pageCalls).toHaveLength(2)
    for (const call of pageCalls) expect(call).toEqual({ ...firstPage, page: '2' })
  })
})

describe('race conditions', () => {
  test('rapid status changes with answers out of order: only the latest search is shown', async () => {
    const user = userEvent.setup()
    const answers = { COMING_SOON: deferred(), AT_SPOT: deferred() }
    await openDiscover({ discover: (params) => (params.status ? answers[params.status].promise : page([MARIANA])) })
    await results()

    await user.selectOptions(field('Availability'), 'COMING_SOON')
    await user.selectOptions(field('Availability'), 'AT_SPOT')
    answers.AT_SPOT.resolve(page([JAMIE]))
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))
    answers.COMING_SOON.resolve(page([LUCAS, EMMA]))
    await new Promise((done) => setTimeout(done, 50))
    expect(cardNames()).toEqual(['Jamie Lee'])
  })

  test('rapid spot changes: All spots → Carcavelos → Guincho', async () => {
    const user = userEvent.setup()
    const carcavelos = deferred()
    await openDiscover({
      discover: (params) =>
        params.spotId === 'pt-cascais-carcavelos' ? carcavelos.promise : params.spotId ? page([LUCAS]) : page([MARIANA]),
    })
    await results()
    await chooseSpot(user, 'carc', /^Carcavelos/)
    await chooseSpot(user, 'guin', /^Guincho/)
    await waitFor(() => expect(cardNames()).toEqual(['Lucas Costa']))
    carcavelos.resolve(page([MARIANA, EMMA]))
    await new Promise((done) => setTimeout(done, 50))
    expect(cardNames()).toEqual(['Lucas Costa'])
  })

  test('an older search failing late does not replace newer results', async () => {
    const user = userEvent.setup()
    const slowFailure = deferred()
    await openDiscover({
      discover: (params) => (params.skillLevel === 'beginner' ? slowFailure.promise : page(params.skillLevel ? [JAMIE] : [MARIANA])),
    })
    await results()
    await user.selectOptions(field('Skill level'), 'beginner')
    await user.selectOptions(field('Skill level'), 'advanced')
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))

    slowFailure.resolve(responses.serverError())
    await new Promise((done) => setTimeout(done, 50))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(cardNames()).toEqual(['Jamie Lee'])
  })

  test('a filter change while Load more runs: the old page is never appended', async () => {
    const user = userEvent.setup()
    const page2 = deferred()
    await openDiscover({
      discover: (params) => {
        if (params.page === '2') return page2.promise
        return params.skillLevel ? page([JAMIE]) : page([MARIANA], { total: 2, totalPages: 2 })
      },
    })
    await results()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await user.selectOptions(field('Skill level'), 'advanced')
    await waitFor(() => expect(cardNames()).toEqual(['Jamie Lee']))

    page2.resolve(page([NOA], { page: 2, total: 2, totalPages: 2 }))
    await new Promise((done) => setTimeout(done, 50))
    expect(cardNames()).toEqual(['Jamie Lee'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /Load more|Loading more/ })).toBeNull()
  })
})

describe('session and profile', () => {
  test('401 while the session still looks valid: a clear message, one check, no retry loop', async () => {
    const fetchMock = mockBackend({ discover: () => jsonResponse(401, { status: 'error', message: 'Authentication required.' }) })
    renderApp('/discover')
    expect((await screen.findByRole('alert')).textContent).toContain('Your session has ended. Please log in again.')
    await new Promise((done) => setTimeout(done, 100))
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls.filter((url) => url.startsWith('/api/v1/discover'))).toHaveLength(1)
    expect(urls.filter((url) => url === '/api/v1/auth/me')).toHaveLength(2) // page load + one re-check
  })

  test('403 PROFILE_REQUIRED (profile gone): the onboarding guard takes over', async () => {
    let hasProfile = true
    mockBackend({
      me: () => responses.signedIn(undefined, { hasCompletedProfile: hasProfile }),
      discover: () => {
        hasProfile = false
        return jsonResponse(403, { status: 'error', message: 'Create your surfer profile first.', code: 'PROFILE_REQUIRED' })
      },
    })
    renderApp('/discover')
    await waitFor(() => expect(location()).toBe('/create-profile'))
    expect(screen.queryByText(PROFILE_REQUIRED_MESSAGE)).toBeNull() // the page has moved on
  })
})
