import { describe, expect, test } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsonResponse, mockApi, renderApp, responses } from '../../test/utils'

const ME = 'GET /api/v1/auth/me'
const LOGOUT = 'POST /api/v1/auth/logout'
const location = () => screen.getByTestId('location').textContent

describe('visitor navigation', () => {
  test('shows Home (logo), Log in and Create account; no app navigation', async () => {
    mockApi({ [ME]: responses.signedOut })
    renderApp('/')
    const account = await screen.findByRole('navigation', { name: 'Account' })

    expect(within(account).getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
    expect(within(account).getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/register')
    expect(screen.getByRole('link', { name: 'Sesh home' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
  })
})

describe('signed-in navigation (tablet and desktop)', () => {
  test('Discover, Status, Messages and the My profile account menu', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Discover' })

    const main = screen.getAllByRole('navigation', { name: 'Main' })[0]
    expect(within(main).getByRole('link', { name: 'Discover' }).getAttribute('aria-current')).toBe('page')
    expect(within(main).getByRole('link', { name: 'Status' })).toBeTruthy()
    expect(within(main).getByRole('link', { name: 'Messages' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()

    const trigger = within(main).getByRole('button', { name: 'My profile' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('link', { name: 'My Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'Settings & Privacy' }).getAttribute('href')).toBe('/settings')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'Settings & Privacy' }))
    expect(await screen.findByRole('heading', { name: 'Settings & Privacy' })).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  test('the account menu closes with Escape and returns focus', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Discover' })

    const trigger = screen.getByRole('button', { name: 'My profile' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await user.tab()
    expect(document.activeElement.textContent).toBe('My Profile')
    await user.keyboard('{Escape}')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })
})

describe('mobile burger menu', () => {
  async function openMenu(user) {
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    return screen.getByRole('dialog', { name: 'Main menu' })
  }

  test('lists the app pages and Log out; closes after navigation', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Discover' })

    const menu = await openMenu(user)
    const labels = within(menu).getAllByRole('link').map((link) => link.textContent.trim())
    expect(labels).toEqual(['Discover', 'My Status', 'Messages', 'My Profile', 'Settings & Privacy'])
    expect(within(menu).getByRole('button', { name: 'Log out' }).disabled).toBe(false)

    await user.click(within(menu).getByRole('link', { name: 'Messages' }))
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Escape closes the menu and returns focus to the burger button', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn() })
    renderApp('/discover')
    await screen.findByRole('heading', { name: 'Discover' })

    await openMenu(user)
    expect(document.activeElement.getAttribute('aria-label')).toBe('Close menu')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement.getAttribute('aria-label')).toBe('Open menu')
  })

  test('logging out from the menu closes it and shows the visitor header', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn(), [LOGOUT]: () => jsonResponse(200, { status: 'ok', message: 'Logged out.' }) })
    renderApp('/status')
    await screen.findByRole('heading', { name: 'My Status' })

    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(location()).toBe('/'))
    expect(screen.queryByRole('dialog')).toBeNull()
    const header = screen.getByRole('navigation', { name: 'Account' })
    expect(within(header).getByRole('link', { name: 'Create account' })).toBeTruthy()
  })

  test('a failed logout keeps the menu open with an error', async () => {
    const user = userEvent.setup()
    mockApi({ [ME]: () => responses.signedIn(), [LOGOUT]: responses.serverError })
    renderApp('/status')
    await screen.findByRole('heading', { name: 'My Status' })

    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('button', { name: 'Log out' }))

    expect((await within(menu).findByRole('alert')).textContent).toMatch(/Logout failed/)
    expect(screen.getByRole('dialog', { name: 'Main menu' })).toBeTruthy()
    expect(location()).toBe('/status')
  })
})
