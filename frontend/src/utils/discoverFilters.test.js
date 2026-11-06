import { describe, expect, test } from 'vitest'
import { buildDiscoverQuery, DEFAULT_FILTERS, hasActiveFilters } from './discoverFilters'

const NOW = new Date('2026-11-06T14:10:00.000Z')
const query = (filters) => buildDiscoverQuery({ ...DEFAULT_FILTERS, ...filters }, NOW)

describe('buildDiscoverQuery', () => {
  test('the default filters send nothing', () => {
    expect(query({})).toEqual({})
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
  })

  test('each filter on its own', () => {
    expect(query({ spotId: 'pt-cascais-carcavelos' })).toEqual({ spotId: 'pt-cascais-carcavelos' })
    for (const skillLevel of ['beginner', 'intermediate', 'advanced']) expect(query({ skillLevel })).toEqual({ skillLevel })
    for (const status of ['ACTIVE', 'COMING_SOON', 'AT_SPOT']) expect(query({ status })).toEqual({ status })
  })

  test('filters combine', () => {
    expect(query({ spotId: 'pt-cascais-carcavelos', skillLevel: 'advanced', status: 'AT_SPOT' })).toEqual({
      spotId: 'pt-cascais-carcavelos',
      skillLevel: 'advanced',
      status: 'AT_SPOT',
    })
  })

  test('"Any time today" sends no arrival bounds', () => {
    expect(query({ status: 'COMING_SOON', arrival: 'any' })).toEqual({ status: 'COMING_SOON' })
  })

  test('"Within 1 hour" and "Within 2 hours" start now, as UTC instants', () => {
    expect(query({ status: 'COMING_SOON', arrival: 'within_1_hour' })).toEqual({
      status: 'COMING_SOON',
      arrivalFrom: '2026-11-06T14:10:00.000Z',
      arrivalTo: '2026-11-06T15:10:00.000Z',
    })
    expect(query({ status: 'COMING_SOON', arrival: 'within_2_hours' })).toMatchObject({
      arrivalFrom: '2026-11-06T14:10:00.000Z',
      arrivalTo: '2026-11-06T16:10:00.000Z',
    })
  })

  test('arrival bounds are never sent without Coming Soon', () => {
    for (const status of ['', 'ACTIVE', 'AT_SPOT']) {
      expect(query({ status, arrival: 'within_1_hour' })).toEqual(status ? { status } : {})
    }
  })

  test('invalid or missing values are ignored safely', () => {
    expect(query({ skillLevel: 'pro', status: 'OFF', arrival: 'yesterday', spotId: 42 })).toEqual({})
    expect(query({ skillLevel: 'Beginner', status: 'active' })).toEqual({})
    expect(query({ status: 'COMING_SOON', arrival: undefined })).toEqual({ status: 'COMING_SOON' })
    expect(buildDiscoverQuery(undefined, NOW)).toEqual({})
    expect(buildDiscoverQuery({}, NOW)).toEqual({})
  })

  test('hasActiveFilters is true for any real choice', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, skillLevel: 'beginner' })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, arrival: 'within_1_hour' })).toBe(false) // hidden without Coming Soon
  })
})
