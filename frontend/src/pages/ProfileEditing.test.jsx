import { describe, expect, test } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, requestBody, responses } from '../test/utils'
import { SURF_SPOTS } from '../data/surfSpots'

const ME = 'GET /api/v1/auth/me'
const MY_PROFILE = 'GET /api/v1/profile/me'
const SAVE = 'PUT /api/v1/profile/me'
const SPOTS = 'GET /api/v1/surf-spots'
const UPLOAD = 'POST /api/v1/profile/me/avatar'

const [CARCAVELOS, GUINCHO, SUPERTUBOS, FOURTH] = SURF_SPOTS.filter((spot) =>
  ['pt-cascais-carcavelos', 'pt-cascais-guincho', 'pt-peniche-supertubos', 'pt-sintra-praia-grande'].includes(spot.id),
)

const FULL_PROFILE = {
  userId: 'u1',
  displayName: 'Emma Laurent',
  skillLevel: 'intermediate',
  boardType: 'mid-length',
  about: 'Dawn patrol fan.\nAlways up for a session.',
  avatarUrl: null,
  favoriteSpots: [CARCAVELOS, GUINCHO],
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
}
const EMPTY_OPTIONALS = { ...FULL_PROFILE, boardType: null, about: null, favoriteSpots: [] }

const location = () => screen.getByTestId('location').textContent
const details = () => screen.getByLabelText('Profile details')
const editForm = () => screen.queryByRole('form', { name: 'Edit your surfer profile' })
const saveCalls = (fetchMock) => fetchMock.mock.calls.filter(([url, options = {}]) => url === '/api/v1/profile/me' && options.method === 'PUT')
const nameField = () => screen.getByLabelText(/^display name/i)
const levelField = () => screen.getByLabelText(/^surf level/i)
const boardField = () => screen.getByLabelText(/^board/i)
const aboutField = () => screen.getByLabelText(/^about/i)
const spotField = () => screen.getByRole('combobox', { name: /favorite surf spots/i })
const saveButton = () => editForm().querySelector('button[type="submit"]')
const chosenSpotNames = () => {
  const list = screen.queryByRole('list', { name: 'Chosen favorite spots' })
  return list ? within(list).getAllByRole('listitem').map((item) => item.textContent) : []
}

// Text of one detail row, e.g. "Board: Mid-length"
const row = (label) => within(details()).getByText(`${label}:`, { exact: false }).closest('div').textContent.trim()

async function openProfile({ profile = FULL_PROFILE, save, routes = {} } = {}) {
  const fetchMock = mockApi({
    [ME]: () => responses.signedIn(),
    [MY_PROFILE]: () => jsonResponse(200, { profile }),
    [SPOTS]: () => jsonResponse(200, { spots: SURF_SPOTS }),
    ...(save && { [SAVE]: save }),
    ...routes,
  })
  renderApp('/profile')
  await screen.findByLabelText('Profile details')
  return fetchMock
}

async function startEditing(user) {
  await user.click(screen.getByRole('button', { name: 'Edit profile' }))
  await waitFor(() => expect(spotField().disabled).toBe(false))
}

