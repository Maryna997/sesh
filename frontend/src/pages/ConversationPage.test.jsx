// Chat tests (mocked API; no backend or database involved).
// The device time zone is New York for this file, so message times must come
// from Lisbon time, not the device.
process.env.TZ = 'America/New_York'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TEST_USER, jsonResponse, renderApp, responses } from '../test/utils'
import { POLL_PROBLEM_MESSAGE } from '../components/messages/ChatView'

const NOW = new Date('2026-11-08T12:00:00.000Z') // Sunday 12:00 in Lisbon (winter time)
const ID = '0c0c0c0c-0000-4000-8000-000000000001'
const OTHER_ID = '0c0c0c0c-0000-4000-8000-000000000002'
const MARIANA = { userId: '1d1d1d1d-0000-4000-8000-000000000001', displayName: 'Mariana Silva', avatarUrl: null }
const LUCAS = { userId: '1d1d1d1d-0000-4000-8000-000000000002', displayName: 'Lucas Costa', avatarUrl: null }

// ---------- Fake data ----------

let sequence = 0
let minute = 0
const message = (fields = {}) => {
  sequence += 1
  minute += 1
  return {
    id: `2e2e2e2e-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    conversationId: ID,
    senderId: MARIANA.userId,
    body: `Message ${sequence}`,
    createdAt: new Date(Date.UTC(2026, 10, 8, 9, minute)).toISOString(),
    ...fields,
  }
}
const mine = (fields = {}) => message({ senderId: TEST_USER.id, ...fields })
const cursorOf = (item) => `cursor-${item.id}`

// Responses in the backend's shapes; message lists are given oldest first
const latestPage = (chronological, { hasMore = false } = {}) =>
  jsonResponse(200, {
    messages: [...chronological].reverse(),
    pagination: {
      hasMore,
      nextCursor: hasMore ? cursorOf(chronological[0]) : null,
      pollCursor: chronological.length > 0 ? cursorOf(chronological.at(-1)) : null,
    },
  })
const olderPage = (chronological, { hasMore = false } = {}) =>
  jsonResponse(200, { messages: [...chronological].reverse(), pagination: { hasMore, nextCursor: hasMore ? cursorOf(chronological[0]) : null } })
const newerPage = (chronological, cursor, { hasMore = false } = {}) =>
  jsonResponse(200, { messages: chronological, pagination: { hasMore, nextCursor: chronological.length > 0 ? cursorOf(chronological.at(-1)) : cursor } })
const conversationsPage = (items) =>
  jsonResponse(200, { conversations: items, pagination: { page: 1, limit: 50, total: items.length, totalPages: items.length ? 1 : 0 } })
const summary = (id, otherParticipant) => ({ id, otherParticipant, createdAt: '2026-11-01T09:00:00.000Z', lastActivityAt: '2026-11-08T09:00:00.000Z', lastMessage: null })
const error = (status, body = {}) => jsonResponse(status, { status: 'error', message: 'Error.', ...body })

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

// Fake backend.
// - history(params, conversationId): GET .../messages (params: before / after / limit)
// - send(body, conversationId): POST .../messages
// - conversations(params): GET /conversations
// By default polling finds nothing new.
function mockBackend({
  history = () => latestPage([]),
  send = () => error(500),
  conversations = () => conversationsPage([summary(ID, MARIANA), summary(OTHER_ID, LUCAS)]),
  me = () => responses.signedIn(),
} = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost')
    const params = Object.fromEntries(searchParams)
    if (pathname === '/api/v1/auth/me') return me()
    if (pathname === '/api/v1/conversations') return conversations(params)
    const match = pathname.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/)
    if (match && (options.method ?? 'GET') === 'GET') {
      if (params.after) return (await history(params, match[1])) ?? newerPage([], params.after)
      return history(params, match[1])
    }
    if (match && options.method === 'POST') return send(JSON.parse(options.body), match[1])
    throw new Error(`Unexpected request in test: ${options.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// ---------- Helpers ----------

const historyCalls = (fetchMock, id = ID) =>
  fetchMock.mock.calls
    .filter(([url, options = {}]) => url.startsWith(`/api/v1/conversations/${id}/messages`) && (options.method ?? 'GET') === 'GET')
    .map(([url]) => url.split('?')[1] ?? '')
const sendCalls = (fetchMock) => fetchMock.mock.calls.filter(([, options = {}]) => options.method === 'POST')
const location = () => screen.getByTestId('location').textContent
const messageList = () => screen.findByRole('list', { name: 'Messages' })
const bubbles = () => within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem')
const texts = () => bubbles().map((item) => item.querySelector('p').textContent)
const field = () => screen.getByRole('textbox', { name: 'Message' })
const sendButton = () => screen.getByRole('button', { name: /^Send(ing)? message$/ })
const liveText = () => document.querySelector('[aria-live="polite"]').textContent
const announced = () => screen.getAllByRole('status').map((region) => region.textContent)
// Lets fake time pass (timers, then the mocked requests' promises)
const wait = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

let visibility = 'visible'
function setVisibility(value) {
  visibility = value
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  sequence = 0
  minute = 0
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  // Fake setTimeout (polling) and Date (NOW). Testing Library recognises
  // these fake timers through the `jest` global and advances them itself
  // while it waits for something to appear.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: NOW })
  vi.stubGlobal('jest', { advanceTimersByTime: (ms) => vi.advanceTimersByTime(ms) })
})

afterEach(() => {
  vi.useRealTimers()
})

const setupUser = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })

