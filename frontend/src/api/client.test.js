import { describe, expect, test, vi } from 'vitest'
import { apiRequest } from './client'
import { jsonResponse } from '../test/utils'

describe('apiRequest', () => {
  test('uses a relative /api/v1 path, includes credentials and sends JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.pt', password: 'x' } })).resolves.toEqual({ ok: true })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/auth/login')
    expect(options.credentials).toBe('include')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.pt', password: 'x' })
  })

  test('network failure -> kind "network"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ kind: 'network' })
  })

  test('error status -> kind "http" with status, message and field errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { status: 'error', message: 'Please check the login details.', errors: { email: 'Email is required.' } })))
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      message: 'Please check the login details.',
      fieldErrors: { email: 'Email is required.' },
    })
  })

  test('non-JSON success (e.g. an HTML page) -> kind "unexpected"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })))
    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ kind: 'unexpected' })
  })

  test('error status without JSON body still gives kind "http"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })))
    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ kind: 'http', status: 502 })
  })
})
