import { describe, expect, test } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, requestBody, responses } from '../test/utils'
import { SURF_SPOTS } from '../data/surfSpots'

const ME = 'GET /api/v1/auth/me'
const MY_PROFILE = 'GET /api/v1/profile/me'
const SAVE = 'PUT /api/v1/profile/me'
const SPOTS = 'GET /api/v1/surf-spots'

// Same shape as GET /api/v1/surf-spots
const API_SPOTS = SURF_SPOTS.slice(0, 5)
const [SPOT_A, SPOT_B, SPOT_C, SPOT_D] = API_SPOTS

const location = () => screen.getByTestId('location').textContent
const saveCalls = (fetchMock) => fetchMock.mock.calls.filter(([url, options = {}]) => url === '/api/v1/profile/me' && options.method === 'PUT')

const savedProfile = (fields = {}) =>
  jsonResponse(201, { profile: { userId: 'u1', displayName: 'Kai', skillLevel: 'beginner', boardType: null, about: null, avatarUrl: null, favoriteSpots: [], ...fields } })

// Opens /create-profile as a signed-in user without a profile. After a
// successful save, GET /auth/me reports the profile as complete (unless
// `confirmAfterSave` is false).
async function openCreateProfile({ save = () => savedProfile(), spots = () => jsonResponse(200, { spots: API_SPOTS }), confirmAfterSave = true, routes = {} } = {}) {
  let profileSaved = false
  const fetchMock = mockApi({
    [ME]: () => responses.signedIn(undefined, { hasCompletedProfile: profileSaved && confirmAfterSave }),
    [MY_PROFILE]: () => jsonResponse(200, { profile: null }),
    [SPOTS]: spots,
    [SAVE]: async (options) => {
      const response = await save(options)
      if (response.ok) profileSaved = true
      return response
    },
    ...routes,
  })
  renderApp('/create-profile')
  await screen.findByRole('heading', { name: 'Tell us about your surfing' })
  return fetchMock
}

const nameField = () => screen.getByLabelText(/^display name/i)
const levelField = () => screen.getByLabelText(/^surf level/i)
const boardField = () => screen.getByLabelText(/^board/i)
const aboutField = () => screen.getByLabelText(/^about/i)
const spotField = () => screen.getByRole('combobox', { name: /favorite surf spots/i })
const saveButton = () => screen.getByRole('button', { name: /save profile|saving profile/i })

async function waitForSpots() {
  await waitFor(() => expect(spotField().disabled).toBe(false))
}

async function addSpot(user, spot) {
  await user.click(spotField())
  await user.click(screen.getByRole('option', { name: new RegExp(spot.name) }))
}

const chosenSpotNames = () => {
  const list = screen.queryByRole('list', { name: 'Chosen favorite spots' })
  return list ? within(list).getAllByRole('listitem').map((item) => item.textContent) : []
}

async function fillRequired(user, { name = 'Kai Silva', level = 'intermediate' } = {}) {
  await user.type(nameField(), name)
  await user.selectOptions(levelField(), level)
}

