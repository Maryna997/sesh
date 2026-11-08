// "Message" entry points: the public surfer profile button and the Discover
// card button, both through useStartConversation (mocked API; no backend or
// database involved).
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AuthProvider from '../auth/AuthProvider'
import userEvent from '@testing-library/user-event'
import { jsonResponse, renderApp, responses } from '../test/utils'
import { RECIPIENT_NOT_FOUND_MESSAGE, useStartConversation } from '../hooks/useStartConversation'

const MARIANA_ID = '7f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const LUCAS_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const CONVERSATION_ID = '0c0c0c0c-0000-4000-8000-000000000001'
const LUCAS_CONVERSATION_ID = '0c0c0c0c-0000-4000-8000-000000000002'

const CARCAVELOS = { id: 'pt-cascais-carcavelos', name: 'Carcavelos', kind: 'beach', area: 'Carcavelos', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' }
const cardSpot = ({ id, name, area }) => ({ id, name, area })

const profile = (fields = {}) => ({
  userId: MARIANA_ID,
  displayName: 'Mariana Silva',
  skillLevel: 'intermediate',
  boardType: 'shortboard',
  about: 'Easygoing shortboarder.',
  avatarUrl: null,
  favoriteSpots: [CARCAVELOS],
  availability: { status: 'ACTIVE', spot: cardSpot(CARCAVELOS), arrival: null },
  ...fields,
})
const card = (userId, displayName, fields = {}) => ({
  userId,
  displayName,
  avatarUrl: null,
  skillLevel: 'intermediate',
  availability: { status: 'ACTIVE', spot: cardSpot(CARCAVELOS), arrival: null },
  ...fields,
})
const SURFERS = [card(MARIANA_ID, 'Mariana Silva'), card(LUCAS_ID, 'Lucas Costa', { skillLevel: 'beginner' })]
const discoverPage = (surfers = SURFERS) =>
  jsonResponse(200, { surfers, pagination: { page: 1, limit: 20, total: surfers.length, totalPages: surfers.length ? 1 : 0 } })

const PARTICIPANTS = {
  [MARIANA_ID]: { userId: MARIANA_ID, displayName: 'Mariana Silva', avatarUrl: null },
  [LUCAS_ID]: { userId: LUCAS_ID, displayName: 'Lucas Costa', avatarUrl: null },
}
const conversationIdFor = (userId) => (userId === LUCAS_ID ? LUCAS_CONVERSATION_ID : CONVERSATION_ID)
// The backend's answer: 201 when created, 200 when it already existed
const conversationResponse = (recipientUserId, status = 201) =>
  jsonResponse(status, { conversation: { id: conversationIdFor(recipientUserId), otherParticipant: PARTICIPANTS[recipientUserId], createdAt: '2026-11-08T11:00:00.000Z' } })
const error = (status, body = {}) => jsonResponse(status, { status: 'error', message: 'Error.', ...body })

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

// Fake backend. `start(body)` answers POST /api/v1/conversations.
// The chat page opened afterwards gets an empty conversation.
function mockBackend({ start = (body) => conversationResponse(body.recipientUserId), me = () => responses.signedIn(), discover = () => discoverPage() } = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const { pathname } = new URL(url, 'http://localhost')
    const method = options.method ?? 'GET'
    if (pathname === '/api/v1/auth/me') return me()
    if (pathname === '/api/v1/surf-spots') return jsonResponse(200, { spots: [CARCAVELOS] })
    if (pathname === '/api/v1/discover') return discover()
    if (pathname.startsWith('/api/v1/profiles/')) return jsonResponse(200, { profile: profile() })
    if (pathname === '/api/v1/conversations' && method === 'POST') return start(JSON.parse(options.body))
    if (pathname === '/api/v1/conversations') {
      const items = [MARIANA_ID, LUCAS_ID].map((userId) => ({
        id: conversationIdFor(userId),
        otherParticipant: PARTICIPANTS[userId],
        createdAt: '2026-11-08T11:00:00.000Z',
        lastActivityAt: '2026-11-08T11:00:00.000Z',
        lastMessage: null,
      }))
      return jsonResponse(200, { conversations: items, pagination: { page: 1, limit: 50, total: 2, totalPages: 1 } })
    }
    if (/^\/api\/v1\/conversations\/[^/]+\/messages$/.test(pathname)) {
      return jsonResponse(200, { messages: [], pagination: { hasMore: false, nextCursor: null, pollCursor: null } })
    }
    throw new Error(`Unexpected request in test: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const startCalls = (fetchMock) => fetchMock.mock.calls.filter(([url, options = {}]) => url === '/api/v1/conversations' && options.method === 'POST')
const discoverCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/v1/discover'))
const location = () => screen.getByTestId('location').textContent
const results = () => screen.findByRole('list', { name: 'Available surfers' })
const cardOf = (name) => within(screen.getByRole('list', { name: 'Available surfers' })).getByRole('heading', { name }).closest('article')
const cardMessage = (name) => within(cardOf(name)).getByRole('button', { name: `Message ${name}` })
const profileMessage = () => screen.getByRole('button', { name: /^Message/ })

async function openProfile(backend) {
  const fetchMock = mockBackend(backend)
  renderApp(`/surfers/${MARIANA_ID}`)
  await screen.findByRole('heading', { level: 2, name: 'Mariana Silva' })
  return fetchMock
}

async function openDiscover(backend) {
  const fetchMock = mockBackend(backend)
  renderApp('/discover')
  await results()
  return fetchMock
}

// ---------- Public surfer profile ----------

describe('public profile: Message button', () => {
  test('enabled, no “coming soon” note; the rest of the profile is unchanged', async () => {
    await openProfile()
    expect(profileMessage().disabled).toBe(false)
    expect(screen.queryByText('Messaging coming soon')).toBeNull()
    expect(profileMessage().getAttribute('aria-describedby')).toBeNull()
    const details = screen.getByLabelText('Profile details')
    expect(details.textContent).toContain('Intermediate')
    expect(details.textContent).toContain('Shortboard')
    expect(details.textContent).toContain('Easygoing shortboarder.')
    expect(screen.getAllByRole('link', { name: 'Back to Discover' }).length).toBeGreaterThanOrEqual(2)
  })

  test.each([
    ['a new conversation (201)', 201],
    ['an existing conversation (200)', 200],
  ])('%s: POST with the surfer’s id, then the chat opens', async (_, status) => {
    const user = userEvent.setup()
    const fetchMock = await openProfile({ start: (body) => conversationResponse(body.recipientUserId, status) })

    await user.click(profileMessage())
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))
    expect(await screen.findByRole('heading', { level: 1, name: 'Mariana Silva' })).toBeTruthy() // the chat (Task 9.4)

    const [[url, options]] = startCalls(fetchMock)
    expect(url).toBe('/api/v1/conversations')
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(options.body)).toEqual({ recipientUserId: MARIANA_ID }) // no sender id
  })

  test('while waiting: busy, one request only, no navigation until the server answers', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    const fetchMock = await openProfile({ start: () => answer.promise })

    await user.click(profileMessage())
    await user.click(profileMessage())
    await user.dblClick(profileMessage())
    expect(startCalls(fetchMock)).toHaveLength(1)
    expect(profileMessage().disabled).toBe(true)
    expect(profileMessage().getAttribute('aria-busy')).toBe('true')
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)

    answer.resolve(conversationResponse(MARIANA_ID))
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))
  })

  test('network failure: friendly message, the button works again, retry opens the chat', async () => {
    const user = userEvent.setup()
    let fail = true
    await openProfile({ start: (body) => (fail ? responses.networkError() : conversationResponse(body.recipientUserId)) })

    await user.click(profileMessage())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('We couldn’t open the conversation')
    expect(alert.textContent).toContain('We couldn’t reach Sesh')
    expect(profileMessage().disabled).toBe(false)
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)

    fail = false
    await user.click(profileMessage())
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))
  })

  test('recipient not found (404): a short message without server details, no navigation', async () => {
    const user = userEvent.setup()
    await openProfile({ start: () => error(404, { message: 'Surfer not found.' }) })
    await user.click(profileMessage())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(RECIPIENT_NOT_FOUND_MESSAGE)
    expect(alert.textContent).not.toContain('Surfer not found.')
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)
  })

  test('unexpected server error: non-technical message', async () => {
    const user = userEvent.setup()
    await openProfile({ start: () => error(500, { message: 'TypeError: cannot read x' }) })
    await user.click(profileMessage())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Something went wrong on our side')
    expect(alert.textContent).not.toContain('TypeError')
  })

  test('expired session (401): sent to log in', async () => {
    const user = userEvent.setup()
    let signedIn = true
    await openProfile({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      start: () => {
        signedIn = false
        return error(401)
      },
    })
    await user.click(profileMessage())
    await waitFor(() => expect(location()).toBe(`/login?returnTo=${encodeURIComponent(`/surfers/${MARIANA_ID}`)}`))
  })

  test('403 PROFILE_REQUIRED: sent to Create Profile', async () => {
    const user = userEvent.setup()
    let hasProfile = true
    await openProfile({
      me: () => responses.signedIn(undefined, { hasCompletedProfile: hasProfile }),
      start: () => {
        hasProfile = false
        return error(403, { code: 'PROFILE_REQUIRED' })
      },
    })
    await user.click(profileMessage())
    await waitFor(() => expect(location()).toBe('/create-profile'))
  })

  test('leaving the page while waiting: the late answer doesn’t navigate', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    await openProfile({ start: () => answer.promise })
    await user.click(profileMessage())
    await user.click(screen.getAllByRole('link', { name: 'Back to Discover' })[0])
    await waitFor(() => expect(location()).toBe('/discover'))

    answer.resolve(conversationResponse(MARIANA_ID))
    await new Promise((done) => setTimeout(done, 50))
    expect(location()).toBe('/discover')
  })
})

// ---------- Discover cards ----------

describe('Discover cards: Message button', () => {
  test('each card has its own Message button on the right, outside the profile link', async () => {
    await openDiscover()
    for (const name of ['Mariana Silva', 'Lucas Costa']) {
      const article = cardOf(name)
      const button = cardMessage(name)
      const link = within(article).getByRole('link', { name })
      expect(button.closest('a')).toBeNull() // not inside the link
      expect(link.querySelector('button, a')).toBeNull() // nothing inside the link
      expect(button.querySelector('button, a')).toBeNull()
      expect(button.textContent).toContain('Message')
      expect(button.className).toContain('h-11') // 44px touch target
      // Right column of the card, after the surfer's details
      expect(button.parentElement.className).toContain('self-center')
      expect(link.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // The surfer's information is still there
    expect(cardOf('Mariana Silva').textContent).toContain('Intermediate · Active now')
    expect(cardOf('Lucas Costa').textContent).toContain('Beginner · Active now')
    expect(cardOf('Mariana Silva').textContent).toContain('Preferred spot: Carcavelos')
  })

  test('the card still opens the profile; Message opens the chat, not the profile', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover()

    await user.click(cardMessage('Lucas Costa'))
    await waitFor(() => expect(location()).toBe(`/messages/${LUCAS_CONVERSATION_ID}`))
    expect(JSON.parse(startCalls(fetchMock)[0][1].body)).toEqual({ recipientUserId: LUCAS_ID })
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/v1/profiles/'))).toBe(false)

    await user.click(screen.getAllByRole('link', { name: 'Discover' })[0])
    await results()
    await user.click(within(cardOf('Mariana Silva')).getByRole('link', { name: 'Mariana Silva' }))
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)
  })

  test('the same conversation is reused when Message is clicked again (200)', async () => {
    const user = userEvent.setup()
    let created = false
    const fetchMock = await openDiscover({
      start: (body) => {
        const status = created ? 200 : 201
        created = true
        return conversationResponse(body.recipientUserId, status)
      },
    })
    await user.click(cardMessage('Mariana Silva'))
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))

    await user.click(screen.getAllByRole('link', { name: 'Discover' })[0])
    await results()
    await user.click(cardMessage('Mariana Silva'))
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))
    expect(startCalls(fetchMock)).toHaveLength(2)
  })

  test('keyboard: Tab reaches the profile link, then the Message button; Enter opens the chat', async () => {
    const user = userEvent.setup()
    await openDiscover()
    within(cardOf('Mariana Silva')).getByRole('link', { name: 'Mariana Silva' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(cardMessage('Mariana Silva'))
    expect(cardMessage('Mariana Silva').className).toContain('focus-visible:outline-2')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))
  })

  test('while waiting: that card’s button is busy and sends one request; other cards stay usable', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    const fetchMock = await openDiscover({ start: () => answer.promise })
    await user.click(cardMessage('Mariana Silva'))
    await user.click(cardMessage('Mariana Silva'))
    expect(startCalls(fetchMock)).toHaveLength(1)
    expect(cardMessage('Mariana Silva').disabled).toBe(true)
    expect(cardMessage('Mariana Silva').getAttribute('aria-busy')).toBe('true')
    expect(cardMessage('Lucas Costa').disabled).toBe(false)
    expect(location()).toBe('/discover')

    answer.resolve(conversationResponse(MARIANA_ID))
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))
  })

  test('a failure is shown in that card only; results and filters stay; retry works', async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = await openDiscover({ start: (body) => (fail ? error(500) : conversationResponse(body.recipientUserId)) })
    const requestsBefore = discoverCalls(fetchMock).length

    await user.click(cardMessage('Lucas Costa'))
    const alert = await within(cardOf('Lucas Costa')).findByRole('alert')
    expect(alert.textContent).toContain('We couldn’t open the conversation')
    expect(within(cardOf('Mariana Silva')).queryByRole('alert')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Mariana Silva', 'Lucas Costa'])
    expect(discoverCalls(fetchMock)).toHaveLength(requestsBefore) // results not reloaded
    expect(cardMessage('Lucas Costa').disabled).toBe(false)

    fail = false
    await user.click(cardMessage('Lucas Costa'))
    await waitFor(() => expect(location()).toBe(`/messages/${LUCAS_CONVERSATION_ID}`))
  })

  test('recipient not found (404) on a card', async () => {
    const user = userEvent.setup()
    await openDiscover({ start: () => error(404) })
    await user.click(cardMessage('Mariana Silva'))
    expect((await within(cardOf('Mariana Silva')).findByRole('alert')).textContent).toContain(RECIPIENT_NOT_FOUND_MESSAGE)
    expect(location()).toBe('/discover')
  })

  test('expired session (401): sent to log in', async () => {
    const user = userEvent.setup()
    let signedIn = true
    await openDiscover({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      start: () => {
        signedIn = false
        return error(401)
      },
    })
    await user.click(cardMessage('Mariana Silva'))
    await waitFor(() => expect(location()).toBe('/login?returnTo=%2Fdiscover'))
  })

  test('403 PROFILE_REQUIRED: sent to Create Profile', async () => {
    const user = userEvent.setup()
    let hasProfile = true
    await openDiscover({
      me: () => responses.signedIn(undefined, { hasCompletedProfile: hasProfile }),
      start: () => {
        hasProfile = false
        return error(403, { code: 'PROFILE_REQUIRED' })
      },
    })
    await user.click(cardMessage('Mariana Silva'))
    await waitFor(() => expect(location()).toBe('/create-profile'))
  })

  test('leaving Discover while waiting: the late answer doesn’t navigate', async () => {
    const user = userEvent.setup()
    const answer = deferred()
    await openDiscover({ start: () => answer.promise })
    await user.click(cardMessage('Mariana Silva'))
    await user.click(screen.getAllByRole('link', { name: 'Messages' })[0])
    await waitFor(() => expect(location()).toBe('/messages'))

    answer.resolve(conversationResponse(MARIANA_ID))
    await new Promise((done) => setTimeout(done, 50))
    expect(location()).toBe('/messages')
  })
})

// ---------- Shared behaviour ----------

describe('both entry points', () => {
  test('send the same request for the same surfer and open the same conversation', async () => {
    const user = userEvent.setup()
    const fetchMock = await openDiscover({ start: (body) => conversationResponse(body.recipientUserId, 200) })
    await user.click(cardMessage('Mariana Silva'))
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))

    await user.click(screen.getAllByRole('link', { name: 'Discover' })[0])
    await results()
    await user.click(within(cardOf('Mariana Silva')).getByRole('link', { name: 'Mariana Silva' }))
    await screen.findByRole('heading', { level: 2, name: 'Mariana Silva' })
    await user.click(profileMessage())
    await waitFor(() => expect(location()).toBe(`/messages/${CONVERSATION_ID}`))

    const [fromCard, fromProfile] = startCalls(fetchMock)
    expect(fromCard[1].body).toBe(fromProfile[1].body)
    expect(JSON.parse(fromCard[1].body)).toEqual({ recipientUserId: MARIANA_ID })
  })

  test('a response without a conversation id is treated as a failure (no navigation)', async () => {
    const user = userEvent.setup()
    await openProfile({ start: () => jsonResponse(201, { conversation: null }) })
    await user.click(profileMessage())
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t open this conversation')
    expect(location()).toBe(`/surfers/${MARIANA_ID}`)
  })
})

describe('useStartConversation', () => {
  test('two calls in the same moment (before the button can be disabled) send one request', async () => {
    const answer = deferred()
    const fetchMock = mockBackend({ start: () => answer.promise })
    const wrapper = ({ children }) => (
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    )
    const { result } = renderHook(() => useStartConversation(), { wrapper })
    act(() => {
      result.current.start(MARIANA_ID)
      result.current.start(MARIANA_ID)
      result.current.start(LUCAS_ID)
    })
    expect(startCalls(fetchMock)).toHaveLength(1)
    expect(result.current.pending).toBe(true)
    await act(async () => answer.resolve(conversationResponse(MARIANA_ID)))
  })
})
