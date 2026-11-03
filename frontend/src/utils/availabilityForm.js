// My Status form logic, kept separate from the components so it is easy to
// test: form values <-> API availability, which arrival choices are still
// possible today, validation, and the request body.
//
// The backend (POST/PUT /api/v1/availability/me) checks everything again and
// calculates every time itself; the frontend only sends choices.
import {
  ARRIVAL_WINDOW_HOURS,
  ARRIVAL_WINDOW_START_HOURS,
  AVAILABILITY,
  RELATIVE_ARRIVAL_OPTIONS,
} from '../config/availability'
import { formatHour, lisbonMinutesOfDay } from './lisbonTime'

const MINUTES_PER_DAY = 24 * 60

// Statuses that need / allow a spot, and that need an arrival
export const SPOT_REQUIRED = ['COMING_SOON', 'AT_SPOT']
export const SPOT_ALLOWED = ['ACTIVE', 'COMING_SOON', 'AT_SPOT']

export const EMPTY_FORM = { status: '', spotId: null, arrival: '' }

// The arrival as one select value: "relative:60" or "window:9"
export function encodeArrival(arrival) {
  if (!arrival) return ''
  return arrival.type === 'relative' ? `relative:${arrival.minutes}` : `window:${arrival.startHour}`
}

function decodeArrival(value) {
  const [type, number] = value.split(':')
  return type === 'relative' ? { type, minutes: Number(number) } : { type: 'window', startHour: Number(number) }
}

// Is the stored availability still counting right now? The server's `state`
// is the answer at the time of the request; this also notices when it
// expires while the page stays open.
export function currentState(availability, now) {
  if (!availability) return null
  if (availability.state === 'available' && availability.expiresAt && new Date(availability.expiresAt) <= now) {
    return 'expired'
  }
  return availability.state
}

// Form values for a saved availability. An expired status keeps its status
// and spot preselected (for quick reactivation), but not its old arrival,
// which has passed. Off starts with no spot or arrival.
export function formFromAvailability(availability, now) {
  if (!availability) return EMPTY_FORM
  const state = currentState(availability, now)
  if (state === 'off') return { status: 'OFF', spotId: null, arrival: '' }
  return {
    status: availability.status,
    spotId: availability.spot?.id ?? null,
    arrival: state === 'expired' ? '' : encodeArrival(availability.arrival),
  }
}

// Whether an arrival choice is still possible now (Lisbon time):
// - relative: arriving before midnight (no "tomorrow")
// - window: not ended yet (a started window is fine)
export function isArrivalPossible(value, now) {
  if (!value) return false
  const minutesNow = lisbonMinutesOfDay(now)
  const arrival = decodeArrival(value)
  if (arrival.type === 'relative') return minutesNow + arrival.minutes < MINUTES_PER_DAY
  return minutesNow < (arrival.startHour + ARRIVAL_WINDOW_HOURS) * 60
}

export const windowLabel = (startHour) => `${formatHour(startHour)}–${formatHour(startHour + ARRIVAL_WINDOW_HOURS)}`

// Choices for the arrival picker, in two groups ("In about…", "Time window
// today"); past choices are disabled and say why, so it isn't shown by colour alone
export function arrivalOptions(now) {
  const option = (value, label, endedLabel) => {
    const possible = isArrivalPossible(value, now)
    return { value, label: possible ? label : `${label} (${endedLabel})`, disabled: !possible }
  }
  return [
    {
      label: 'In about…',
      options: RELATIVE_ARRIVAL_OPTIONS.map(({ minutes, label }) => option(`relative:${minutes}`, label, 'too late today')),
    },
    {
      label: 'Time window today',
      options: ARRIVAL_WINDOW_START_HOURS.map((hour) => option(`window:${hour}`, windowLabel(hour), 'ended')),
    },
  ]
}

// Field errors for the current form values (empty object when valid)
export function validateAvailabilityForm(form, now) {
  const errors = {}
  if (!AVAILABILITY[form.status]) {
    errors.status = 'Choose a status.'
    return errors
  }
  if (SPOT_REQUIRED.includes(form.status) && !form.spotId) errors.spotId = 'Choose a surf spot.'
  if (form.status === 'COMING_SOON') {
    if (!form.arrival) errors.arrival = 'Choose when you expect to arrive.'
    else if (!isArrivalPossible(form.arrival, now)) errors.arrival = 'That time has passed. Choose another arrival time.'
  }
  return errors
}

// The request body: only the fields the chosen status uses. Never dates,
// expiry, user ids or coordinates; old values of other statuses are dropped.
export function buildAvailabilityPayload(form) {
  const body = { status: form.status }
  if (SPOT_ALLOWED.includes(form.status) && form.spotId) body.spotId = form.spotId
  if (form.status === 'COMING_SOON' && form.arrival) body.arrival = decodeArrival(form.arrival)
  return body
}

export function isSameForm(a, b) {
  return a.status === b.status && (a.spotId ?? null) === (b.spotId ?? null) && a.arrival === b.arrival
}