async function openChat(backend, path = `/messages/${ID}`) {
  const fetchMock = mockBackend(backend)
  const view = renderApp(path)
  return { fetchMock, ...view }
}

// ---------- Rendering ----------

describe('chat rendering', () => {
  test('header, bubbles oldest first, sent vs received, Lisbon times, line breaks, Unicode, plain text', async () => {
    const history = [
      message({ body: 'Hey, are you surfing today?', createdAt: '2026-11-07T23:30:00.000Z' }), // 23:30 Lisbon, yesterday
      mine({ body: 'Yes! Around 4 pm.\nMeet at the car park 🌊🏄‍♀️', createdAt: '2026-11-08T10:24:00.000Z' }),
      message({ body: '<b>Great</b>, see you there! ção', createdAt: '2026-11-08T10:30:00.000Z' }),
    ]
    const { fetchMock } = await openChat({ history: () => latestPage(history) })
    await messageList()

    expect(screen.getByRole('heading', { level: 1, name: 'Mariana Silva' })).toBeTruthy()
    expect(texts()).toEqual(['Hey, are you surfing today?', 'Yes! Around 4 pm.\nMeet at the car park 🌊🏄‍♀️', '<b>Great</b>, see you there! ção'])
    expect(document.querySelector('b')).toBeNull() // message text is never HTML

    const [received, sent, last] = bubbles()
    expect(received.className).toContain('justify-start')
    expect(sent.className).toContain('justify-end')
    expect(sent.querySelector('.bg-bubble-sent')).toBeTruthy()
    expect(received.querySelector('.bg-bubble-sent')).toBeNull()
    expect(sent.querySelector('p').className).toContain('whitespace-pre-wrap')
    expect(received.textContent).toContain('Mariana Silva:') // screen-reader sender label
    expect(sent.textContent).toContain('You:')

    expect(received.querySelector('time').textContent).toBe('Yesterday, 23:30')
    expect(sent.querySelector('time').textContent).toBe('10:24')
    expect(sent.querySelector('time').getAttribute('datetime')).toBe('2026-11-08T10:24:00.000Z')
    expect(last.querySelector('time').textContent).toBe('10:30')

    // Initials (no photo), the conversation id is never shown
    expect(screen.getAllByText('MS').length).toBeGreaterThan(0)
    expect(screen.getByRole('main').textContent).not.toContain(ID)
    expect(screen.getByRole('link', { name: 'Back to Messages' }).getAttribute('href')).toBe('/messages')

    // Latest messages (limit 30) and the participant lookup, with the session cookie
    expect(historyCalls(fetchMock)).toEqual(['limit=30'])
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/v1/conversations?limit=50')
    expect(fetchMock.mock.calls.every(([, options]) => options.credentials === 'include')).toBe(true)
  })

  test('the photo is shown when there is one; a missing participant falls back to “Sesh surfer”', async () => {
    await openChat({
      history: () => latestPage([message()]),
      conversations: () => conversationsPage([summary(ID, { ...MARIANA, avatarUrl: 'https://cdn.example/mariana.jpg' })]),
    })
    await messageList()
    const photos = document.querySelectorAll('img[src="https://cdn.example/mariana.jpg"]')
    expect(photos.length).toBe(2) // header and the bubble
    expect([...photos].every((photo) => photo.getAttribute('alt') === '')).toBe(true) // name is right next to it
  })

  test('participant not in the list: “Sesh surfer”', async () => {
    await openChat({ history: () => latestPage([message()]), conversations: () => conversationsPage([]) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesh surfer' })).toBeTruthy()
  })

  test('loading: announced, “Chat” heading, no empty state before the answer', async () => {
    const answer = deferred()
    await openChat({ history: () => answer.promise })
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat' })).toBeTruthy()
    await waitFor(() => expect(announced()).toContain('Loading conversation…'))
    expect(screen.queryByText('No messages yet')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()

    answer.resolve(latestPage([]))
    expect(await screen.findByText('No messages yet')).toBeTruthy()
  })

  test('empty conversation: friendly empty state and the composer', async () => {
    await openChat({ history: () => latestPage([]) })
    expect(await screen.findByText('No messages yet')).toBeTruthy()
    expect(screen.getByText('Say hi to Mariana Silva and plan your next session.')).toBeTruthy()
    expect(field()).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).toBeNull()
  })

  test('server error: no details, keyboard Try again keeps focus and loads', async () => {
    const user = setupUser()
    let fail = true
    const { fetchMock } = await openChat({ history: () => (fail ? error(500) : latestPage([message({ body: 'Hello!' })])) })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('We couldn’t load this conversation')
    expect(alert.textContent).toContain('Something went wrong on our side')

    fail = false
    screen.getByRole('button', { name: 'Try again' }).focus()
    await user.keyboard('{Enter}')
    await messageList()
    expect(texts()).toEqual(['Hello!'])
    expect(document.activeElement.getAttribute('aria-busy')).not.toBeNull() // the chat area, not the page body
    expect(historyCalls(fetchMock)).toEqual(['limit=30', 'limit=30'])
  })

  test('network error: the connection message', async () => {
    await openChat({ history: responses.networkError })
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t reach Sesh')
  })

  test('unknown or inaccessible conversation (404): “Conversation not found”, nothing more is requested', async () => {
    const { fetchMock } = await openChat({ history: () => error(404, { message: 'Conversation not found.' }) })
    expect(await screen.findByText('Conversation not found')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Back to Messages' }).every((link) => link.getAttribute('href') === '/messages')).toBe(true)
    await wait(15_000)
    expect(historyCalls(fetchMock)).toHaveLength(1) // no polling
  })

  test('an id that isn’t a conversation id: not found without asking the server', async () => {
    const { fetchMock } = await openChat({}, '/messages/not-a-real-id')
    expect(await screen.findByText('Conversation not found')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/messages'))).toHaveLength(0)
  })

  test('expired session (401): sent to log in', async () => {
    let signedIn = true
    await openChat({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      history: () => {
        signedIn = false
        return error(401)
      },
    })
    await waitFor(() => expect(location()).toBe(`/login?returnTo=${encodeURIComponent(`/messages/${ID}`)}`))
  })

  test('403 PROFILE_REQUIRED: sent to Create Profile', async () => {
    let hasProfile = true
    await openChat({
      me: () => responses.signedIn(undefined, { hasCompletedProfile: hasProfile }),
      history: () => {
        hasProfile = false
        return error(403, { code: 'PROFILE_REQUIRED' })
      },
    })
    await waitFor(() => expect(location()).toBe('/create-profile'))
  })
})

// ---------- Sending ----------

describe('sending', () => {
  test('Enter sends the exact text; the bubble appears after the server confirms; the field clears and keeps focus', async () => {
    const user = setupUser()
    const saved = mine({ body: '  Hi 🌊 surf at 4?  ' })
    const { fetchMock } = await openChat({ history: () => latestPage([message({ body: 'Hey!' })]), send: () => jsonResponse(201, { message: saved }) })
    await messageList()

    await user.click(field())
    await user.keyboard('  Hi 🌊 surf at 4?  {Enter}')
    await waitFor(() => expect(texts()).toEqual(['Hey!', '  Hi 🌊 surf at 4?  ']))

    const [url, options] = sendCalls(fetchMock)[0]
    expect(url).toBe(`/api/v1/conversations/${ID}/messages`)
    expect(options.credentials).toBe('include')
    expect(JSON.parse(options.body)).toEqual({ body: '  Hi 🌊 surf at 4?  ' }) // not trimmed, no sender id
    expect(field().value).toBe('')
    expect(document.activeElement).toBe(field())
    expect(liveText()).toBe('Message sent.')
    expect(bubbles()[1].className).toContain('justify-end')
  })

  test('Shift+Enter adds a line; the Send button sends a multi-line message', async () => {
    const user = setupUser()
    const { fetchMock } = await openChat({ history: () => latestPage([]), send: (body) => jsonResponse(201, { message: mine({ body: body.body }) }) })
    await screen.findByText('No messages yet')

    await user.click(field())
    await user.keyboard('Line one{Shift>}{Enter}{/Shift}Line two')
    expect(field().value).toBe('Line one\nLine two')
    expect(sendCalls(fetchMock)).toHaveLength(0)

    await user.click(sendButton())
    await messageList()
    expect(texts()).toEqual(['Line one\nLine two'])
  })

  test('empty and whitespace-only messages can’t be sent', async () => {
    const user = setupUser()
    const { fetchMock } = await openChat({ history: () => latestPage([]) })
    await screen.findByText('No messages yet')
    expect(sendButton().disabled).toBe(true)

    await user.click(field())
    await user.keyboard('   {Shift>}{Enter}{/Shift}  {Enter}')
    expect(sendButton().disabled).toBe(true)
    expect(sendCalls(fetchMock)).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull() // nothing to explain
  })

  test('at most 2,000 characters, counted as Unicode code points', async () => {
    await openChat({ history: () => latestPage([]) })
    await screen.findByText('No messages yet')

    fireEvent.change(field(), { target: { value: '🌊'.repeat(2000) } }) // 4,000 UTF-16 units, 2,000 characters
    expect(sendButton().disabled).toBe(false)
    expect(screen.getByText('2,000 / 2,000')).toBeTruthy()
    expect(field().getAttribute('aria-invalid')).toBeNull()

    fireEvent.change(field(), { target: { value: '🌊'.repeat(2000) + 'a' } })
    expect(sendButton().disabled).toBe(true)
    expect(screen.getByText('Messages can be up to 2,000 characters.')).toBeTruthy()
    expect(screen.getByText('2,001 / 2,000')).toBeTruthy()
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(field().value).toHaveLength(4001) // never cut
  })

  test('a NUL character can’t be sent', async () => {
    await openChat({ history: () => latestPage([]) })
    await screen.findByText('No messages yet')
    fireEvent.change(field(), { target: { value: `Hi${String.fromCharCode(0)}there` } })
    expect(sendButton().disabled).toBe(true)
    expect(screen.getByText('Your message contains a character that can’t be sent.')).toBeTruthy()
  })

  test('Enter during IME composition doesn’t send', async () => {
    const { fetchMock } = await openChat({ history: () => latestPage([]) })
    await screen.findByText('No messages yet')
    fireEvent.change(field(), { target: { value: 'こんにちは' } })
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 229 })
    await wait(0)
    expect(sendCalls(fetchMock)).toHaveLength(0)
    expect(field().value).toBe('こんにちは')
  })

  test('while sending: progress, read-only field, and repeated Enter / clicks send only once', async () => {
    const user = setupUser()
    const answer = deferred()
    const { fetchMock } = await openChat({ history: () => latestPage([]), send: () => answer.promise })
    await screen.findByText('No messages yet')

    await user.click(field())
    await user.keyboard('Paddle out?{Enter}')
    await user.keyboard('{Enter}{Enter}')
    await user.click(sendButton())
    expect(sendCalls(fetchMock)).toHaveLength(1)
    expect(sendButton().getAttribute('aria-label')).toBe('Sending message')
    expect(sendButton().disabled).toBe(true)
    expect(field().readOnly).toBe(true)
    expect(field().value).toBe('Paddle out?')

    answer.resolve(jsonResponse(201, { message: mine({ body: 'Paddle out?' }) }))
    await messageList()
    expect(texts()).toEqual(['Paddle out?'])
    expect(field().readOnly).toBe(false)
  })

  test('a failed send keeps the draft and explains; trying again works', async () => {
    const user = setupUser()
    let fail = true
    await openChat({
      history: () => latestPage([]),
      send: (body) => (fail ? responses.networkError() : jsonResponse(201, { message: mine({ body: body.body }) })),
    })
    await screen.findByText('No messages yet')

    await user.click(field())
    await user.keyboard('See you at 4{Enter}')
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t reach Sesh')
    expect(field().value).toBe('See you at 4')
    expect(screen.queryByRole('list', { name: 'Messages' })).toBeNull()

    fail = false
    await user.keyboard('{Enter}')
    await messageList()
    expect(texts()).toEqual(['See you at 4'])
    expect(field().value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('the server’s message for a refused text is shown (400)', async () => {
    const user = setupUser()
    await openChat({ history: () => latestPage([]), send: () => error(400, { errors: { body: 'Message can’t be empty.' } }) })
    await screen.findByText('No messages yet')
    await user.click(field())
    await user.keyboard('Hi{Enter}')
    expect((await screen.findByRole('alert')).textContent).toContain('Message can’t be empty.')
    expect(field().value).toBe('Hi')
  })

  test('a sent message returned again by polling stays one bubble; sending doesn’t move the polling cursor', async () => {
    const user = setupUser()
    const first = message({ body: 'Hey!' })
    const saved = mine({ body: 'On my way' })
    const incoming = message({ body: 'Great' })
    const { fetchMock } = await openChat({
      history: (params) => (params.after ? newerPage([saved, incoming], params.after) : latestPage([first])),
      send: () => jsonResponse(201, { message: saved }),
    })
    await messageList()
    await user.click(field())
    await user.keyboard('On my way{Enter}')
    await waitFor(() => expect(texts()).toEqual(['Hey!', 'On my way']))

    await wait(5000)
    await waitFor(() => expect(texts()).toEqual(['Hey!', 'On my way', 'Great']))
    expect(historyCalls(fetchMock)[1]).toBe(`after=${cursorOf(first)}&limit=30`) // the cursor from history, not the sent message
  })
})

// ---------- Older history ----------

describe('load earlier messages', () => {
  test('before cursor, prepended in order without duplicates, stops when nothing older remains', async () => {
    const user = setupUser()
    const oldest = message({ body: 'Oldest' })
    const older = message({ body: 'Older' })
    const recent = Array.from({ length: 30 }, (_, index) => message({ body: `Recent ${index + 1}` }))
    const { fetchMock } = await openChat({
      history: (params) => {
        if (params.before) return olderPage([oldest, older, recent[0]]) // overlaps one already shown
        return latestPage(recent, { hasMore: true })
      },
    })
    await messageList()
    expect(texts()).toHaveLength(30)

    await user.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(texts()).toHaveLength(32))
    expect(texts().slice(0, 3)).toEqual(['Oldest', 'Older', 'Recent 1'])
    expect(historyCalls(fetchMock)[1]).toBe(`before=${cursorOf(recent[0])}&limit=30`)
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).toBeNull()
  })

  test('no button when there is nothing older', async () => {
    await openChat({ history: () => latestPage([message()]) })
    await messageList()
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).toBeNull()
  })

  test('while loading the button is busy and repeated clicks send one request', async () => {
    const user = setupUser()
    const answer = deferred()
    const recent = [message(), message()]
    const { fetchMock } = await openChat({ history: (params) => (params.before ? answer.promise : latestPage(recent, { hasMore: true })) })
    await messageList()
    await user.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    const busy = screen.getByRole('button', { name: /Loading…/ })
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(historyCalls(fetchMock).filter((query) => query.startsWith('before='))).toHaveLength(1)
    expect(announced()).toContain('Loading earlier messages…')
    answer.resolve(olderPage([message({ body: 'Earlier' })]))
    await waitFor(() => expect(texts()[0]).toBe('Earlier'))
  })

  test('a failure keeps the loaded messages; Try again works', async () => {
    const user = setupUser()
    let fail = true
    const recent = [message({ body: 'A' }), message({ body: 'B' })]
    await openChat({
      history: (params) => {
        if (!params.before) return latestPage(recent, { hasMore: true })
        return fail ? error(500) : olderPage([message({ body: 'Before A' })])
      },
    })
    await messageList()
    await user.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t load earlier messages')
    expect(texts()).toEqual(['A', 'B'])

    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(texts()).toEqual(['Before A', 'A', 'B']))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('scrolling', () => {
  // jsdom has no layout: each message is 100px tall, the history 400px
  function fakeLayout() {
    const scrollTops = new WeakMap()
    const isHistory = (element) => element.getAttribute?.('aria-label') === 'Message history'
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function () {
      return isHistory(this) ? this.querySelectorAll('[data-message-id]').length * 100 : 0
    })
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function () {
      return isHistory(this) ? 400 : 0
    })
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function () {
      return scrollTops.get(this) ?? 0
    })
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (value) {
      scrollTops.set(this, value)
    })
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () {
      if (!this.dataset?.messageId) return 0
      return [...this.parentElement.children].indexOf(this) * 100
    })
  }
  const history = () => screen.getByRole('region', { name: 'Message history' })

  test('opens at the newest message; new messages follow only when the reader is at the bottom', async () => {
    fakeLayout()
    const recent = Array.from({ length: 10 }, () => message())
    let next = []
    await openChat({ history: (params) => (params.after ? newerPage(next, params.after) : latestPage(recent)) })
    await messageList()
    expect(history().scrollTop).toBe(1000)

    next = [message({ body: 'New 1' })]
    await wait(5000)
    await waitFor(() => expect(texts()).toHaveLength(11))
    expect(history().scrollTop).toBe(1100) // followed

    // Reading older messages: not moved by new ones
    history().scrollTop = 100
    fireEvent.scroll(history())
    next = [message({ body: 'New 2' })]
    await wait(5000)
    await waitFor(() => expect(texts()).toHaveLength(12))
    expect(history().scrollTop).toBe(100)
  })

  test('loading earlier messages keeps the reader’s place', async () => {
    fakeLayout()
    const user = setupUser()
    const recent = Array.from({ length: 30 }, () => message())
    const earlier = Array.from({ length: 30 }, () => message())
    await openChat({ history: (params) => (params.before ? olderPage(earlier) : latestPage(recent, { hasMore: true })) })
    await messageList()

    history().scrollTop = 0 // scrolled up to the top, the button is visible
    fireEvent.scroll(history())
    await user.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(texts()).toHaveLength(60))
    expect(history().scrollTop).toBe(3000) // the previously first message is still at the top
  })
})

