// My Status page tests (mocked API, fixed dates).
// The device time zone is New York for this file, so every time shown must
// come from Lisbon time, not the device. Only Date is faked; timers are real.
process.env.TZ = 'America/New_York'

import { afterEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, requestBody, responses } from '../test/utils'
import { SURF_SPOTS } from '../data/surfSpots'
import { CHANGED_ELSEWHERE_MESSAGE, TIME_ZONE_NOTE } from './StatusPage'

const ME = 'GET /api/v1/auth/me'
const GET = 'GET /api/v1/availability/me'
const POST = 'POST /api/v1/availability/me'
const PUT = 'PUT /api/v1/availability/me'
const SPOTS = 'GET /api/v1/surf-spots'

const CARCAVELOS = SURF_SPOTS.find((spot) => spot.id === 'pt-cascais-carcavelos')
const GUINCHO = SURF_SPOTS.find((spot) => spot.id === 'pt-cascais-guincho')
const TEN_AM = '2026-07-15T09:00:00Z' // 10:00 Lisbon (summer)

const availability = (fields) => ({
  status: 'ACTIVE',
  state: 'available',
  isAvailable: true,
  spot: null,
  arrival: null,
  expiresAt: '2026-07-15T23:00:00.000Z',
  updatedAt: '2026-07-15T09:00:00.000Z',
  ...fields,
})
const SAVED = {
  active: availability({}),
  activeWithSpot: availability({ spot: CARCAVELOS }),
  relative: availability({
    status: 'COMING_SOON',
    spot: CARCAVELOS,
    arrival: { type: 'relative', minutes: 120, arrivesAt: '2026-07-15T11:00:00.000Z' },
    expiresAt: '2026-07-15T12:00:00.000Z',
  }),
  window: availability({
    status: 'COMING_SOON',
    spot: CARCAVELOS,
    arrival: { type: 'window', startHour: 9, startsAt: '2026-07-15T08:00:00.000Z', endsAt: '2026-07-15T10:00:00.000Z' },
    expiresAt: '2026-07-15T11:00:00.000Z',
  }),
  atSpot: availability({ status: 'AT_SPOT', spot: GUINCHO, expiresAt: '2026-07-15T12:00:00.000Z' }),
  off: availability({ status: 'OFF', state: 'off', isAvailable: false, expiresAt: null }),
}
const expired = (saved) => ({ ...saved, state: 'expired', isAvailable: false })

const location = () => screen.getByTestId('location').textContent
const radio = (name) => screen.getByRole('radio', { name })
const spotField = () => screen.queryByRole('combobox', { name: /surf spot/i })
// The arrival field is a button (label + current choice); its choices open inline
const arrivalField = () => screen.queryByRole('button', { name: /^Approximate arrival time/ })
const arrivalValue = () => arrivalField().querySelector('[id$="-value"]').textContent
async function chooseArrival(user, label) {
  await user.click(arrivalField())
  await user.click(screen.getByRole('radio', { name: label }))
}
const saveButton = () => screen.getByRole('form', { name: 'Set your availability' }).querySelector('button[type="submit"]')
const summary = () => screen.getByRole('region', { name: 'Current status' })
const calls = (fetchMock, key) => fetchMock.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === key)

function setTime(iso) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) })
}

async function openStatus({ saved = null, time = TEN_AM, routes = {} } = {}) {
  setTime(time)
  const fetchMock = mockApi({
    [ME]: () => responses.signedIn(),
    [GET]: () => jsonResponse(200, { availability: saved }),
    [SPOTS]: () => jsonResponse(200, { spots: SURF_SPOTS }),
    ...routes,
  })
  renderApp('/status')
  await screen.findByRole('form', { name: 'Set your availability' })
  return fetchMock
}

