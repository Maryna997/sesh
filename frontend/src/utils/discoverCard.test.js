// The device time zone is New York for this file: arrival times must still
// be shown in Lisbon time.
process.env.TZ = 'America/New_York'

import { describe, expect, test } from 'vitest'
import { cardSpotText, duplicateSpotNames, formatArrival, skillLevelLabel, spotLabel } from './discoverCard'

const CARCAVELOS = { id: 'pt-cascais-carcavelos', name: 'Carcavelos', area: 'Carcavelos' }
const CABEDELO_VIANA = { id: 'pt-viana-cabedelo', name: 'Praia do Cabedelo', area: 'Viana do Castelo' }
const CABEDELO_FIGUEIRA = { id: 'pt-figueira-cabedelo', name: 'Praia do Cabedelo', area: 'Figueira da Foz' }

describe('formatArrival (Lisbon time)', () => {
  test('relative arrival: approximate time', () => {
    // Summer (UTC+1) and winter (UTC+0)
    expect(formatArrival({ type: 'relative', arrivesAt: '2026-07-15T16:00:00.000Z' })).toBe('Coming around 17:00')
    expect(formatArrival({ type: 'relative', arrivesAt: '2026-11-06T16:30:00.000Z' })).toBe('Coming around 16:30')
  })

  test('window: the window, never one exact time', () => {
    expect(formatArrival({ type: 'window', startsAt: '2026-07-15T15:00:00.000Z', endsAt: '2026-07-15T17:00:00.000Z' })).toBe(
      'Coming between 16:00–18:00',
    )
  })

  test('missing or unknown arrival shows nothing', () => {
    for (const arrival of [null, undefined, {}, { type: 'relative' }, { type: 'window', startsAt: '2026-07-15T15:00:00Z' }]) {
      expect(formatArrival(arrival)).toBe('')
    }
  })
})

describe('spot labels', () => {
  const duplicates = duplicateSpotNames([CARCAVELOS, CABEDELO_FIGUEIRA, CABEDELO_VIANA])

  test('the area is added only for names used by several spots', () => {
    expect([...duplicates]).toEqual(['Praia do Cabedelo'])
    expect(spotLabel(CARCAVELOS, duplicates)).toBe('Carcavelos')
    expect(spotLabel(CABEDELO_VIANA, duplicates)).toBe('Praia do Cabedelo, Viana do Castelo')
    expect(spotLabel(CABEDELO_FIGUEIRA, duplicates)).toBe('Praia do Cabedelo, Figueira da Foz')
    expect(spotLabel(null, duplicates)).toBe('')
  })

  test('card spot line per status', () => {
    expect(cardSpotText({ status: 'ACTIVE', spot: CARCAVELOS }, duplicates)).toBe('Preferred spot: Carcavelos')
    expect(cardSpotText({ status: 'ACTIVE', spot: null }, duplicates)).toBe('No preferred spot')
    expect(cardSpotText({ status: 'COMING_SOON', spot: CABEDELO_VIANA }, duplicates)).toBe('Praia do Cabedelo, Viana do Castelo')
    expect(cardSpotText({ status: 'AT_SPOT', spot: CARCAVELOS }, duplicates)).toBe('Carcavelos')
  })

  test('skill level labels', () => {
    expect(skillLevelLabel('advanced')).toBe('Advanced')
    expect(skillLevelLabel('unknown')).toBe('')
  })
})
