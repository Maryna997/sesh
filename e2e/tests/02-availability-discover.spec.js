// Scenario 2 — a surfer sets "At the Spot" on My Status through the UI and
// another signed-in surfer finds them on Discover, also with filters.
// "At the Spot" is used because it needs no arrival time and is valid at any
// time of day; it lasts until midnight in Lisbon, so the test first makes
// sure that moment isn't about to pass (support/lisbonMidnight.js).
import { expect, test } from '@playwright/test'
import { avoidLisbonMidnight } from '../support/lisbonMidnight.js'
import { createSurferViaApi, newContext, newSurfer } from '../support/surfers.js'

test('a surfer sets their availability and another surfer discovers them, with matching and non-matching filters', async ({ browser }) => {
  await avoidLisbonMidnight(test.info())
  const bea = newSurfer('Bea')
  const finder = newSurfer('Finn')
  const beaContext = await newContext(browser)
  const finderContext = await newContext(browser)
  await createSurferViaApi(beaContext, bea, { skillLevel: 'intermediate' })
  await createSurferViaApi(finderContext, finder)

  // Bea: My Status → At the Spot at Supertubos → Save
  const beaPage = await beaContext.newPage()
  await beaPage.goto('/status')
  // The radio input is visually hidden inside its option; click the option like a user
  await beaPage.getByText('At the Spot', { exact: true }).click()
  await expect(beaPage.getByRole('radio', { name: 'At the Spot' })).toBeChecked()
  await beaPage.getByRole('combobox', { name: 'Surf spot' }).fill('Supertubos')
  await beaPage.getByRole('option', { name: /Supertubos/ }).click()
  await beaPage.getByRole('button', { name: 'Save availability' }).click()
  await expect(beaPage.getByText('Your availability has been saved.')).toBeVisible()
  // Still set after a reload (stored by the server)
  await beaPage.reload()
  await expect(beaPage.getByRole('radio', { name: /At the Spot/ })).toBeChecked()

  // Finn: Discover lists Bea with her status and spot
  const page = await finderContext.newPage()
  await page.goto('/discover')
  const results = page.getByRole('list', { name: 'Available surfers' })
  const beaCard = results.getByRole('article').filter({ has: page.getByRole('heading', { name: bea.displayName }) })
  await expect(beaCard).toBeVisible()
  await expect(beaCard).toContainText('Intermediate · At the spot')
  await expect(beaCard).toContainText('Supertubos')

  const filters = page.getByLabel('Filters', { exact: true })
  const spotFilter = filters.getByRole('combobox', { name: 'Surf spot' })
  const chooseSpot = async (name) => {
    await spotFilter.fill(name)
    await page.getByRole('option', { name: new RegExp(name) }).click()
  }

  // Matching filters: her spot and status → still listed
  await chooseSpot('Supertubos')
  await expect(beaCard).toBeVisible()
  await filters.getByLabel('Availability').selectOption({ label: 'At the Spot' })
  await expect(beaCard).toBeVisible()

  // Non-matching filters → not listed
  await filters.getByLabel('Skill level').selectOption({ label: 'Advanced' })
  await expect(beaCard).toHaveCount(0)
  await filters.getByLabel('Skill level').selectOption({ label: 'Intermediate' })
  await expect(beaCard).toBeVisible()
  await filters.getByLabel('Availability').selectOption({ label: 'Active' })
  await expect(beaCard).toHaveCount(0)
  await filters.getByLabel('Availability').selectOption({ label: 'At the Spot' })
  await expect(beaCard).toBeVisible()
  await page.getByRole('button', { name: 'Clear surf spot' }).click()
  await chooseSpot('Praia de Carcavelos')
  await expect(beaCard).toHaveCount(0)

  await beaContext.close()
  await finderContext.close()
})
