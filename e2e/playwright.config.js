// Playwright configuration for the Sesh end-to-end tests.
//
// Starts the real backend (Express, against the disposable E2E database) and
// the real frontend (Vite dev server, proxying /api to that backend), then
// runs the tests in Chromium. Nothing is mocked.
//
// Browser: Playwright's Chromium by default (CI installs it). Set
// E2E_BROWSER_CHANNEL=msedge (or chrome) to use an installed Chromium-based
// browser instead of downloading one.
import { defineConfig, devices } from '@playwright/test'
import { BACKEND_URL, FRONTEND_PORT, FRONTEND_URL, backendEnv } from './support/env.js'

const env = backendEnv() // validates E2E_DATABASE_URL before anything starts

export default defineConfig({
  testDir: './tests',
  // One worker: the tests share one backend and database, and the messaging
  // journey depends on the frontend's 5-second polling
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './support/global-setup.js',
  use: {
    baseURL: FRONTEND_URL,
    // A missing element fails within 15 s instead of using up the whole test timeout
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.E2E_BROWSER_CHANNEL || undefined },
    },
  ],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: '../backend',
      url: `${BACKEND_URL}/api/v1/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      cwd: '../frontend',
      url: FRONTEND_URL,
      env: { API_PROXY_TARGET: BACKEND_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