async function chooseSpot(user, spot) {
  await waitFor(() => expect(spotField().disabled).toBe(false))
  await user.click(spotField())
  await user.click(screen.getByRole('option', { name: new RegExp(spot.name) }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('rendering the saved availability', () => {
  test('page heading and Figma texts', async () => {
    await openStatus()
    expect(screen.getByRole('heading', { name: 'Your surf availability' })).toBeTruthy()
    expect(screen.getByText('Set your availability and update or deactivate it any time.')).toBeTruthy()
    expect(screen.queryByText(/No GPS needed/)).toBeNull()
    expect(document.querySelector('main img[src*="status-ocean"]')).toBeTruthy()
  })

  test('no availability yet: a welcoming empty state, nothing selected', async () => {
    await openStatus()
    expect(within(summary()).getByText('No status yet')).toBeTruthy()
    for (const name of [/^Active/, /^Coming Soon/, /^At the Spot/, /^Off/]) expect(radio(name).checked).toBe(false)
    expect(spotField()).toBeNull()
    expect(arrivalField()).toBeNull()
  })

  test('Active with a preferred spot, until midnight', async () => {
    await openStatus({ saved: SAVED.activeWithSpot })
    expect(within(summary()).getByText('Active')).toBeTruthy()
    expect(within(summary()).getByText('Preferred spot: Praia de Carcavelos')).toBeTruthy()
    expect(within(summary()).getByText('Shown as available until midnight')).toBeTruthy()
    expect(radio(/^Active/).checked).toBe(true)
  })

  test('Coming Soon (relative): arrival and expiry in Lisbon time', async () => {
    await openStatus({ saved: SAVED.relative })
    expect(within(summary()).getByText('Arriving around 12:00')).toBeTruthy()
    expect(within(summary()).getByText('Shown as available until 13:00')).toBeTruthy()
    expect(arrivalValue()).toBe('In about 2 hours')
  })

  test('Coming Soon (window)', async () => {
    await openStatus({ saved: SAVED.window })
    expect(within(summary()).getByText('Arriving between 09:00 and 11:00')).toBeTruthy()
    expect(arrivalValue()).toBe('09:00–11:00')
  })

  test('At the Spot', async () => {
    await openStatus({ saved: SAVED.atSpot })
    expect(within(summary()).getByText('At the Spot')).toBeTruthy()
    expect(within(summary()).getByText('Praia do Guincho')).toBeTruthy()
    expect(within(summary()).getByText('Shown as available until 13:00')).toBeTruthy()
  })

  test('Off: unavailable, no old spot or arrival', async () => {
    await openStatus({ saved: SAVED.off })
    expect(within(summary()).getByText('Off')).toBeTruthy()
    expect(within(summary()).getByText(/not shown as available/)).toBeTruthy()
    expect(within(summary()).queryByText(/Arriving|until/)).toBeNull()
    expect(radio(/^Off/).checked).toBe(true)
    expect(spotField()).toBeNull()
  })

  test('expired: says it has ended, never shown as available', async () => {
    await openStatus({ saved: expired(SAVED.atSpot), time: '2026-07-15T13:00:00Z' })
    expect(within(summary()).getByText('Your At the Spot status has ended')).toBeTruthy()
    expect(within(summary()).getByText(/It ended at 13:00/)).toBeTruthy()
    expect(within(summary()).queryByText(/Shown as available/)).toBeNull()
    expect(radio(/^At the Spot/).checked).toBe(true) // preselected for quick reactivation
  })

  test('winter time is shown correctly too', async () => {
    await openStatus({
      time: '2026-12-15T09:00:00Z',
      saved: availability({
        status: 'COMING_SOON',
        spot: CARCAVELOS,
        arrival: { type: 'relative', minutes: 120, arrivesAt: '2026-12-15T11:00:00.000Z' },
        expiresAt: '2026-12-15T12:00:00.000Z',
      }),
    })
    expect(within(summary()).getByText('Arriving around 11:00')).toBeTruthy()
    expect(within(summary()).getByText('Shown as available until 12:00')).toBeTruthy()
  })

  test('loading, then a load error with a working retry', async () => {
    setTime(TEN_AM)
    let fail = true
    mockApi({
      [ME]: () => responses.signedIn(),
      [GET]: () => (fail ? responses.networkError() : jsonResponse(200, { availability: null })),
      [SPOTS]: () => jsonResponse(200, { spots: SURF_SPOTS }),
    })
    const user = userEvent.setup()
    renderApp('/status')
    expect(await screen.findByText('We couldn’t load your availability')).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Set your availability' })).toBeNull()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No status yet')).toBeTruthy()
  })
})

describe('choosing a status', () => {
  test('each status shows only its own fields', async () => {
    const user = userEvent.setup()
    await openStatus()

    await user.click(radio(/^Active/))
    expect(screen.getByRole('combobox', { name: 'Preferred surf spot (Optional)' })).toBeTruthy()
    expect(screen.getByText('You can leave this empty if you’re open to different spots.')).toBeTruthy()
    expect(spotField().getAttribute('placeholder')).toBe('Choose a preferred spot')
    expect(arrivalField()).toBeNull()

    await user.click(radio(/^Coming Soon/))
    expect(screen.getByRole('combobox', { name: /^Surf spot/ }).getAttribute('placeholder')).toBe('Choose a spot')
    expect(arrivalField()).toBeTruthy()
    expect(screen.getByText(TIME_ZONE_NOTE)).toBeTruthy()

    await user.click(radio(/^At the Spot/))
    expect(spotField()).toBeTruthy()
    expect(arrivalField()).toBeNull()
    expect(screen.queryByText(TIME_ZONE_NOTE)).toBeNull()

    await user.click(radio(/^Off/))
    expect(spotField()).toBeNull()
    expect(arrivalField()).toBeNull()
  })

  test('selecting a status does not save anything', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ saved: SAVED.active })
    await user.click(radio(/^Off/))
    expect(calls(fetchMock, PUT)).toHaveLength(0)
    expect(within(summary()).getByText('Active')).toBeTruthy()
  })

  test('keyboard: arrow keys move through the status options', async () => {
    const user = userEvent.setup()
    await openStatus({ saved: SAVED.active })
    radio(/^Active/).focus()
    await user.keyboard('{ArrowDown}')
    expect(radio(/^Coming Soon/).checked).toBe(true)
    expect(document.activeElement).toBe(radio(/^Coming Soon/))
  })

  test('options have their descriptions and the selection is not shown by colour alone', async () => {
    await openStatus({ saved: SAVED.active })
    const active = radio(/^Active/)
    expect(document.getElementById(active.getAttribute('aria-describedby')).textContent).toBe('Open to surfing sometime today.')
    expect(radio(/^Off/).getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText('Not available for a surf session.')).toBeTruthy()
    expect(active.closest('label').querySelector('svg.lucide-check')).toBeTruthy()
    expect(radio(/^Off/).closest('label').querySelector('svg.lucide-check')).toBeNull()
    expect(screen.queryByText('Invisible / Off')).toBeNull()
  })
})

