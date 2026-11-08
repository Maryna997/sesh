// Messages inbox tests (mocked API; no backend or database involved).
// The device time zone is New York for this file, so inbox times must come
// from Lisbon time, not the device.
process.env.TZ = 'America/New_York'

import { afterEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEST_USER, jsonResponse, renderApp, responses } from '../test/utils'
import { EMPTY_INBOX_TITLE } from '../components/messages/MessagesInbox'

const NOW = new Date('2026-11-08T12:00:00.000Z') // 12:00 in Lisbon (winter time)

let counter = 0
const conversation = (name, fields = {}) => {
  counter += 1
  return {
    id: `0c0c0c0c-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    otherParticipant: { userId: `1d1d1d1d-0000-4000-8000-${String(counter).padStart(12, '0')}`, displayName: name, avatarUrl: null },
    createdAt: '2026-11-01T09:00:00.000Z',
    lastActivityAt: '2026-11-08T10:24:00.000Z',
    lastMessage: { id: `2e2e2e2e-0000-4000-8000-${String(counter).padStart(12, '0')}`, senderId: 'someone-else', preview: `Hi from ${name}`, createdAt: '2026-11-08T10:24:00.000Z' },
    ...fields,
  }
}
const page = (conversations, { page: number = 1, total = conversations.length, totalPages = total ? 1 : 0 } = {}) =>
  jsonResponse(200, { conversations, pagination: { page: number, limit: 20, total, totalPages } })

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

// Fake backend: `conversations(params)` answers GET /api/v1/conversations
function mockBackend({ conversations = () => page([]), me = () => responses.signedIn(), extra = {} } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost')
    if (pathname === '/api/v1/auth/me') return me()
    if (pathname === '/api/v1/conversations') return conversations(Object.fromEntries(searchParams))
    if (extra[pathname]) return extra[pathname]()
    throw new Error(`Unexpected request in test: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const conversationCalls = (fetchMock) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/v1/conversations')).map(([url]) => url)
const location = () => screen.getByTestId('location').textContent
const list = () => screen.findByRole('list', { name: 'Conversations' })
const rows = () => within(screen.getByRole('list', { name: 'Conversations' })).getAllByRole('link')
// The name (the initials avatar is bold too, so select the name's own classes)
const names = () => rows().map((row) => row.querySelector('.text-base.font-bold').textContent)
const announced = () => screen.getAllByRole('status').map((region) => region.textContent)
const inboxRegion = () => screen.getByRole('region', { name: 'Inbox' })

async function openInbox(backend) {
  const fetchMock = mockBackend(backend)
  renderApp('/messages')
  await screen.findByRole('heading', { name: 'Messages' })
  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
})

describe('inbox rendering', () => {
  test('heading, description and one row per conversation: avatar or initials, name, preview, time', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const withPhoto = conversation('Mariana Silva', {
      otherParticipant: { userId: 'u1', displayName: 'Mariana Silva', avatarUrl: 'https://res.cloudinary.com/demo/mariana.jpg' },
    })
    const mine = conversation('Lucas Costa', {
      lastMessage: { id: 'm2', senderId: TEST_USER.id, preview: 'See you at 4!', createdAt: '2026-11-07T20:00:00.000Z' },
    })
    const empty = conversation('Jamie Lee', { lastMessage: null, createdAt: '2026-11-05T09:00:00.000Z' })
    await openInbox({ conversations: () => page([withPhoto, mine, empty]) })

    expect(screen.getByRole('heading', { level: 1, name: 'Messages' })).toBeTruthy()
    expect(screen.getByText('More spontaneity, more shared sessions')).toBeTruthy()
    await list()
    const [first, second, third] = rows()
    expect(first.querySelector('img[src="https://res.cloudinary.com/demo/mariana.jpg"]')).toBeTruthy()
    expect(first.textContent).toContain('Mariana Silva')
    expect(first.textContent).toContain('Hi from Mariana Silva')
    expect(first.querySelector('time').textContent).toBe('10:24') // today, Lisbon time
    expect(second.textContent).toContain('You: See you at 4!')
    expect(second.querySelector('time').textContent).toBe('Yesterday')
    expect(within(third).getByText('JL')).toBeTruthy() // initials fallback
    expect(third.textContent).toContain('No messages yet')
    expect(third.querySelector('time').textContent).toBe('Thursday') // when it was started
    expect(third.querySelector('time').getAttribute('datetime')).toBe('2026-11-05T09:00:00.000Z')
    expect(announced()).toContain('3 conversations')
  })

  test('order is the server’s; long previews are truncated on one line; nothing private is shown', async () => {
    const long = 'Dawn patrol tomorrow? '.repeat(20)
    const leaky = conversation('Noa Reis', {
      lastMessage: { id: 'm9', senderId: 'x', preview: long, createdAt: '2026-11-08T10:00:00.000Z' },
      otherParticipant: { userId: 'u9', displayName: 'Noa Reis', avatarUrl: null, email: 'noa@example.com' },
      email: 'leak@example.com',
    })
    const other = conversation('Ana Silva')
    await openInbox({ conversations: () => page([leaky, other]) })
    await list()
    expect(names()).toEqual(['Noa Reis', 'Ana Silva']) // no client-side re-sorting
    const preview = within(rows()[0]).getByText(long.trim(), { exact: false })
    expect(preview.className).toContain('truncate')
    const text = screen.getByRole('main').textContent
    for (const hidden of ['noa@example.com', 'leak@example.com', leaky.id, leaky.otherParticipant.userId, 'u9']) {
      expect(text).not.toContain(hidden)
    }
  })

  test('a missing display name falls back to a neutral label', async () => {
    await openInbox({ conversations: () => page([conversation('x', { otherParticipant: { userId: 'u', displayName: null, avatarUrl: null } })]) })
    await list()
    expect(names()).toEqual(['Sesh surfer'])
  })
})

