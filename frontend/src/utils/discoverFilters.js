// Discover filters: the choices shown on the page and how they become the
// query parameters of GET /api/v1/discover. The backend does all the
// filtering; this file only decides which parameters to send.
import { SKILL_LEVEL_OPTIONS } from '../config/skillLevels'

// Status choices (API names). Off is never searchable.
export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All available' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMING_SOON', label: 'Coming Soon' },
  { value: 'AT_SPOT', label: 'At the Spot' },
]

export const SKILL_FILTER_OPTIONS = [{ value: '', label: 'All levels' }, ...SKILL_LEVEL_OPTIONS]

// Approximate arrival (only for Coming Soon). `minutes` is the length of the
// search interval starting now; "Any time today" sends no bounds.
export const ARRIVAL_FILTER_OPTIONS = [
  { value: 'any', label: 'Any time today', minutes: null },
  { value: 'within_1_hour', label: 'Within 1 hour', minutes: 60 },
  { value: 'within_2_hours', label: 'Within 2 hours', minutes: 120 },
]

// Empty values mean "no restriction"
export const DEFAULT_FILTERS = { spotId: '', skillLevel: '', status: '', arrival: 'any' }

const isOption = (options, value) => value !== '' && options.some((option) => option.value === value)

// True when any filter narrows the results (used to tell "nobody is
// available" apart from "nobody matches these filters")
export function hasActiveFilters(filters) {
  return Object.keys(buildDiscoverQuery(filters, new Date())).length > 0
}

// The query parameters for the chosen filters at the moment `now`.
// Only real choices are included; unknown or empty values are left out.
// Arrival bounds are sent only with Coming Soon, as exact instants in UTC
// (toISOString): the backend compares instants, so no Lisbon offset is
// added or removed here.
export function buildDiscoverQuery(filters, now) {
  const query = {}
  const { spotId, skillLevel, status, arrival } = filters ?? {}

  if (typeof spotId === 'string' && spotId !== '') query.spotId = spotId
  if (isOption(SKILL_LEVEL_OPTIONS, skillLevel)) query.skillLevel = skillLevel
  if (isOption(STATUS_FILTER_OPTIONS, status)) query.status = status

  const minutes = ARRIVAL_FILTER_OPTIONS.find((option) => option.value === arrival)?.minutes
  if (query.status === 'COMING_SOON' && minutes) {
    query.arrivalFrom = now.toISOString()
    query.arrivalTo = new Date(now.getTime() + minutes * 60_000).toISOString()
  }

  return query
}