describe('validation', () => {
  test('a status is required', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus()
    await user.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a status.')
    expect(calls(fetchMock, POST)).toHaveLength(0)
  })

  test('Coming Soon and At the Spot need a spot; Coming Soon an arrival', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus()
    await user.click(radio(/^At the Spot/))
    await user.click(saveButton())
    expect(screen.getByText('Choose a surf spot.')).toBeTruthy()
    expect(document.activeElement).toBe(spotField())

    await user.click(radio(/^Coming Soon/))
    await user.click(saveButton())
    expect(screen.getByText('Choose when you expect to arrive.')).toBeTruthy()
    expect(calls(fetchMock, POST)).toHaveLength(0)
  })

  test('Active can be saved without a spot', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ routes: { [POST]: () => jsonResponse(201, { availability: SAVED.active }) } })
    await user.click(radio(/^Active/))
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, POST)).toHaveLength(1))
    expect(requestBody(fetchMock, POST)).toEqual({ status: 'ACTIVE' })
  })
})

describe('arrival choices', () => {
  const windowOption = (label) => screen.getByRole('radio', { name: new RegExp(`^${label}`) })

  test('at 09:40 Lisbon a started window is selectable, ended ones are not', async () => {
    const user = userEvent.setup()
    await openStatus({ time: '2026-07-15T08:40:00Z' })
    await user.click(radio(/^Coming Soon/))
    await user.click(arrivalField())
    expect(windowOption('09:00–11:00').disabled).toBe(false)
    expect(windowOption('07:00–09:00').disabled).toBe(true)
    expect(windowOption('07:00–09:00').closest('label').textContent).toBe('07:00–09:00 (ended)')
    expect(screen.getByRole('radio', { name: 'In about 1 hour' }).disabled).toBe(false)
  })

  test('relative and window arrivals are sent as choices, never times', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({
      saved: SAVED.active,
      routes: { [PUT]: () => jsonResponse(200, { availability: SAVED.relative }) },
    })
    await user.click(radio(/^Coming Soon/))
    await chooseSpot(user, CARCAVELOS)
    await chooseArrival(user, 'In about 2 hours')
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(1))
    expect(requestBody(fetchMock, PUT)).toEqual({ status: 'COMING_SOON', spotId: CARCAVELOS.id, arrival: { type: 'relative', minutes: 120 } })

    await chooseArrival(user, '13:00–15:00')
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(2))
    expect(requestBody(fetchMock, PUT, 1)).toEqual({ status: 'COMING_SOON', spotId: CARCAVELOS.id, arrival: { type: 'window', startHour: 13 } })
  })

  test('a chosen window that ends while the form is open is caught before saving', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ saved: SAVED.atSpot, time: '2026-07-15T09:50:00Z' }) // 10:50 Lisbon
    await user.click(radio(/^Coming Soon/))
    await chooseArrival(user, '09:00–11:00')
    setTime('2026-07-15T10:01:00Z') // 11:01 Lisbon
    await user.click(saveButton())
    expect(await screen.findByText('That time has passed. Choose another arrival time.')).toBeTruthy()
    expect(calls(fetchMock, PUT)).toHaveLength(0)
  })

  test('the server’s reason is shown when it rejects an arrival', async () => {
    const user = userEvent.setup()
    await openStatus({
      saved: SAVED.relative,
      routes: {
        [PUT]: () =>
          jsonResponse(400, {
            status: 'error',
            message: 'Please check the availability details.',
            errors: { arrival: 'That arrival window has already ended. Choose a later window or a relative time.' },
          }),
      },
    })
    await user.click(saveButton())
    expect(await screen.findByText(/That arrival window has already ended/)).toBeTruthy()
  })
})