describe('Create Profile form', () => {
  test('shows the Figma fields, a non-interactive photo placeholder and no upload control', async () => {
    await openCreateProfile()
    expect(screen.getByText('Complete surfer profile')).toBeTruthy()
    expect(nameField()).toBeTruthy()
    expect(levelField()).toBeTruthy()
    expect(boardField()).toBeTruthy()
    expect(spotField()).toBeTruthy()
    expect(aboutField()).toBeTruthy()
    expect(screen.getByText(/Photo uploads are coming soon/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /photo/i })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  test('shows the Figma onboarding photo (decorative)', async () => {
    await openCreateProfile()
    const photos = [...document.querySelectorAll('main img')]
    expect(photos).toHaveLength(1)
    expect(photos[0].getAttribute('src')).toMatch(/onboarding-ocean/)
    expect(photos[0].getAttribute('alt')).toBe('')
  })

  test('no error messages before the user interacts', async () => {
    await openCreateProfile()
    expect(screen.queryByText(/is required|Choose your surf level/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('display name and skill level are required; nothing is sent', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await user.click(saveButton())
    expect(screen.getByText('Display name is required.')).toBeTruthy()
    expect(screen.getByText('Choose your surf level.')).toBeTruthy()
    expect(document.activeElement).toBe(nameField())
    expect(nameField().getAttribute('aria-invalid')).toBe('true')
    expect(saveCalls(fetchMock)).toHaveLength(0)
  })

  test('a whitespace-only display name is rejected', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user, { name: '     ' })
    await user.click(saveButton())
    expect(screen.getByText('Display name is required.')).toBeTruthy()
    expect(saveCalls(fetchMock)).toHaveLength(0)
  })

  test('a display name over 50 characters is rejected; 50 is accepted', async () => {
    const user = userEvent.setup()
    await openCreateProfile()
    await user.type(nameField(), 'a'.repeat(51))
    await user.tab()
    expect(screen.getByText('Display name must be at most 50 characters.')).toBeTruthy()
    await user.type(nameField(), '{Backspace}')
    expect(screen.queryByText('Display name must be at most 50 characters.')).toBeNull()
  })

  test('the error shows after leaving the field, then updates while typing', async () => {
    const user = userEvent.setup()
    await openCreateProfile()
    await user.click(nameField())
    await user.tab()
    expect(screen.getByText('Display name is required.')).toBeTruthy()
    await user.type(nameField(), 'K')
    expect(screen.queryByText('Display name is required.')).toBeNull()
  })

  test('the skill level offers exactly the backend values', async () => {
    await openCreateProfile()
    const values = [...levelField().options].map((option) => option.value).filter(Boolean)
    expect(values).toEqual(['beginner', 'intermediate', 'advanced'])
  })

  test.each(['beginner', 'intermediate', 'advanced'])('skill level "%s" is accepted and sent as is', async (level) => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user, { level })
    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE).skillLevel).toBe(level)
  })

  test('board types are the existing supported options', async () => {
    await openCreateProfile()
    const values = [...boardField().options].map((option) => option.value).filter(Boolean)
    expect(values).toEqual(['shortboard', 'fish', 'funboard', 'mid-length', 'longboard', 'mini-malibu', 'soft-top', 'gun', 'other'])
  })

  test('About shows a counter and rejects more than 500 characters', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user)
    await user.click(aboutField())
    await user.paste('x'.repeat(501))
    expect(screen.getByText('About must be at most 500 characters.')).toBeTruthy()
    expect(screen.getByText(/501\/500 characters/)).toBeTruthy()
    await user.click(saveButton())
    expect(saveCalls(fetchMock)).toHaveLength(0)
    expect(document.activeElement).toBe(aboutField())

    await user.type(aboutField(), '{Backspace}')
    expect(screen.queryByText('About must be at most 500 characters.')).toBeNull()
  })
})

describe('optional labels, Board dropdown and spelling', () => {
  const labelOf = (field) => document.querySelector(`label[for="${field.id}"]`)

  test('"(Optional)" appears beside the three optional labels, in normal weight and muted color', async () => {
    await openCreateProfile()
    for (const field of [boardField(), spotField(), aboutField()]) {
      const indicator = within(labelOf(field)).getByText('(Optional)')
      expect(indicator.className).toMatch(/font-normal/)
      expect(indicator.className).toMatch(/text-muted/)
      expect(labelOf(field).className).toMatch(/font-bold/)
    }
    expect(screen.getByLabelText('Board (Optional)')).toBe(boardField())
    expect(screen.getByLabelText('About (Optional)')).toBe(aboutField())
    expect(screen.getByRole('combobox', { name: 'Favorite surf spots (Optional)' })).toBe(spotField())
  })

  test('required labels keep their asterisk and have no optional indicator', async () => {
    await openCreateProfile()
    for (const field of [nameField(), levelField()]) {
      expect(labelOf(field).textContent).toMatch(/\*$/)
      expect(labelOf(field).textContent).not.toMatch(/Optional/)
    }
  })

  test('no standalone "Optional." helper text; useful helper text stays', async () => {
    await openCreateProfile()
    await waitForSpots()
    expect(screen.queryByText(/^Optional\.?/)).toBeNull()
    expect(screen.getByText('Choose up to 3 spots where you usually surf.')).toBeTruthy()
    expect(screen.getByText('0/500 characters.')).toBeTruthy()
    expect(screen.getByText('Up to 50 characters.')).toBeTruthy()
    expect(boardField().getAttribute('aria-describedby')).toBeNull()
  })

  test('Board starts empty with the placeholder, which is not a board type', async () => {
    await openCreateProfile()
    expect(boardField().value).toBe('')
    const placeholder = boardField().options[boardField().selectedIndex]
    expect(placeholder.textContent).toBe('Select your board type')
    expect(placeholder.hidden).toBe(true)
    expect([...boardField().options].some((option) => option.textContent.startsWith('Longboard, shortboard'))).toBe(false)
    expect([...boardField().options].map((option) => option.textContent)).toContain('No board selected')
  })

  test('a board can be selected and cleared again; cleared is sent as null', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user)

    await user.selectOptions(boardField(), 'longboard')
    expect(boardField().value).toBe('longboard')
    await user.selectOptions(boardField(), 'No board selected')
    expect(boardField().value).toBe('')
    expect(boardField().options[boardField().selectedIndex].textContent).toBe('Select your board type')

    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE).boardType).toBeNull()
  })

  test('a selected board is sent as its backend value', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user)
    await user.selectOptions(boardField(), 'Soft-top / Foamboard')
    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE).boardType).toBe('soft-top')
  })

  test('the page uses American spelling ("Favorite")', async () => {
    await openCreateProfile()
    await waitForSpots()
    expect(screen.getByText('Favorite surf spots')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/favourite/i)
  })
})