describe('View mode', () => {
  test('shows the saved profile with readable labels, in the Figma layout', async () => {
    await openProfile()
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeTruthy()
    expect(screen.getByText('Show the surf community who you are.')).toBeTruthy()
    expect(screen.queryByText('More spontaneity, more shared sessions')).toBeNull()
    expect(document.querySelector('main img[src*="profile-ocean"]')).toBeTruthy()
    expect(screen.getByText('Emma Laurent')).toBeTruthy()

    expect(row('Surf level')).toBe('Surf level: Intermediate')
    expect(row('Board')).toBe('Board: Mid-length')
    expect(row('Favorite spots')).toBe(`Favorite spots: ${CARCAVELOS.name}, ${GUINCHO.name}`)
    expect(row('About me')).toBe('About me: Dawn patrol fan.\nAlways up for a session.')
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeTruthy()
    expect(editForm()).toBeNull()
  })

  test('empty optional fields show friendly placeholders', async () => {
    await openProfile({ profile: EMPTY_OPTIONALS })
    expect(row('Board')).toBe('Board: Not specified')
    expect(row('Favorite spots')).toBe('Favorite spots: No favorite spots added')
    expect(row('About me')).toBe('About me: No bio added yet')
  })

  test('nothing about the profile is shown while it loads', async () => {
    let answer
    mockApi({ [ME]: () => responses.signedIn(), [MY_PROFILE]: () => new Promise((resolve) => (answer = resolve)) })
    renderApp('/profile')
    expect(await screen.findByText('Loading your profile…')).toBeTruthy()
    expect(screen.queryByLabelText('Profile details')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull()
    answer(jsonResponse(200, { profile: FULL_PROFILE }))
    expect(await screen.findByLabelText('Profile details')).toBeTruthy()
  })

  test('a missing profile sends the user to onboarding (nothing is created)', async () => {
    let meCalls = 0
    const fetchMock = mockApi({
      [ME]: () => responses.signedIn(undefined, { hasCompletedProfile: ++meCalls === 1 }),
      [MY_PROFILE]: () => jsonResponse(200, { profile: null }),
      [SPOTS]: () => jsonResponse(200, { spots: [] }),
    })
    renderApp('/profile')
    expect(await screen.findByRole('heading', { name: 'Tell us about your surfing' })).toBeTruthy()
    expect(location()).toBe('/create-profile')
    expect(saveCalls(fetchMock)).toHaveLength(0)
  })
})

describe('Edit mode', () => {
  test('opens with the saved values, keeps the photo controls, and focuses the first field', async () => {
    const user = userEvent.setup()
    await openProfile()
    await startEditing(user)

    expect(editForm()).toBeTruthy()
    expect(screen.queryByLabelText('Profile details')).toBeNull()
    expect(nameField().value).toBe('Emma Laurent')
    expect(document.activeElement).toBe(nameField())
    expect(levelField().value).toBe('intermediate')
    expect(boardField().value).toBe('mid-length')
    expect(aboutField().value).toBe('Dawn patrol fan.\nAlways up for a session.')
    expect(chosenSpotNames()).toEqual([CARCAVELOS.name, GUINCHO.name])
    // Same labels as onboarding
    expect(screen.getByLabelText('Board (Optional)')).toBe(boardField())
    expect(screen.getByLabelText('About (Optional)')).toBe(aboutField())
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy()
    // Same heading and subtitle as in View mode
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeTruthy()
    expect(screen.getByText('Show the surf community who you are.')).toBeTruthy()
  })

  test('required fields are validated and nothing is sent', async () => {
    const user = userEvent.setup()
    const fetchMock = await openProfile({ save: () => jsonResponse(200, { profile: FULL_PROFILE }) })
    await startEditing(user)
    await user.clear(nameField())
    await user.type(nameField(), '   ')
    await user.click(saveButton())
    expect(screen.getByText('Display name is required.')).toBeTruthy()
    expect(document.activeElement).toBe(nameField())

    await user.clear(nameField())
    await user.type(nameField(), 'x'.repeat(51))
    expect(screen.getByText('Display name must be at most 50 characters.')).toBeTruthy()
    expect(saveCalls(fetchMock)).toHaveLength(0)
    expect(editForm()).toBeTruthy()
  })

  test('the About limit is enforced', async () => {
    const user = userEvent.setup()
    const fetchMock = await openProfile({ save: () => jsonResponse(200, { profile: FULL_PROFILE }) })
    await startEditing(user)
    await user.clear(aboutField())
    await user.click(aboutField())
    await user.paste('x'.repeat(501))
    expect(screen.getByText('501/500 characters.')).toBeTruthy()
    expect(screen.getByText('About must be at most 500 characters.')).toBeTruthy()
    await user.click(saveButton())
    expect(saveCalls(fetchMock)).toHaveLength(0)
  })

  test('at most 3 favorite spots', async () => {
    const user = userEvent.setup()
    await openProfile({ profile: { ...FULL_PROFILE, favoriteSpots: [CARCAVELOS, GUINCHO, SUPERTUBOS] } })
    await startEditing(user)
    await user.click(spotField())
    await user.click(screen.getByRole('option', { name: new RegExp(FOURTH.name) }))
    expect(screen.getAllByText('Choose a maximum of 3 favorite spots.').length).toBeGreaterThan(0)
    expect(chosenSpotNames()).toHaveLength(3)
  })

  test('saving sends only the profile fields and shows the server’s answer', async () => {
    const user = userEvent.setup()
    const saved = {
      ...FULL_PROFILE,
      displayName: 'Emma L.',
      skillLevel: 'advanced',
      boardType: 'longboard',
      about: 'New bio',
      favoriteSpots: [GUINCHO, SUPERTUBOS],
    }
    const fetchMock = await openProfile({ save: () => jsonResponse(200, { profile: saved }) })
    await startEditing(user)

    await user.clear(nameField())
    await user.type(nameField(), '  Emma   L. ')
    await user.selectOptions(levelField(), 'advanced')
    await user.selectOptions(boardField(), 'longboard')
    await user.click(screen.getByRole('button', { name: `Remove ${CARCAVELOS.name}` }))
    await user.click(spotField())
    await user.click(screen.getByRole('option', { name: new RegExp(SUPERTUBOS.name) }))
    await user.clear(aboutField())
    await user.type(aboutField(), 'New bio')
    await user.click(saveButton())

    expect(await screen.findByLabelText('Profile details')).toBeTruthy()
    expect(requestBody(fetchMock, SAVE)).toEqual({
      displayName: 'Emma L.',
      skillLevel: 'advanced',
      boardType: 'longboard',
      about: 'New bio',
      favoriteSpotIds: [GUINCHO.id, SUPERTUBOS.id],
    })
    expect(saveCalls(fetchMock)[0][1].credentials).toBe('include')
    // View mode shows what the server returned
    expect(screen.getByText('Emma L.')).toBeTruthy()
    expect(row('Surf level')).toBe('Surf level: Advanced')
    expect(row('Board')).toBe('Board: Longboard')
    expect(row('Favorite spots')).toBe(`Favorite spots: ${GUINCHO.name}, ${SUPERTUBOS.name}`)
    expect(row('About me')).toBe('About me: New bio')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit profile' }))
  })

  test('optional fields can be cleared (sent as null / empty list)', async () => {
    const user = userEvent.setup()
    const fetchMock = await openProfile({ save: () => jsonResponse(200, { profile: EMPTY_OPTIONALS }) })
    await startEditing(user)
    await user.selectOptions(boardField(), 'No board selected')
    await user.click(screen.getByRole('button', { name: `Remove ${CARCAVELOS.name}` }))
    await user.click(screen.getByRole('button', { name: `Remove ${GUINCHO.name}` }))
    await user.clear(aboutField())
    await user.click(saveButton())

    await screen.findByLabelText('Profile details')
    expect(requestBody(fetchMock, SAVE)).toMatchObject({ boardType: null, about: null, favoriteSpotIds: [] })
    expect(row('Board')).toBe('Board: Not specified')
  })

  test('the avatar fields are never part of a profile save', async () => {
    const user = userEvent.setup()
    const withPhoto = { ...FULL_PROFILE, avatarUrl: 'https://res.cloudinary.com/sesh/image/upload/v1/sesh/avatars/a.jpg' }
    const fetchMock = await openProfile({ profile: withPhoto, save: () => jsonResponse(200, { profile: withPhoto }) })
    await startEditing(user)
    await user.click(saveButton())
    await screen.findByLabelText('Profile details')
    const body = requestBody(fetchMock, SAVE)
    expect(body).not.toHaveProperty('avatarUrl')
    expect(body).not.toHaveProperty('avatarPublicId')
    expect(body).not.toHaveProperty('userId')
    expect(document.querySelector('main section img.rounded-full').getAttribute('src')).toBe(withPhoto.avatarUrl)
  })

  test('Cancel discards the changes without any request', async () => {
    const user = userEvent.setup()
    const fetchMock = await openProfile()
    await startEditing(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Somebody Else')
    await user.selectOptions(boardField(), 'gun')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(editForm()).toBeNull()
    expect(screen.getByText('Emma Laurent')).toBeTruthy()
    expect(row('Board')).toBe('Board: Mid-length')
    expect(saveCalls(fetchMock)).toHaveLength(0)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit profile' }))

    // Editing again starts from the saved values
    await startEditing(user)
    expect(nameField().value).toBe('Emma Laurent')
    expect(boardField().value).toBe('mid-length')
  })

  test('a failed save keeps the form and the entered values; retrying works', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openProfile({
      save: () => {
        if (fail) throw new TypeError('Failed to fetch')
        return jsonResponse(200, { profile: { ...FULL_PROFILE, displayName: 'Kai Silva' } })
      },
    })
    await startEditing(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Kai Silva')
    await user.click(saveButton())

    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
    expect(editForm()).toBeTruthy()
    expect(nameField().value).toBe('Kai Silva')
    expect(saveButton().disabled).toBe(false)

    fail = false
    await user.click(saveButton())
    expect(await screen.findByLabelText('Profile details')).toBeTruthy()
    expect(screen.getByText('Kai Silva')).toBeTruthy()
    expect(saveCalls(fetchMock)).toHaveLength(2)
  })

  test('backend field errors are shown on their fields', async () => {
    const user = userEvent.setup()
    await openProfile({
      save: () =>
        jsonResponse(400, {
          status: 'error',
          message: 'Please check the profile details.',
          errors: { displayName: 'Display name contains invalid characters.' },
        }),
    })
    await startEditing(user)
    await user.click(saveButton())
    expect(await screen.findByText('Display name contains invalid characters.')).toBeTruthy()
    expect(document.activeElement).toBe(nameField())
    expect(editForm()).toBeTruthy()
  })

  test('duplicate submissions are prevented while saving', async () => {
    const user = userEvent.setup()
    let finish
    const fetchMock = await openProfile({ save: () => new Promise((resolve) => (finish = resolve)) })
    await startEditing(user)
    await user.click(saveButton())

    expect(saveButton().textContent).toMatch(/Saving changes/)
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    editForm().requestSubmit()
    expect(saveCalls(fetchMock)).toHaveLength(1)

    finish(jsonResponse(200, { profile: FULL_PROFILE }))
    expect(await screen.findByLabelText('Profile details')).toBeTruthy()
    expect(saveCalls(fetchMock)).toHaveLength(1)
  })

  test('without a photo, the initials follow the saved display name', async () => {
    const user = userEvent.setup()
    await openProfile({ save: () => jsonResponse(200, { profile: { ...FULL_PROFILE, displayName: 'Kai Silva' } }) })
    expect(screen.getByText('EL')).toBeTruthy()
    await startEditing(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Kai Silva')
    // Not before saving
    expect(screen.getByText('EL')).toBeTruthy()
    await user.click(saveButton())
    expect(await screen.findByText('KS')).toBeTruthy()
    expect(screen.queryByText('EL')).toBeNull()
  })

  test('the photo can be changed while editing without losing the edits', async () => {
    const user = userEvent.setup()
    const newUrl = 'https://res.cloudinary.com/sesh/image/upload/v2/sesh/avatars/new.jpg'
    await openProfile({ routes: { [UPLOAD]: () => jsonResponse(200, { profile: { ...FULL_PROFILE, avatarUrl: newUrl } }) } })
    await startEditing(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Draft name')

    await user.upload(document.querySelector('input[type="file"]'), new File([new Uint8Array(64)], 'me.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(document.querySelector('main section img.rounded-full').getAttribute('src')).toBe(newUrl))
    expect(editForm()).toBeTruthy()
    expect(nameField().value).toBe('Draft name')
  })
})