describe('Active preferred spot', () => {
  test('add, change and remove a preferred spot', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({
      saved: SAVED.active,
      routes: { [PUT]: (options) => jsonResponse(200, { availability: availability({ spot: JSON.parse(options.body).spotId === GUINCHO.id ? GUINCHO : JSON.parse(options.body).spotId ? CARCAVELOS : null }) }) },
    })
    await chooseSpot(user, CARCAVELOS)
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(1))
    expect(requestBody(fetchMock, PUT)).toEqual({ status: 'ACTIVE', spotId: CARCAVELOS.id })

    await user.click(screen.getByRole('button', { name: 'Clear preferred surf spot' }))
    await chooseSpot(user, GUINCHO)
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(2))
    expect(requestBody(fetchMock, PUT, 1)).toEqual({ status: 'ACTIVE', spotId: GUINCHO.id })

    await user.click(screen.getByRole('button', { name: 'Clear preferred surf spot' }))
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(3))
    expect(requestBody(fetchMock, PUT, 2)).toEqual({ status: 'ACTIVE' })
    expect(within(summary()).queryByText(/Preferred spot/)).toBeNull()
  })
})

describe('saving', () => {
  test('first status: POST, then the summary shows the server’s answer', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ routes: { [POST]: () => jsonResponse(201, { availability: SAVED.atSpot }) } })
    await user.click(radio(/^At the Spot/))
    await chooseSpot(user, GUINCHO)
    await user.click(saveButton())
    expect(await screen.findByText('Your availability has been saved.')).toBeTruthy()
    expect(requestBody(fetchMock, POST)).toEqual({ status: 'AT_SPOT', spotId: GUINCHO.id })
    expect(calls(fetchMock, PUT)).toHaveLength(0)
    expect(within(summary()).getByText('Praia do Guincho')).toBeTruthy()
  })

  for (const [name, saved] of [
    ['an available', SAVED.active],
    ['an expired', expired(SAVED.atSpot)],
    ['an Off', SAVED.off],
  ]) {
    test(`${name} record is changed with PUT`, async () => {
      const user = userEvent.setup()
      const fetchMock = await openStatus({ saved, routes: { [PUT]: () => jsonResponse(200, { availability: SAVED.active }) } })
      await user.click(radio(/^Active/))
      await user.click(saveButton())
      await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(1))
      expect(calls(fetchMock, POST)).toHaveLength(0)
    })
  }

  test('switching to Off sends only the status, dropping the old spot and arrival', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ saved: SAVED.relative, routes: { [PUT]: () => jsonResponse(200, { availability: SAVED.off }) } })
    await user.click(radio(/^Off/))
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(1))
    expect(requestBody(fetchMock, PUT)).toEqual({ status: 'OFF' })
    expect(await within(summary()).findByText(/not shown as available/)).toBeTruthy()
  })

  test('Coming Soon → At the Spot drops the arrival', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ saved: SAVED.relative, routes: { [PUT]: () => jsonResponse(200, { availability: SAVED.atSpot }) } })
    await user.click(radio(/^At the Spot/))
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(1))
    expect(requestBody(fetchMock, PUT)).toEqual({ status: 'AT_SPOT', spotId: CARCAVELOS.id })
  })

  test('Cancel restores the saved choices without a request', async () => {
    const user = userEvent.setup()
    const fetchMock = await openStatus({ saved: SAVED.relative })
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await user.click(radio(/^Off/))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(radio(/^Coming Soon/).checked).toBe(true)
    expect(arrivalValue()).toBe('In about 2 hours')
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(calls(fetchMock, PUT)).toHaveLength(0)
  })

  test('a failed save keeps the choices and the old summary', async () => {
    const user = userEvent.setup()
    await openStatus({ saved: SAVED.active, routes: { [PUT]: responses.networkError } })
    await user.click(radio(/^Off/))
    await user.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
    expect(radio(/^Off/).checked).toBe(true)
    expect(within(summary()).getByText('Active')).toBeTruthy()
    expect(saveButton().disabled).toBe(false)
  })

  test('duplicate submissions are blocked while saving', async () => {
    const user = userEvent.setup()
    let finish
    const fetchMock = await openStatus({ saved: SAVED.active, routes: { [PUT]: () => new Promise((resolve) => (finish = resolve)) } })
    await user.click(radio(/^Off/))
    await user.click(saveButton())
    expect(saveButton().disabled).toBe(true)
    expect(saveButton().textContent).toMatch(/Saving/)
    screen.getByRole('form', { name: 'Set your availability' }).requestSubmit()
    expect(calls(fetchMock, PUT)).toHaveLength(1)
    finish(jsonResponse(200, { availability: SAVED.off }))
    expect(await screen.findByText('Your availability has been saved.')).toBeTruthy()
  })

  test('409 on POST (created elsewhere): reload, explain, and the next save is a PUT', async () => {
    const user = userEvent.setup()
    let getCalls = 0
    const fetchMock = await openStatus({
      routes: {
        [GET]: () => jsonResponse(200, { availability: ++getCalls === 1 ? null : SAVED.atSpot }),
        [POST]: () => jsonResponse(409, { status: 'error', code: 'AVAILABILITY_EXISTS', message: 'You already have an availability status.' }),
        [PUT]: () => jsonResponse(200, { availability: SAVED.active }),
      },
    })
    await user.click(radio(/^Active/))
    await user.click(saveButton())
    expect(await screen.findByText(CHANGED_ELSEWHERE_MESSAGE)).toBeTruthy()
    expect(within(summary()).getByText('Praia do Guincho')).toBeTruthy()
    expect(radio(/^Active/).checked).toBe(true) // the surfer's choice is kept
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, PUT)).toHaveLength(1))
  })

  test('404 on PUT (removed elsewhere): reload, and the next save is a POST', async () => {
    const user = userEvent.setup()
    let getCalls = 0
    const fetchMock = await openStatus({
      routes: {
        [GET]: () => jsonResponse(200, { availability: ++getCalls === 1 ? SAVED.active : null }),
        [PUT]: () => jsonResponse(404, { status: 'error', code: 'AVAILABILITY_NOT_FOUND', message: 'You haven’t set an availability status yet.' }),
        [POST]: () => jsonResponse(201, { availability: SAVED.off }),
      },
    })
    await user.click(radio(/^Off/))
    await user.click(saveButton())
    expect(await screen.findByText(CHANGED_ELSEWHERE_MESSAGE)).toBeTruthy()
    await user.click(saveButton())
    await waitFor(() => expect(calls(fetchMock, POST)).toHaveLength(1))
  })

  test('an expired session sends the user to log in', async () => {
    const user = userEvent.setup()
    let signedIn = true
    await openStatus({
      saved: SAVED.active,
      routes: {
        [ME]: () => (signedIn ? responses.signedIn() : responses.signedOut()),
        [PUT]: () => {
          signedIn = false
          return responses.signedOut()
        },
      },
    })
    await user.click(radio(/^Off/))
    await user.click(saveButton())
    await waitFor(() => expect(location()).toMatch(/^\/login/))
  })
})

describe('expiry while the page is open', () => {
  test('when the status expires, the page asks the server again and shows it has ended', async () => {
    let getCalls = 0
    const soon = new Date(new Date(TEN_AM).getTime() + 500).toISOString()
    await openStatus({
      routes: {
        [GET]: () =>
          jsonResponse(200, {
            availability: ++getCalls === 1 ? { ...SAVED.atSpot, expiresAt: soon } : expired({ ...SAVED.atSpot, expiresAt: soon }),
          }),
      },
    })
    expect(within(summary()).getByText('At the Spot')).toBeTruthy()
    expect(await screen.findByText('Your At the Spot status has ended', {}, { timeout: 4000 })).toBeTruthy()
    expect(getCalls).toBe(2)
  })
})