describe('favorite spots', () => {
  test('spots are loaded from GET /api/v1/surf-spots', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await waitForSpots()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/surf-spots')).toBe(true)
    await user.click(spotField())
    const results = screen.getByRole('listbox', { name: /favorite surf spots results/i })
    expect(within(results).getAllByRole('option')).toHaveLength(API_SPOTS.length)
  })

  test('zero spots is fine (sent as an empty list)', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await waitForSpots()
    await fillRequired(user)
    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE).favoriteSpotIds).toEqual([])
  })

  test('up to 3 spots can be chosen; a fourth shows the limit message and is not added', async () => {
    const user = userEvent.setup()
    await openCreateProfile()
    await waitForSpots()
    await addSpot(user, SPOT_A)
    await addSpot(user, SPOT_B)
    await addSpot(user, SPOT_C)
    expect(chosenSpotNames()).toEqual([SPOT_A.name, SPOT_B.name, SPOT_C.name])
    expect(screen.queryByText('Choose a maximum of 3 favorite spots.')).toBeNull()

    await addSpot(user, SPOT_D)
    expect(screen.getAllByText('Choose a maximum of 3 favorite spots.').length).toBeGreaterThan(0)
    expect(chosenSpotNames()).toHaveLength(3)

    // Removing one clears the message and makes room again
    await user.click(screen.getByRole('button', { name: `Remove ${SPOT_A.name}` }))
    expect(screen.queryByText('Choose a maximum of 3 favorite spots.')).toBeNull()
    await addSpot(user, SPOT_D)
    expect(chosenSpotNames()).toEqual([SPOT_B.name, SPOT_C.name, SPOT_D.name])
  })

  test('a chosen spot is not offered again, so it cannot be sent twice', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await waitForSpots()
    await addSpot(user, SPOT_A)
    await user.click(spotField())
    expect(screen.queryByRole('option', { name: new RegExp(SPOT_A.name) })).toBeNull()

    await fillRequired(user)
    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE).favoriteSpotIds).toEqual([SPOT_A.id])
  })

  test('only ids of loaded spots can be chosen (no free text is submitted)', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await waitForSpots()
    await user.type(spotField(), 'Nowhere beach{Enter}')
    await user.tab()
    expect(chosenSpotNames()).toEqual([])
    await fillRequired(user)
    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE).favoriteSpotIds).toEqual([])
  })

  test('if spots fail to load, the user can retry and still save the profile', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openCreateProfile({
      spots: () => {
        if (fail) throw new TypeError('Failed to fetch')
        return jsonResponse(200, { spots: API_SPOTS })
      },
    })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t load the surf spots/)
    expect(spotField().disabled).toBe(true)

    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitForSpots()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/surf-spots')).toHaveLength(2)
  })

  test('saving still works when no spots could be loaded', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile({ spots: responses.serverError })
    await screen.findByRole('alert')
    await fillRequired(user)
    await user.click(saveButton())
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(requestBody(fetchMock, SAVE).favoriteSpotIds).toEqual([])
  })
})

