// Page scrolling regressions (touchpad scrolling stopped over the chat).
// jsdom has no real scrolling, so these tests check the causes we control:
// no wheel/touch listeners that could block scrolling, no wheel event
// prevented, scroll locks released after menus close or pages change, and
// the CSS that decides whether a nested scroll area hands the gesture to the
// page. Real scrolling was checked in a browser (see the private docs).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TEST_USER, jsonResponse, renderApp, responses } from '../../test/utils'
import SurfSpotCombobox from '../ui/SurfSpotCombobox'

const CONVERSATION_ID = '0c0c0c0c-0000-4000-8000-000000000001'
const MARIANA = { userId: '1d1d1d1d-0000-4000-8000-000000000001', displayName: 'Mariana Silva', avatarUrl: null }
const SPOT = { id: 'pt-cascais-carcavelos', name: 'Carcavelos', kind: 'beach', area: 'Carcavelos', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' }

const messages = Array.from({ length: 30 }, (_, index) => ({
  id: `2e2e2e2e-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  conversationId: CONVERSATION_ID,
  senderId: index % 2 ? TEST_USER.id : MARIANA.userId,
  body: `Message ${index + 1}`,
  createdAt: new Date(Date.UTC(2026, 10, 8, 9, index)).toISOString(),
}))

function mockBackend() {
  const fetchMock = vi.fn(async (url) => {
    const { pathname } = new URL(url, 'http://localhost')
    if (pathname === '/api/v1/auth/me') return responses.signedIn()
    if (pathname === '/api/v1/discover') return jsonResponse(200, { surfers: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
    if (pathname === '/api/v1/surf-spots') return jsonResponse(200, { spots: [SPOT] })
    if (pathname === '/api/v1/conversations') return jsonResponse(200, { conversations: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
    if (pathname === `/api/v1/conversations/${CONVERSATION_ID}/messages`) {
      return jsonResponse(200, {
        conversation: { id: CONVERSATION_ID, isActive: true, otherParticipant: MARIANA },
        messages: [...messages].reverse(),
        pagination: { hasMore: false, nextCursor: null, pollCursor: 'cursor' },
      })
    }
    throw new Error(`Unexpected request in test: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}

// Records wheel / touch listeners that could block scrolling: any that isn't
// passive (React's own root listeners are passive and are allowed)
let scrollListeners
beforeEach(() => {
  scrollListeners = []
  const original = EventTarget.prototype.addEventListener
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (type, listener, options) {
    const passive = typeof options === 'object' && options?.passive === true
    if (['wheel', 'mousewheel', 'touchmove', 'touchstart'].includes(type) && !passive) scrollListeners.push({ type, options })
    return original.call(this, type, listener, options)
  })
})
afterEach(() => {
  document.body.style.overflow = ''
})

const wheelIsAllowed = (target) => {
  const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return !event.defaultPrevented
}

describe('page scrolling', () => {
  test.each(['/', '/discover', '/messages', `/messages/${CONVERSATION_ID}`, '/settings', '/settings/delete-account'])(
    '%s: no blocking wheel/touch listeners, wheel not prevented, no scroll lock',
    async (path) => {
      mockBackend()
      renderApp(path)
      await screen.findByRole('heading', { level: 1 })
      expect(scrollListeners).toEqual([])
      expect(wheelIsAllowed(document.body)).toBe(true)
      expect(document.body.style.overflow).toBe('')
    },
  )

  test('chat history: its own scroll area, which hands the gesture to the page at its ends', async () => {
    mockBackend()
    renderApp(`/messages/${CONVERSATION_ID}`)
    const history = await screen.findByRole('region', { name: 'Message history' })
    await within(history).findByText('Message 30')
    expect(history.className).toContain('overflow-y-auto')
    expect(history.className).not.toMatch(/overscroll-(contain|none)/) // the cause of the stuck page
    expect(wheelIsAllowed(history)).toBe(true)
    expect(wheelIsAllowed(within(history).getByText('Message 12'))).toBe(true)
  })

  test('burger menu: scrolling is locked only while it is open (closing, a link and Escape release it)', async () => {
    const user = userEvent.setup()
    mockBackend()
    renderApp('/discover')
    await screen.findByRole('heading', { level: 1 })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(document.body.style.overflow).toBe('')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getByRole('dialog', { name: 'Main menu' })
    await user.click(within(menu).getByRole('link', { name: 'Messages' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Messages' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('')
    expect(scrollListeners).toEqual([])
  })

  test('leaving the page while the menu is open releases the lock (unmount)', async () => {
    const user = userEvent.setup()
    mockBackend()
    const { unmount } = renderApp('/discover')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('surf spot dropdown', () => {
  function Harness() {
    const [value, setValue] = useState(null)
    return <SurfSpotCombobox label="Surf spot" spots={[SPOT]} value={value} onChange={setValue} />
  }

  test('the open list scrolls on its own (kept: it shouldn’t move the page while choosing); wheel not prevented', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Surf spot' }))
    const list = screen.getByRole('listbox', { name: 'Surf spot results' })
    expect(list.className).toContain('overflow-y-auto')
    expect(list.className).toContain('overscroll-contain')
    expect(wheelIsAllowed(list)).toBe(true)
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Surf spot' }), { key: 'Escape' })
    expect(scrollListeners).toEqual([])
  })
})
