import { describe, expect, test, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, responses } from '../test/utils'

const ME = 'GET /api/v1/auth/me'
const MY_PROFILE = 'GET /api/v1/profile/me'
const UPLOAD = 'POST /api/v1/profile/me/avatar'
const REMOVE = 'DELETE /api/v1/profile/me/avatar'
const OLD_URL = 'https://res.cloudinary.com/sesh/image/upload/v1/sesh/avatars/old.jpg'
const NEW_URL = 'https://res.cloudinary.com/sesh/image/upload/v2/sesh/avatars/new.jpg'

const profile = (avatarUrl = null) => ({
  userId: 'u1',
  displayName: 'Emma Laurent',
  skillLevel: 'beginner',
  boardType: null,
  about: null,
  avatarUrl,
  favoriteSpots: [],
})
const profileResponse = (avatarUrl) => jsonResponse(200, { profile: profile(avatarUrl) })

const photoFile = (name = 'me.jpg', type = 'image/jpeg') => new File([new Uint8Array(512)], name, { type })
const photoInput = () => document.querySelector('input[type="file"]')
// The round avatar image in the profile panel (not the page photo or row icons)
const shownImage = () => document.querySelector('main section img.rounded-full')
const calls = (fetchMock, key) => fetchMock.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === key)

async function openProfile({ avatarUrl = null, routes = {} } = {}) {
  const fetchMock = mockApi({ [ME]: () => responses.signedIn(), [MY_PROFILE]: () => profileResponse(avatarUrl), ...routes })
  renderApp('/profile')
  await screen.findByText('Emma Laurent')
  return fetchMock
}

describe('My Profile picture', () => {
  test('without a picture: initials and "Add photo"', async () => {
    await openProfile()
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeTruthy()
    expect(screen.getByText('EL')).toBeTruthy()
    expect(shownImage()).toBeNull()
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull()
  })

  test('My Profile keeps the fixed 82px Figma avatar (no responsive tile sizes)', async () => {
    await openProfile()
    const initials = screen.getByText('EL')
    expect(initials.classList).toContain('size-[82px]')
    expect(initials.className).not.toMatch(/md:size|lg:size/)
  })

  test('with a picture: the uploaded image, "Change photo" and "Remove photo"', async () => {
    await openProfile({ avatarUrl: OLD_URL })
    expect(shownImage().getAttribute('src')).toBe(OLD_URL)
    expect(screen.queryByText('EL')).toBeNull()
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeTruthy()
  })

  test('uploading shows a preview and a busy state, then the saved picture', async () => {
    const user = userEvent.setup()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    let finish
    const fetchMock = await openProfile({ routes: { [UPLOAD]: () => new Promise((resolve) => (finish = resolve)) } })

    const file = photoFile()
    await user.upload(photoInput(), file)
    const previewUrl = shownImage().getAttribute('src')
    expect(previewUrl).toMatch(/^blob:/)
    const busy = screen.getByRole('button', { name: /Uploading photo/ })
    expect(busy.disabled).toBe(true)

    // A second choice while uploading is ignored
    await user.upload(photoInput(), photoFile('other.png', 'image/png'))
    expect(calls(fetchMock, UPLOAD)).toHaveLength(1)
    expect(calls(fetchMock, UPLOAD)[0][1].body.get('avatar')).toBe(file)

    finish(profileResponse(NEW_URL))
    await waitFor(() => expect(shownImage().getAttribute('src')).toBe(NEW_URL))
    expect(screen.getByText('Profile photo updated.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeTruthy()
    expect(revoke).toHaveBeenCalledWith(previewUrl)
  })

  test('replacing an existing picture', async () => {
    const user = userEvent.setup()
    await openProfile({ avatarUrl: OLD_URL, routes: { [UPLOAD]: () => profileResponse(NEW_URL) } })
    await user.upload(photoInput(), photoFile())
    await waitFor(() => expect(shownImage().getAttribute('src')).toBe(NEW_URL))
  })

  test('a failed upload explains why and keeps the saved picture', async () => {
    const user = userEvent.setup()
    await openProfile({
      avatarUrl: OLD_URL,
      routes: { [UPLOAD]: () => jsonResponse(502, { status: 'error', message: 'We couldn’t upload your picture. Please try again.' }) },
    })
    await user.upload(photoInput(), photoFile())
    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t upload your picture. Please try again.')
    expect(shownImage().getAttribute('src')).toBe(OLD_URL)
    expect(screen.getByRole('button', { name: 'Change photo' }).disabled).toBe(false)
  })

  test('removing the picture shows the initials again', async () => {
    const user = userEvent.setup()
    const fetchMock = await openProfile({ avatarUrl: OLD_URL, routes: { [REMOVE]: () => profileResponse(null) } })
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(await screen.findByText('EL')).toBeTruthy()
    expect(shownImage()).toBeNull()
    expect(screen.getByText('Profile photo removed.')).toBeTruthy()
    expect(calls(fetchMock, REMOVE)[0][1]).toMatchObject({ method: 'DELETE', credentials: 'include' })
  })

  test('a failed removal keeps the picture and shows a message', async () => {
    const user = userEvent.setup()
    await openProfile({ avatarUrl: OLD_URL, routes: { [REMOVE]: responses.networkError } })
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
    expect(shownImage().getAttribute('src')).toBe(OLD_URL)
  })

  test('unsupported files are refused before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const fetchMock = await openProfile()
    await user.upload(photoInput(), photoFile('scan.pdf', 'application/pdf'))
    expect(screen.getByRole('alert').textContent).toBe('Choose a JPEG, PNG or WebP image.')
    expect(calls(fetchMock, UPLOAD)).toHaveLength(0)
  })

  test('if the profile cannot be loaded, the user can try again', async () => {
    const user = userEvent.setup()
    let fail = true
    mockApi({
      [ME]: () => responses.signedIn(),
      [MY_PROFILE]: () => (fail ? responses.serverError() : profileResponse(null)),
    })
    renderApp('/profile')
    expect(await screen.findByText('We couldn’t load your profile')).toBeTruthy()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Emma Laurent')).toBeTruthy()
  })
})
