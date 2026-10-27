// Test helpers: a fake backend (mocked fetch) and a way to render the whole
// app at a given URL. No test talks to a real server or database.
import { render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { vi } from 'vitest'
import App from '../App'
import AuthProvider from '../auth/AuthProvider'

export const TEST_USER = {
  id: '4d2ff45b-92c9-4f03-b018-42bfea383d5c',
  email: 'surfer@example.com',
  createdAt: '2026-10-28T12:00:00.000Z',
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const responses = {
  signedOut: () => jsonResponse(401, { status: 'error', message: 'Authentication required.' }),
  signedIn: (user = TEST_USER) => jsonResponse(200, { user }),
  networkError: () => {
    throw new TypeError('Failed to fetch')
  },
  serverError: () => jsonResponse(500, { status: 'error', message: 'Something went wrong. Please try again later.' }),
}

// Replaces fetch with a fake backend. `routes` maps "METHOD /api/v1/path"
// to a function returning a Response (or throwing, to simulate a network
// failure). Unlisted requests fail the test. Returns the mock, so tests can
// inspect calls (URL, method, credentials, body).
export function mockApi(routes) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const key = `${options.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request in test: ${key}`)
    return handler(options)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// The parsed JSON body of the n-th call to a given endpoint
export function requestBody(fetchMock, key, index = 0) {
  const calls = fetchMock.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === key)
  return JSON.parse(calls[index][1].body)
}

// Shows the current URL in the DOM, so tests can check navigation
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

export function renderApp(path = '/', { state } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}
