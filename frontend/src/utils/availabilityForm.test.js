// Pure tests for My Status time and form logic.
// The device time zone is set to New York for this file: the development
// machine runs in Europe/London, which has the same offsets as Lisbon and
// would hide a bug that used the device time instead of Lisbon time.
process.env.TZ = 'America/New_York'

import { describe, expect, test } from 'vitest'
import { formatLisbonTime, lisbonMinutesOfDay } from './lisbonTime'
import {
  arrivalOptions,
  buildAvailabilityPayload,
  currentState,
  formFromAvailability,
  isArrivalPossible,
  validateAvailabilityForm,
} from './availabilityForm'

const at = (iso) => new Date(iso)
const SPOT = { id: 'pt-cascais-carcavelos', name: 'Praia de Carcavelos' }
const optionStates = (now) =>
  Object.fromEntries(arrivalOptions(now).flatMap((group) => group.options).map((option) => [option.value, !option.disabled]))

test('the device time zone really is New York in this file', () => {
  expect(at('2026-07-15T09:00:00Z').getHours()).toBe(5)
})

describe('Lisbon time display', () => {
  test('summer (UTC+1) and winter (UTC+0), regardless of the device time zone', () => {
    expect(formatLisbonTime('2026-07-15T11:00:00Z')).toBe('12:00')
    expect(formatLisbonTime('2026-12-15T11:00:00Z')).toBe('11:00')
    expect(formatLisbonTime('2026-07-15T23:00:00Z')).toBe('00:00') // midnight
  })

  test('summer-time change days', () => {
    expect(formatLisbonTime('2026-03-29T00:30:00Z')).toBe('00:30') // still WET
    expect(formatLisbonTime('2026-03-29T01:30:00Z')).toBe('02:30') // now WEST
    expect(formatLisbonTime('2026-10-25T00:30:00Z')).toBe('01:30') // still WEST
    expect(formatLisbonTime('2026-10-25T01:30:00Z')).toBe('01:30') // back to WET
  })

  test('minutes since Lisbon midnight', () => {
    expect(lisbonMinutesOfDay(at('2026-07-15T08:40:00Z'))).toBe(9 * 60 + 40)
    expect(lisbonMinutesOfDay(at('2026-12-15T08:40:00Z'))).toBe(8 * 60 + 40)
  })
})

describe('arrival choices still possible today', () => {
  test('at 09:40 Lisbon: the started 09:00–11:00 window and all relative options', () => {
    const states = optionStates(at('2026-07-15T08:40:00Z'))
    expect(states).toMatchObject({
      'relative:30': true,
      'relative:60': true,
      'relative:120': true,
      'window:5': false,
      'window:7': false,
      'window:9': true,
      'window:19': true,
    })
  })

  test('a window ends exactly at its end time', () => {
    expect(isArrivalPossible('window:9', at('2026-07-15T09:59:00Z'))).toBe(true) // 10:59
    expect(isArrivalPossible('window:9', at('2026-07-15T10:00:00Z'))).toBe(false) // 11:00
  })

  test('late evening: relative arrivals that would be tomorrow are not offered', () => {
    const states = optionStates(at('2026-07-15T22:10:00Z')) // 23:10 Lisbon
    expect(states).toMatchObject({ 'relative:30': true, 'relative:60': false, 'relative:120': false, 'window:19': false })
  })

  test('disabled choices say why (not only greyed out)', () => {
    const windows = arrivalOptions(at('2026-07-15T08:40:00Z'))[1].options
    expect(windows[0]).toEqual({ value: 'window:5', label: '05:00–07:00 (ended)', disabled: true })
    expect(windows[2]).toEqual({ value: 'window:9', label: '09:00–11:00', disabled: false })
  })

  test('winter: windows follow Lisbon time (09:40 Lisbon = 09:40 UTC)', () => {
    expect(isArrivalPossible('window:7', at('2026-12-15T08:59:00Z'))).toBe(true)
    expect(isArrivalPossible('window:7', at('2026-12-15T09:00:00Z'))).toBe(false)
  })
})

