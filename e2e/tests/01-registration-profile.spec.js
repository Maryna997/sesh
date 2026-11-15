// Scenario 1 — registration, login, onboarding profile and profile editing,
// entirely through the UI against the real backend and database.
import { expect, test } from '@playwright/test'
import { newSurfer } from '../support/surfers.js'

test('a new surfer registers, logs in, creates a profile, edits it, and the changes persist after a reload', async ({ page }) => {
  const surfer = newSurfer('Ana')

  // Register (no session is started by registration)
  await page.goto('/register')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(surfer.email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(surfer.password)
  await page.getByRole('textbox', { name: 'Confirm password', exact: true }).fill(surfer.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Your account has been created')).toBeVisible()

  // Log in (the email is carried over from registration)
  await page.getByRole('main').getByRole('link', { name: 'Log in' }).click()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(surfer.email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(surfer.password)
  await page.getByRole('button', { name: 'Log in' }).click()

  // Without a profile, the app sends the surfer to onboarding
  await expect(page).toHaveURL(/\/create-profile$/)
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill(surfer.displayName)
  await page.getByLabel('Surf level').selectOption({ label: 'Beginner' })
  const spots = page.getByRole('combobox', { name: 'Favorite surf spots' })
  await spots.fill('Supertubos')
  await page.getByRole('option', { name: /Supertubos/ }).click()
  await expect(page.getByRole('list', { name: 'Chosen favorite spots' })).toContainText('Supertubos')
  await page.getByLabel('About').fill('Dawn patrol fan.')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page).toHaveURL(/\/discover$/)

  // My Profile shows what was saved
  await page.goto('/profile')
  const details = page.getByLabel('Profile details')
  await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(surfer.displayName, { exact: true })).toBeVisible()
  await expect(details).toContainText('Beginner')
  await expect(details).toContainText('Supertubos')
  await expect(details).toContainText('Dawn patrol fan.')

  // Edit: new level, board and about text
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByLabel('Surf level').selectOption({ label: 'Advanced' })
  await page.getByLabel('Board').selectOption({ label: 'Longboard' })
  await page.getByLabel('About').fill('Longboarder, mornings only.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible()
  await expect(details).toContainText('Advanced')
  await expect(details).toContainText('Longboard')

  // The changes come back from the server after a reload
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'My profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(surfer.displayName, { exact: true })).toBeVisible()
  await expect(details).toContainText('Advanced')
  await expect(details).toContainText('Longboard')
  await expect(details).toContainText('Longboarder, mornings only.')
  await expect(details).toContainText('Supertubos')
  await expect(details).not.toContainText('Beginner')
})
