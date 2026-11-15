// Scenario 4 — changing the email and the password in Settings & Privacy,
// with validation feedback, and what happens to sessions and logins after.
import { expect, test } from '@playwright/test'
import { createSurferViaApi, logInThroughUi, newContext, newSurfer } from '../support/surfers.js'

const NEW_PASSWORD = 'new wave every morning'

test('a surfer changes their email and password; validation errors are shown, they stay signed in, and only the new credentials work afterwards', async ({ browser }) => {
  const carla = newSurfer('Carla')
  const newEmail = carla.email.replace('e2e-carla-', 'e2e-carla-moved-')
  const context = await newContext(browser)
  const otherDevice = await newContext(browser)
  await createSurferViaApi(context, carla)
  // A second signed-in session (another device)
  const loggedIn = await otherDevice.request.post('/api/v1/auth/login', { data: { email: carla.email, password: carla.password } })
  expect(loggedIn.status()).toBe(200)

  const page = await context.newPage()

  // Email: invalid input is refused, then the change succeeds at once
  await page.goto('/settings/email')
  await expect(page.getByRole('textbox', { name: 'Current email', exact: true })).toHaveValue(carla.email)
  await page.getByRole('textbox', { name: 'New email address', exact: true }).fill('not-an-email')
  await page.getByRole('button', { name: 'Update email' }).click()
  await expect(page.getByText('Enter a valid email address, like you@example.com.')).toBeVisible()
  await page.getByRole('textbox', { name: 'New email address', exact: true }).fill(newEmail)
  await page.getByRole('button', { name: 'Update email' }).click()
  await expect(page.getByText(`Your email is now ${newEmail}.`, { exact: false })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Current email', exact: true })).toHaveValue(newEmail)

  // Password: a wrong current password is refused, then the change succeeds
  await page.goto('/settings/password')
  await page.getByRole('textbox', { name: 'Current password', exact: true }).fill('not my password')
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('textbox', { name: 'Confirm new password', exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Your current password is incorrect.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Current password', exact: true }).fill(carla.password)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Password updated')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Current password', exact: true })).toHaveValue('')

  // This browser is still signed in; the other device was signed out
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(carla.displayName, { exact: true })).toBeVisible()
  expect((await otherDevice.request.get('/api/v1/auth/me')).status()).toBe(401)

  // Log out through the account menu
  await page.getByRole('button', { name: 'My profile' }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeVisible()

  // Old email, or new email with the old password: refused
  for (const credentials of [
    { email: carla.email, password: NEW_PASSWORD },
    { email: newEmail, password: carla.password },
  ]) {
    await logInThroughUi(page, credentials)
    await expect(page.getByText('Incorrect email or password.')).toBeVisible()
  }

  // New email + new password: signed in
  await logInThroughUi(page, { email: newEmail, password: NEW_PASSWORD })
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('heading', { name: 'Available surfers' })).toBeVisible()

  await context.close()
  await otherDevice.close()
})