// ---------- Polling ----------

describe('polling', () => {
  test('starts after the history loaded, every 5 seconds, with the after cursor; nothing new keeps the cursor', async () => {
    const recent = [message({ body: 'Hey!' })]
    const { fetchMock } = await openChat({ history: (params) => (params.after ? newerPage([], params.after) : latestPage(recent)) })
    await messageList()
    expect(historyCalls(fetchMock)).toEqual(['limit=30'])

    await wait(4000)
    expect(historyCalls(fetchMock)).toHaveLength(1)
    await wait(1000)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(2))
    expect(historyCalls(fetchMock)[1]).toBe(`after=${cursorOf(recent[0])}&limit=30`)

    await wait(5000)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(3))
    expect(historyCalls(fetchMock)[2]).toBe(`after=${cursorOf(recent[0])}&limit=30`)
    expect(texts()).toEqual(['Hey!'])
  })

  test('new messages are appended and announced once; the cursor moves to the newest', async () => {
    const recent = [mine({ body: 'Surfing today?' })]
    const replies = [message({ body: 'Yes!' }), message({ body: 'Around 4 pm.' })]
    let next = [replies[0]]
    const { fetchMock } = await openChat({
      history: (params) => {
        if (!params.after) return latestPage(recent)
        const page = next
        next = []
        return newerPage(page, params.after)
      },
    })
    await messageList()

    await wait(5000)
    await waitFor(() => expect(texts()).toEqual(['Surfing today?', 'Yes!']))
    expect(liveText()).toBe('New message from Mariana Silva: Yes!')
    expect(document.activeElement).toBe(document.body) // focus isn't moved

    next = [replies[1], message({ body: 'Bring wax' })]
    await wait(5000)
    await waitFor(() => expect(texts()).toEqual(['Surfing today?', 'Yes!', 'Around 4 pm.', 'Bring wax']))
    expect(liveText()).toBe('2 new messages from Mariana Silva.')
    expect(historyCalls(fetchMock)[2]).toBe(`after=${cursorOf(replies[0])}&limit=30`)

    // Nothing new: the announcement isn't repeated
    await wait(5000)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(4))
    expect(historyCalls(fetchMock)[3]).toMatch(/^after=cursor-2e2e2e2e-0000-4000-8000-000000000004&/)
    expect(liveText()).toBe('2 new messages from Mariana Silva.')
  })

  test('hasMore: the next page is fetched right away until caught up (no message lost)', async () => {
    const recent = [message({ body: 'Start' })]
    const burst = Array.from({ length: 35 }, (_, index) => message({ body: `Burst ${index + 1}` }))
    const { fetchMock } = await openChat({
      history: (params) => {
        if (!params.after) return latestPage(recent)
        if (params.after === cursorOf(recent[0])) return newerPage(burst.slice(0, 30), params.after, { hasMore: true })
        if (params.after === cursorOf(burst[29])) return newerPage(burst.slice(30), params.after)
        return newerPage([], params.after)
      },
    })
    await messageList()
    await wait(5000)
    await waitFor(() => expect(texts()).toHaveLength(36))
    expect(texts().at(-1)).toBe('Burst 35')
    expect(historyCalls(fetchMock).slice(1, 3)).toEqual([`after=${cursorOf(recent[0])}&limit=30`, `after=${cursorOf(burst[29])}&limit=30`])
  })

  test('messages with the same timestamp keep the server’s order; repeated ones aren’t duplicated', async () => {
    const recent = [message({ body: 'Start' })]
    const sameTime = '2026-11-08T11:00:00.000Z'
    const a = message({ body: 'Same A', createdAt: sameTime })
    const b = message({ body: 'Same B', createdAt: sameTime })
    let page = [a, b]
    await openChat({
      history: (params) => {
        if (!params.after) return latestPage(recent)
        const answer = newerPage(page, params.after)
        page = [b] // the server never does this, but the list must stay clean
        return answer
      },
    })
    await messageList()
    await wait(5000)
    await waitFor(() => expect(texts()).toEqual(['Start', 'Same A', 'Same B']))
    await wait(5000)
    await wait(0)
    expect(texts()).toEqual(['Start', 'Same A', 'Same B'])
  })

  test('no overlapping requests: a slow poll delays the next one', async () => {
    const slow = deferred()
    let calls = 0
    const { fetchMock } = await openChat({
      history: (params) => {
        if (!params.after) return latestPage([message()])
        calls += 1
        return calls === 1 ? slow.promise : newerPage([], params.after)
      },
    })
    await messageList()
    await wait(5000)
    await wait(20_000)
    expect(historyCalls(fetchMock)).toHaveLength(2) // still waiting for the first poll

    slow.resolve(newerPage([], historyCalls(fetchMock)[1].split('&')[0].slice(6)))
    await wait(0)
    await wait(4900)
    expect(historyCalls(fetchMock)).toHaveLength(2)
    await wait(200)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(3))
  })

  test('pauses while the tab is hidden and checks right away when it is visible again', async () => {
    const { fetchMock } = await openChat({ history: (params) => (params.after ? newerPage([], params.after) : latestPage([message()])) })
    await messageList()

    setVisibility('hidden')
    await wait(30_000)
    expect(historyCalls(fetchMock)).toHaveLength(1)

    setVisibility('visible')
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(2))
    await wait(5000)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(3))
  })

  test('stops when the page is left (unmount): no timers or requests afterwards', async () => {
    const user = setupUser()
    const { fetchMock, unmount } = await openChat({ history: (params) => (params.after ? newerPage([], params.after) : latestPage([message()])) })
    await messageList()
    await user.click(screen.getByRole('link', { name: 'Back to Messages' }))
    expect(location()).toBe('/messages')
    await wait(30_000)
    expect(historyCalls(fetchMock)).toHaveLength(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('switching conversations: the old conversation’s late answer is ignored, only the new one is polled', async () => {
    const user = setupUser()
    const latePoll = deferred()
    const { fetchMock } = await openChat({
      history: (params, id) => {
        if (id === ID) return params.after ? latePoll.promise : latestPage([message({ body: 'In A' })])
        return params.after ? newerPage([], params.after) : latestPage([message({ conversationId: OTHER_ID, senderId: LUCAS.userId, body: 'In B' })])
      },
    })
    await messageList()
    await wait(5000) // A's poll is now waiting for an answer
    expect(historyCalls(fetchMock, ID)).toHaveLength(2)

    await user.click(screen.getByRole('link', { name: 'Back to Messages' }))
    await user.click(await screen.findByRole('link', { name: /Lucas Costa/ }))
    await waitFor(() => expect(texts()).toEqual(['In B']))
    expect(screen.getByRole('heading', { level: 1, name: 'Lucas Costa' })).toBeTruthy()

    latePoll.resolve(newerPage([message({ body: 'Late A' })], 'x'))
    await wait(5000)
    await waitFor(() => expect(historyCalls(fetchMock, OTHER_ID)).toHaveLength(2))
    expect(texts()).toEqual(['In B'])
    expect(historyCalls(fetchMock, ID)).toHaveLength(2)
  })

  test('a failed poll keeps the chat, says so once, and recovers with the same cursor', async () => {
    const recent = [message({ body: 'Hey!' })]
    let fail = 2
    const { fetchMock } = await openChat({
      history: (params) => {
        if (!params.after) return latestPage(recent)
        if (fail > 0) {
          fail -= 1
          return error(500)
        }
        return newerPage([message({ body: 'Back online' })], params.after)
      },
    })
    await messageList()
    await wait(5000)
    await waitFor(() => expect(screen.getAllByText(POLL_PROBLEM_MESSAGE)).toHaveLength(2)) // visible note + status region
    expect(announced()).toContain(POLL_PROBLEM_MESSAGE)
    expect(screen.queryByRole('alert')).toBeNull() // not an urgent alert every 5 seconds
    expect(texts()).toEqual(['Hey!'])

    await wait(5000)
    await wait(5000)
    await waitFor(() => expect(texts()).toEqual(['Hey!', 'Back online']))
    expect(screen.queryAllByText(POLL_PROBLEM_MESSAGE)).toHaveLength(0)
    const polls = historyCalls(fetchMock).slice(1)
    expect(polls.slice(0, 3).every((query) => query === `after=${cursorOf(recent[0])}&limit=30`)).toBe(true)
  })

  test('session expired during polling: polling stops and the user is sent to log in', async () => {
    let signedIn = true
    const { fetchMock } = await openChat({
      me: () => (signedIn ? responses.signedIn() : responses.signedOut()),
      history: (params) => {
        if (!params.after) return latestPage([message()])
        signedIn = false
        return error(401)
      },
    })
    await messageList()
    await wait(5000)
    await waitFor(() => expect(location()).toBe(`/login?returnTo=${encodeURIComponent(`/messages/${ID}`)}`))
    await wait(30_000)
    expect(historyCalls(fetchMock)).toHaveLength(2)
  })

  test('the conversation disappears (404 while polling): polling stops, messages stay, sending is closed', async () => {
    const { fetchMock } = await openChat({ history: (params) => (params.after ? error(404) : latestPage([message({ body: 'Hey!' })])) })
    await messageList()
    await wait(5000)
    expect((await screen.findByRole('alert')).textContent).toContain('This conversation is no longer available.')
    expect(texts()).toEqual(['Hey!'])
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
    await wait(30_000)
    expect(historyCalls(fetchMock)).toHaveLength(2)
  })

  test('empty conversation: polls the latest messages until the first arrives, then uses its cursor', async () => {
    const first = message({ body: 'Hi! Surfing tomorrow?' })
    let arrived = false
    const { fetchMock } = await openChat({
      history: (params) => {
        if (params.after) return newerPage([], params.after)
        return latestPage(arrived ? [first] : [])
      },
    })
    expect(await screen.findByText('No messages yet')).toBeTruthy()

    await wait(5000)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(2))
    expect(historyCalls(fetchMock)[1]).toBe('limit=30') // no cursor yet

    arrived = true
    await wait(5000)
    await waitFor(() => expect(texts()).toEqual(['Hi! Surfing tomorrow?']))
    expect(liveText()).toBe('New message from Mariana Silva: Hi! Surfing tomorrow?')

    await wait(5000)
    await waitFor(() => expect(historyCalls(fetchMock)).toHaveLength(4))
    expect(historyCalls(fetchMock)[3]).toBe(`after=${cursorOf(first)}&limit=30`)
  })
})