describe('API integration and states', () => {
  test('page 1 with the session cookie; loading is announced and no empty state flashes', async () => {
    const slow = deferred()
    const fetchMock = await openInbox({ conversations: () => slow.promise })
    expect(screen.getByText('Loading conversations…', { selector: '[aria-hidden="true"]' })).toBeTruthy()
    expect(announced()).toContain('Loading conversations…')
    expect(inboxRegion().getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('heading', { name: EMPTY_INBOX_TITLE })).toBeNull()

    slow.resolve(page([conversation('Mariana Silva')]))
    await list()
    expect(inboxRegion().getAttribute('aria-busy')).toBe('false')
    expect(conversationCalls(fetchMock)).toEqual(['/api/v1/conversations'])
    const call = fetchMock.mock.calls.find(([url]) => url.startsWith('/api/v1/conversations'))
    expect(call[1].credentials).toBe('include')
  })

  test('empty inbox: friendly message and a link to Discover', async () => {
    const user = userEvent.setup()
    await openInbox({
      conversations: () => page([]),
      extra: {
        '/api/v1/discover': () => jsonResponse(200, { surfers: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
        '/api/v1/surf-spots': () => jsonResponse(200, { spots: [] }),
      },
    })
    expect(await screen.findByRole('heading', { name: EMPTY_INBOX_TITLE })).toBeTruthy()
    expect(screen.getByText('Find someone to share your next session with.')).toBeTruthy()
    expect(announced()).toContain(`${EMPTY_INBOX_TITLE}.`)
    await user.click(screen.getByRole('link', { name: 'Discover surfers' }))
    expect(location()).toBe('/discover')
  })

  test('server error: friendly message, no server details; Try again (keyboard) reloads and keeps focus', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openInbox({
      conversations: () => (fail ? jsonResponse(500, { status: 'error', message: 'SequelizeDatabaseError at line 42' }) : page([conversation('Mariana Silva')])),
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('We couldn’t load your messages')
    expect(alert.textContent).not.toMatch(/Sequelize|line 42/)
    expect(screen.queryByRole('heading', { name: EMPTY_INBOX_TITLE })).toBeNull()

    fail = false
    screen.getByRole('button', { name: 'Try again' }).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(inboxRegion())
    await list()
    expect(names()).toEqual(['Mariana Silva'])
    expect(location()).toBe('/messages')
    expect(conversationCalls(fetchMock)).toHaveLength(2)
  })

  test('network error: connection message', async () => {
    await openInbox({ conversations: responses.networkError })
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t reach Sesh/)
  })
})

describe('Load more', () => {
  test('appends the next page without duplicates, shows progress, and stops at the last page', async () => {
    const user = userEvent.setup()
    const [a, b, c] = [conversation('Ana'), conversation('Bea'), conversation('Cai')]
    const next = deferred()
    const fetchMock = await openInbox({
      conversations: (params) => (params.page === '2' ? next.promise : page([a, b], { total: 3, totalPages: 2 })),
    })
    await list()
    expect(announced()).toContain('3 conversations · showing 2')

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    const button = screen.getByRole('button', { name: /Loading more…/ })
    expect(button.disabled).toBe(true)
    expect(names()).toEqual(['Ana', 'Bea']) // kept while loading
    await user.click(button)
    expect(conversationCalls(fetchMock)).toEqual(['/api/v1/conversations', '/api/v1/conversations?page=2'])

    next.resolve(page([b, c], { page: 2, total: 3, totalPages: 2 })) // Bea moved down a page meanwhile
    await waitFor(() => expect(names()).toEqual(['Ana', 'Bea', 'Cai']))
    expect(screen.queryByRole('button', { name: /Load more|Loading more/ })).toBeNull()
    expect(conversationCalls(fetchMock)).toHaveLength(2) // nothing more is requested
  })

  test('a failed page keeps the loaded conversations and can be retried', async () => {
    const user = userEvent.setup()
    let failPage2 = true
    await openInbox({
      conversations: (params) => {
        if (params.page === '2') return failPage2 ? responses.networkError() : page([conversation('Cai')], { page: 2, total: 2, totalPages: 2 })
        return page([conversation('Ana')], { total: 2, totalPages: 2 })
      },
    })
    await list()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t load more conversations')
    expect(names()).toEqual(['Ana'])

    failPage2 = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(names()).toEqual(['Ana', 'Cai']))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('navigation', () => {
  test('a row opens /messages/:conversationId (keyboard), a placeholder that loads nothing', async () => {
    const user = userEvent.setup()
    const target = conversation('Mariana Silva')
    const fetchMock = await openInbox({ conversations: () => page([target]) })
    await list()
    const row = rows()[0]
    expect(row.getAttribute('href')).toBe(`/messages/${target.id}`)
    expect(row.querySelectorAll('a, button')).toHaveLength(0) // no nested controls

    row.focus()
    await user.keyboard('{Enter}')
    expect(location()).toBe(`/messages/${target.id}`)
    expect(await screen.findByRole('heading', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('This page is coming soon.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Back to Messages' }).every((link) => link.getAttribute('href') === '/messages')).toBe(true)
    expect(conversationCalls(fetchMock)).toEqual(['/api/v1/conversations']) // no message history requested
  })

  test.each(['/messages', '/messages/0c0c0c0c-0000-4000-8000-000000000999'])('Messages is the active navigation item on %s', async (path) => {
    const user = userEvent.setup()
    mockBackend({ conversations: () => page([]) })
    renderApp(path)
    await screen.findByRole('heading', { level: 1 })
    const topNav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'Main' })
    expect(within(topNav).getByRole('link', { name: 'Messages' }).getAttribute('aria-current')).toBe('page')
    for (const other of ['Discover', 'Status']) {
      expect(within(topNav).getByRole('link', { name: other }).getAttribute('aria-current')).toBeNull()
    }

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getAllByRole('navigation', { name: 'Main' }).find((nav) => nav !== topNav)
    expect(within(menu).getByRole('link', { name: 'Messages' }).getAttribute('aria-current')).toBe('page')
    for (const other of ['Discover', 'My Status', 'My Profile']) {
      expect(within(menu).getByRole('link', { name: other }).getAttribute('aria-current')).toBeNull()
    }
  })
})

describe('session and profile', () => {
  test('expired session (401): sent to log in', async () => {
    let signedIn = true
    mockBackend({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      conversations: () => {
        signedIn = false
        return jsonResponse(401, { status: 'error', message: 'Authentication required.' })
      },
    })
    renderApp('/messages')
    await waitFor(() => expect(location()).toBe('/login?returnTo=%2Fmessages'))
  })

  test('401 while the session still looks valid: a clear message, one re-check, no loop', async () => {
    const fetchMock = await openInbox({ conversations: () => jsonResponse(401, { status: 'error', message: 'Authentication required.' }) })
    expect((await screen.findByRole('alert')).textContent).toContain('Your session has ended. Please log in again.')
    await new Promise((done) => setTimeout(done, 100))
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(conversationCalls(fetchMock)).toHaveLength(1)
    expect(urls.filter((url) => url === '/api/v1/auth/me')).toHaveLength(2)
  })

  test('403 PROFILE_REQUIRED: the onboarding guard takes over', async () => {
    let hasProfile = true
    mockBackend({
      me: () => responses.signedIn(undefined, { hasCompletedProfile: hasProfile }),
      conversations: () => {
        hasProfile = false
        return jsonResponse(403, { status: 'error', message: 'Complete your surfer profile to use this feature.', code: 'PROFILE_REQUIRED' })
      },
    })
    renderApp('/messages')
    await waitFor(() => expect(location()).toBe('/create-profile'))
  })
})
