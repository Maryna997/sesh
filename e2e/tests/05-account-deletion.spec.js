// Scenario 5 — account deletion with conversation retention (Task 10):
// the deleted account and its profile are gone, while the other surfer keeps
// a read-only copy of their conversation, shown as "Deleted account".
import { expect, test } from '@playwright/test'
import { createSurferViaApi, logInThroughUi, newContext, newSurfer } from '../support/surfers.js'

test('after a surfer deletes their account, the other surfer keeps the read-only conversation with "Deleted account", also after a reload', async ({ browser }) => {
  const dana = newSurfer('Dana') // stays
  const eli = newSurfer('Eli') // deletes their account
  const danaContext = await newContext(browser)
  const eliContext = await newContext(browser)
  await createSurferViaApi(danaContext, dana)
  const eliUser = await createSurferViaApi(eliContext, eli)

  // An existing conversation with one message from each (through the API)
  const started = await danaContext.request.post('/api/v1/conversations', { data: { recipientUserId: eliUser.id } })
  expect(started.status()).toBe(201)
  const conversationId = (await started.json()).conversation.id
  const fromDana = `Morning session? ${Date.now()}`
  const fromEli = `Count me in! ${Date.now()}`
  expect((await danaContext.request.post(`/api/v1/conversations/${conversationId}/messages`, { data: { body: fromDana } })).status()).toBe(201)
  expect((await eliContext.request.post(`/api/v1/conversations/${conversationId}/messages`, { data: { body: fromEli } })).status()).toBe(201)

  // Eli deletes their account through Settings
  const eliPage = await eliContext.newPage()
  await eliPage.goto('/settings/delete-account')
  const deleteButton = eliPage.getByRole('button', { name: 'Permanently delete account' })
  await expect(deleteButton).toBeDisabled()
  await eliPage.getByLabel('Type DELETE to confirm').fill('DELETE')
  await expect(deleteButton).toBeEnabled()
  await deleteButton.click()
  await expect(eliPage).toHaveURL(/\/$/)
  await expect(eliPage.getByRole('heading', { name: 'Find your people. Catch more waves.' })).toBeVisible()

  // Eli can no longer log in
  await logInThroughUi(eliPage, eli)
  await expect(eliPage.getByText('Incorrect email or password.')).toBeVisible()

  // Dana: the conversation is still in the inbox as "Deleted account"
  const page = await danaContext.newPage()
  await page.goto('/messages')
  const row = page.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Deleted account/ })
  await expect(row).toContainText(fromEli)
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/messages/${conversationId}$`))

  const checkReadOnlyConversation = async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Deleted account' })).toBeVisible()
    await expect(page.getByText('This surfer is no longer on Sesh.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Deleted account/ })).toHaveCount(0) // header is not a link
    const items = page.getByRole('list', { name: 'Messages' }).getByRole('listitem')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText(fromDana)
    await expect(items.nth(1)).toContainText(fromEli)
    await expect(page.getByText('This conversation is no longer active.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0) // no composer
  }
  await checkReadOnlyConversation()
  await page.reload()
  await checkReadOnlyConversation()

  // The server refuses new messages and new conversations, and the profile is gone
  const refused = await danaContext.request.post(`/api/v1/conversations/${conversationId}/messages`, { data: { body: 'Still there?' } })
  expect(refused.status()).toBe(409)
  expect((await danaContext.request.post('/api/v1/conversations', { data: { recipientUserId: eliUser.id } })).status()).toBe(404)
  await page.goto(`/surfers/${eliUser.id}`)
  await expect(page.getByRole('heading', { name: 'Surfer not found' })).toBeVisible()

  await danaContext.close()
  await eliContext.close()
})
