// Scenario 3 — two surfers message each other through the real UI. The
// reply reaches the first surfer through the chat's 5-second HTTP polling
// (the assertion waits for it; no fixed sleep). Bruno's availability (needed
// for his Discover card) lasts until midnight in Lisbon, so the test first
// makes sure that moment isn't about to pass (support/lisbonMidnight.js).
import { expect, test } from '@playwright/test'
import { avoidLisbonMidnight } from '../support/lisbonMidnight.js'
import { SPOTS, createSurferViaApi, newContext, newSurfer } from '../support/surfers.js'

const POLLING_WAIT = { timeout: 20_000 } // polling every 5 s, plus margin

test('surfer A finds surfer B on Discover, they exchange messages, and the history survives a reload', async ({ browser }) => {
  await avoidLisbonMidnight(test.info())
  const alex = newSurfer('Alex')
  const bruno = newSurfer('Bruno')
  const alexContext = await newContext(browser)
  const brunoContext = await newContext(browser)
  await createSurferViaApi(alexContext, alex)
  await createSurferViaApi(brunoContext, bruno, { availability: { status: 'AT_SPOT', spotId: SPOTS.carcavelos.id } })

  // Alex: Discover → Message on Bruno's card → the chat opens
  const alexPage = await alexContext.newPage()
  await alexPage.goto('/discover')
  await alexPage.getByRole('button', { name: `Message ${bruno.displayName}` }).click()
  await expect(alexPage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/)
  await expect(alexPage.getByRole('heading', { level: 1, name: bruno.displayName })).toBeVisible()
  await expect(alexPage.getByText('No messages yet')).toBeVisible()

  const first = `Surf at Carcavelos at 4? ${Date.now()}`
  await alexPage.getByRole('textbox', { name: 'Message' }).fill(first)
  await alexPage.getByRole('button', { name: 'Send message' }).click()
  const alexHistory = alexPage.getByRole('list', { name: 'Messages' })
  await expect(alexHistory.getByText(first)).toBeVisible()
  await expect(alexPage.getByRole('textbox', { name: 'Message' })).toHaveValue('')

  // Bruno: Messages inbox → the conversation with Alex → reply
  const brunoPage = await brunoContext.newPage()
  await brunoPage.goto('/messages')
  const row = brunoPage.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: new RegExp(alex.displayName) })
  await expect(row).toContainText(first)
  await row.click()
  await expect(brunoPage.getByRole('heading', { level: 1, name: alex.displayName })).toBeVisible()
  await expect(brunoPage.getByRole('list', { name: 'Messages' }).getByText(first)).toBeVisible()
  const reply = `Yes! See you there ${Date.now()}`
  await brunoPage.getByRole('textbox', { name: 'Message' }).fill(reply)
  await brunoPage.keyboard.press('Enter')
  await expect(brunoPage.getByRole('list', { name: 'Messages' }).getByText(reply)).toBeVisible()

  // Alex receives the reply without reloading (HTTP polling)
  await expect(alexHistory.getByText(reply)).toBeVisible(POLLING_WAIT)

  // Both messages are still there after a reload, in order
  await alexPage.reload()
  const items = alexPage.getByRole('list', { name: 'Messages' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText(first)
  await expect(items.nth(1)).toContainText(reply)

  await alexContext.close()
  await brunoContext.close()
})
