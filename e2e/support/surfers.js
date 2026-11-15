// Test surfers. Every account is unique (random suffix) and uses the
// reserved .invalid domain, so test accounts are easy to recognise and can
// never be real addresses. The database is emptied at the start of each run
// (global-setup.js), so runs never depend on each other.
//
// Setup through the API uses the real backend through the frontend's /api
// proxy, exactly like the browser does; nothing is mocked. Logging in with a
// browser context's `request` stores the session cookie in that context, so
// its pages are signed in.
import { expect } from '@playwright/test'
import { FRONTEND_URL } from './env.js'

export const PASSWORD = 'correct horse battery'
export const SPOTS = {
  carcavelos: { id: 'pt-cascais-carcavelos', name: 'Praia de Carcavelos' },
  supertubos: { id: 'pt-peniche-supertubos', name: 'Supertubos' },
}

let counter = 0
export function newSurfer(firstName) {
  counter += 1
  const suffix = `${Date.now().toString(36).slice(-5)}${counter}${Math.random().toString(36).slice(2, 5)}`
  return {
    email: `e2e-${firstName.toLowerCase()}-${suffix}@sesh-e2e.invalid`,
    password: PASSWORD,
    displayName: `${firstName} ${suffix}`,
  }
}

// A browser context with its own cookies (one per simulated person)
export function newContext(browser) {
  return browser.newContext({ baseURL: FRONTEND_URL })
}

async function ok(responsePromise, expected, what) {
  const response = await responsePromise
  expect(response.status(), `${what}: ${await response.text()}`).toBe(expected)
  return response.json()
}

// Registers, logs in and (optionally) creates the profile and availability,
// all through the real API. Returns the surfer with its user id.
export async function createSurferViaApi(context, surfer, { profile = true, skillLevel = 'intermediate', availability } = {}) {
  const { request } = context
  const registered = await ok(request.post('/api/v1/auth/register', { data: { email: surfer.email, password: surfer.password } }), 201, 'register')
  await ok(request.post('/api/v1/auth/login', { data: { email: surfer.email, password: surfer.password } }), 200, 'login')
  if (profile) {
    await ok(request.put('/api/v1/profile/me', { data: { displayName: surfer.displayName, skillLevel } }), 201, 'create profile')
  }
  if (availability) {
    await ok(request.post('/api/v1/availability/me', { data: availability }), 201, 'set availability')
  }
  return { ...surfer, id: registered.user.id }
}

// Logs in through the real login form. Fields are found by role and
// accessible name: required fields show a visual "*" in their <label>,
// which the accessible name leaves out.
export async function logInThroughUi(page, { email, password }) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}
