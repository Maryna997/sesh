// Discover page tests (mocked API; the backend does the real filtering).
// The device time zone is New York for this file, so arrival times shown on
// cards must come from Lisbon time, not the device.
process.env.TZ = 'America/New_York'

import { afterEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, renderApp, responses } from '../test/utils'

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
const resultCount = () => screen.getByText(/surfers? available/)
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
    await user.click(screen.getByRole('button', { name: 'Try again' }))
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
    expect((await screen.findByText('Finding surfers…')).getAttribute('role')).toBe('status')
    slow.resolve(page([MARIANA]))
    expect(await results()).toBeTruthy()
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
