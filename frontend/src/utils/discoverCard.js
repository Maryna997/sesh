// Text shown on Discover cards and in the surf spot filter.
import { SKILL_LEVEL_OPTIONS } from '../config/skillLevels'
import { formatLisbonTime } from './lisbonTime'

// Names used by more than one spot (e.g. the two "Praia do Cabedelo")
export function duplicateSpotNames(spots) {
  const seen = new Set()
  const duplicates = new Set()
  for (const spot of spots ?? []) {
    if (seen.has(spot.name)) duplicates.add(spot.name)
    seen.add(spot.name)
  }
  return duplicates
}

// "Carcavelos", or "Praia do Cabedelo, Viana do Castelo" when the name
// alone is ambiguous. The area is only added when it is needed.
export function spotLabel(spot, duplicateNames = new Set()) {
  if (!spot?.name) return ''
  return duplicateNames.has(spot.name) && spot.area ? `${spot.name}, ${spot.area}` : spot.name
}

export function skillLevelLabel(value) {
  return SKILL_LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? ''
}

// Approximate arrival in Portugal mainland time, as stored by the server:
//   relative -> "Coming around 17:00"
//   window   -> "Coming between 16:00–18:00" (never a single exact time)
export function formatArrival(arrival) {
  if (arrival?.type === 'relative' && arrival.arrivesAt) {
    return `Coming around ${formatLisbonTime(arrival.arrivesAt)}`
  }
  if (arrival?.type === 'window' && arrival.startsAt && arrival.endsAt) {
    return `Coming between ${formatLisbonTime(arrival.startsAt)}–${formatLisbonTime(arrival.endsAt)}`
  }
  return ''
}

// The spot line of a card. Active surfers may name a preferred spot, which
// is not a confirmed destination, so it is labelled as such.
export function cardSpotText(availability, duplicateNames) {
  const label = spotLabel(availability?.spot, duplicateNames)
  if (availability?.status === 'ACTIVE') return label ? `Preferred spot: ${label}` : 'No preferred spot'
  return label
}