describe('request body: only the fields the status uses', () => {
  test('one body per status, from the brief', () => {
    expect(buildAvailabilityPayload({ status: 'ACTIVE', spotId: null, arrival: 'relative:60' })).toEqual({ status: 'ACTIVE' })
    expect(buildAvailabilityPayload({ status: 'ACTIVE', spotId: SPOT.id, arrival: '' })).toEqual({ status: 'ACTIVE', spotId: SPOT.id })
    expect(buildAvailabilityPayload({ status: 'COMING_SOON', spotId: SPOT.id, arrival: 'relative:60' })).toEqual({
      status: 'COMING_SOON',
      spotId: SPOT.id,
      arrival: { type: 'relative', minutes: 60 },
    })
    expect(buildAvailabilityPayload({ status: 'COMING_SOON', spotId: SPOT.id, arrival: 'window:9' })).toEqual({
      status: 'COMING_SOON',
      spotId: SPOT.id,
      arrival: { type: 'window', startHour: 9 },
    })
    expect(buildAvailabilityPayload({ status: 'AT_SPOT', spotId: SPOT.id, arrival: 'window:9' })).toEqual({ status: 'AT_SPOT', spotId: SPOT.id })
    expect(buildAvailabilityPayload({ status: 'OFF', spotId: SPOT.id, arrival: 'relative:30' })).toEqual({ status: 'OFF' })
  })
})

describe('validation', () => {
  const now = at('2026-07-15T09:00:00Z')
  test('status, required spot and arrival', () => {
    expect(validateAvailabilityForm({ status: '', spotId: null, arrival: '' }, now)).toEqual({ status: 'Choose a status.' })
    expect(validateAvailabilityForm({ status: 'ACTIVE', spotId: null, arrival: '' }, now)).toEqual({})
    expect(validateAvailabilityForm({ status: 'AT_SPOT', spotId: null, arrival: '' }, now)).toEqual({ spotId: 'Choose a surf spot.' })
    expect(validateAvailabilityForm({ status: 'COMING_SOON', spotId: null, arrival: '' }, now)).toEqual({
      spotId: 'Choose a surf spot.',
      arrival: 'Choose when you expect to arrive.',
    })
    expect(validateAvailabilityForm({ status: 'COMING_SOON', spotId: SPOT.id, arrival: 'window:7' }, now).arrival).toMatch(/has passed/)
    expect(validateAvailabilityForm({ status: 'OFF', spotId: null, arrival: '' }, now)).toEqual({})
  })
})

describe('saved availability → form and state', () => {
  const comingSoon = {
    status: 'COMING_SOON',
    state: 'available',
    spot: SPOT,
    arrival: { type: 'relative', minutes: 60, arrivesAt: '2026-07-15T10:00:00Z' },
    expiresAt: '2026-07-15T11:00:00.000Z',
  }

  test('an available status fills the form', () => {
    expect(formFromAvailability(comingSoon, at('2026-07-15T09:00:00Z'))).toEqual({ status: 'COMING_SOON', spotId: SPOT.id, arrival: 'relative:60' })
  })

  test('expired: status and spot kept for quick reactivation, old arrival dropped', () => {
    expect(formFromAvailability({ ...comingSoon, state: 'expired' }, at('2026-07-15T12:00:00Z'))).toEqual({ status: 'COMING_SOON', spotId: SPOT.id, arrival: '' })
  })

  test('Off and no record', () => {
    expect(formFromAvailability({ status: 'OFF', state: 'off', spot: null, arrival: null, expiresAt: null }, at('2026-07-15T09:00:00Z'))).toEqual({ status: 'OFF', spotId: null, arrival: '' })
    expect(formFromAvailability(null, at('2026-07-15T09:00:00Z'))).toEqual({ status: '', spotId: null, arrival: '' })
  })

  test('an available status counts as expired once its time has passed, even before asking the server again', () => {
    expect(currentState(comingSoon, at('2026-07-15T10:59:59Z'))).toBe('available')
    expect(currentState(comingSoon, at('2026-07-15T11:00:00Z'))).toBe('expired')
    expect(currentState({ status: 'OFF', state: 'off', expiresAt: null }, at('2026-07-15T11:00:00Z'))).toBe('off')
    expect(currentState(null, at('2026-07-15T11:00:00Z'))).toBe(null)
  })
})