describe('saving the profile', () => {
  test('sends exactly the supported fields, normalized, then goes to Discover', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await waitForSpots()

    await user.type(nameField(), '  Kai   Silva ')
    await user.selectOptions(levelField(), 'advanced')
    await user.selectOptions(boardField(), 'fish')
    await addSpot(user, SPOT_B)
    await addSpot(user, SPOT_A)
    await user.type(aboutField(), '  Dawn patrol fan.  ')
    await user.click(saveButton())

    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(location()).toBe('/discover')

    const saveCall = saveCalls(fetchMock)[0]
    expect(saveCall[1].credentials).toBe('include')
    expect(requestBody(fetchMock, SAVE)).toEqual({
      displayName: 'Kai Silva',
      skillLevel: 'advanced',
      boardType: 'fish',
      about: 'Dawn patrol fan.',
      favoriteSpotIds: [SPOT_B.id, SPOT_A.id],
    })
    expect(Object.keys(requestBody(fetchMock, SAVE))).not.toContain('avatarUrl')
    expect(Object.keys(requestBody(fetchMock, SAVE))).not.toContain('avatarPublicId')
  })

  test('empty optional fields are sent as null', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user)
    await user.type(aboutField(), '   ')
    await user.click(saveButton())
    await waitFor(() => expect(saveCalls(fetchMock)).toHaveLength(1))
    expect(requestBody(fetchMock, SAVE)).toMatchObject({ boardType: null, about: null })
  })

  test('after saving, the profile status is confirmed with GET /auth/me before moving on', async () => {
    const user = userEvent.setup()
    const fetchMock = await openCreateProfile()
    await fillRequired(user)
    await user.click(saveButton())
    await screen.findByRole('heading', { name: 'Discover' })
    const urls = fetchMock.mock.calls.map(([url, options = {}]) => `${options.method ?? 'GET'} ${url}`)
    expect(urls.indexOf(ME, urls.indexOf(SAVE))).toBeGreaterThan(urls.indexOf(SAVE))
  })

  test('if the server does not confirm the profile, the user stays with a message', async () => {
    const user = userEvent.setup()
    await openCreateProfile({ confirmAfterSave: false })
    await fillRequired(user)
    await user.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t confirm it yet/)
    expect(location()).toBe('/create-profile')
    expect(nameField().value).toBe('Kai Silva')
  })

  test('backend validation errors are shown on their fields', async () => {
    const user = userEvent.setup()
    await openCreateProfile({
      save: () =>
        jsonResponse(400, {
          status: 'error',
          message: 'Please check the profile details.',
          errors: { displayName: 'Display name contains invalid characters.', favoriteSpotIds: 'Unknown surf spot: pt-x.' },
        }),
    })
    await fillRequired(user)
    await user.click(saveButton())
    expect(await screen.findByText('Display name contains invalid characters.')).toBeTruthy()
    expect(screen.getByText('Unknown surf spot: pt-x.')).toBeTruthy()
    expect(document.activeElement).toBe(nameField())
    expect(location()).toBe('/create-profile')

    // Editing the field clears its server error
    await user.type(nameField(), 'x')
    expect(screen.queryByText('Display name contains invalid characters.')).toBeNull()
  })

  test('a network failure keeps every value and allows a retry', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openCreateProfile({
      save: () => {
        if (fail) throw new TypeError('Failed to fetch')
        return savedProfile()
      },
    })
    await waitForSpots()
    await fillRequired(user)
    await user.selectOptions(boardField(), 'longboard')
    await addSpot(user, SPOT_C)
    await user.type(aboutField(), 'Sunset sessions')
    await user.click(saveButton())

    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
    expect(nameField().value).toBe('Kai Silva')
    expect(levelField().value).toBe('intermediate')
    expect(boardField().value).toBe('longboard')
    expect(aboutField().value).toBe('Sunset sessions')
    expect(chosenSpotNames()).toEqual([SPOT_C.name])
    expect(saveButton().disabled).toBe(false)

    fail = false
    await user.click(saveButton())
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(saveCalls(fetchMock)).toHaveLength(2)
  })

  test('a server error shows a friendly message and keeps the values', async () => {
    const user = userEvent.setup()
    await openCreateProfile({ save: responses.serverError })
    await fillRequired(user)
    await user.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong on our side/)
    expect(nameField().value).toBe('Kai Silva')
  })

  test('prevents duplicate submissions while saving', async () => {
    const user = userEvent.setup()
    let finish
    const fetchMock = await openCreateProfile({ save: () => new Promise((resolve) => (finish = resolve)) })
    await fillRequired(user)
    await user.click(saveButton())

    expect(saveButton().disabled).toBe(true)
    expect(saveButton().textContent).toMatch(/Saving profile/)
    screen.getByRole('form', { name: 'Create your surfer profile' }).requestSubmit()
    await user.click(saveButton())
    expect(saveCalls(fetchMock)).toHaveLength(1)

    finish(savedProfile())
    expect(await screen.findByRole('heading', { name: 'Discover' })).toBeTruthy()
    expect(saveCalls(fetchMock)).toHaveLength(1)
  })

  test('the profile is not created automatically: nothing is saved without submitting', async () => {
    const fetchMock = await openCreateProfile()
    await waitForSpots()
    expect(saveCalls(fetchMock)).toHaveLength(0)
  })
})
