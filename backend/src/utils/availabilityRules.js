// Validation and time calculations for availability requests.
//
// buildAvailability(body, now) turns a request body into the fields to store
// (or field errors), using ONE captured `now` for every calculation, so a
// request near a boundary (e.g. 23:59:59) is judged consistently.
//
// Request body (also intended for updates in Task 7.3):
//   { "status": "ACTIVE" | "COMING_SOON" | "AT_SPOT" | "OFF",
//     "spotId": "pt-…" (optional for ACTIVE, required for COMING_SOON/AT_SPOT),
//     "arrival": { "type": "relative", "minutes": 30 | 60 | 120 }
//              | { "type": "window", "startHour": 5 | 7 | … | 19 } (COMING_SOON only) }
//
// The client never sends dates, timestamps, an expiry or a user id: every
// time is derived from `now` on the server, and only "today" (Lisbon) exists.
//
// Whether the spot exists is checked against the database by the controller.
import {
  ARRIVAL_WINDOW_HOURS,
  ARRIVAL_WINDOW_START_HOURS,
  RELATIVE_ARRIVAL_MINUTES,
} from '../models/SurferAvailability.js';
import { lisbonParts, lisbonTimeToday, startOfNextLisbonDay } from './lisbonTime.js';
import { toPublicSpot } from '../controllers/surfSpot.controller.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// How long each status stays available (before the end-of-day cap)
export const AFTER_ARRIVAL_MS = 1 * HOUR; // Coming Soon: 1 h after arrival / window end
export const AT_SPOT_DURATION_MS = 3 * HOUR;

// API status names <-> stored values
export const API_STATUS = { active: 'ACTIVE', coming_soon: 'COMING_SOON', at_spot: 'AT_SPOT', off: 'OFF' };
const STORED_STATUS = Object.fromEntries(Object.entries(API_STATUS).map(([stored, api]) => [api, stored]));

const BODY_FIELDS = ['status', 'spotId', 'arrival'];
const SPOT_ID_MAX_LENGTH = 100;

const isMissing = (value) => value === undefined || value === null;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const earliest = (a, b) => (a.getTime() <= b.getTime() ? a : b);

function validateSpotId(value, required) {
  if (isMissing(value) || value === '') {
    return required ? { error: 'Choose a surf spot.' } : { value: null };
  }
  if (typeof value !== 'string' || value.length > SPOT_ID_MAX_LENGTH) return { error: 'Choose a surf spot from the list.' };
  return { value };
}

// Coming Soon arrival -> stored fields + expiry, or an error message
function buildArrival(arrival, now, endOfDay) {
  if (isMissing(arrival)) return { error: 'Choose when you expect to arrive.' };
  if (!isPlainObject(arrival)) return { error: 'Arrival must be a relative time or a window.' };

  if (arrival.type === 'relative') {
    if (Object.keys(arrival).some((key) => !['type', 'minutes'].includes(key))) {
      return { error: 'A relative arrival only takes "minutes".' };
    }
    if (!RELATIVE_ARRIVAL_MINUTES.includes(arrival.minutes)) {
      return { error: `Choose an arrival in about ${RELATIVE_ARRIVAL_MINUTES.join(', ')} minutes.` };
    }
    const arrivalAt = new Date(now.getTime() + arrival.minutes * MINUTE);
    // Arriving at (or after) midnight would be tomorrow
    if (arrivalAt.getTime() >= endOfDay.getTime()) {
      return { error: 'That arrival time would be tomorrow. Availability can only be set for today.' };
    }
    return {
      fields: { arrivalType: 'relative', arrivalOffsetMinutes: arrival.minutes, arrivalAt },
      expiresAt: earliest(new Date(arrivalAt.getTime() + AFTER_ARRIVAL_MS), endOfDay),
    };
  }

  if (arrival.type === 'window') {
    if (Object.keys(arrival).some((key) => !['type', 'startHour'].includes(key))) {
      return { error: 'An arrival window only takes "startHour".' };
    }
    if (!ARRIVAL_WINDOW_START_HOURS.includes(arrival.startHour)) {
      return { error: 'Choose one of the two-hour arrival windows between 05:00 and 21:00.' };
    }
    // Always today's window (Lisbon time); the client can't pick a date
    const windowStartsAt = lisbonTimeToday(now, arrival.startHour);
    const windowEndsAt = lisbonTimeToday(now, arrival.startHour + ARRIVAL_WINDOW_HOURS);
    // A window that has started is fine; one that has ended is not
    if (windowEndsAt.getTime() <= now.getTime()) {
      return { error: 'That arrival window has already ended. Choose a later window or a relative time.' };
    }
    return {
      fields: { arrivalType: 'window', windowStartsAt, windowEndsAt },
      expiresAt: earliest(new Date(windowEndsAt.getTime() + AFTER_ARRIVAL_MS), endOfDay),
    };
  }

  return { error: 'Arrival type must be "relative" or "window".' };
}

const EMPTY_ARRIVAL = {
  arrivalType: null,
  arrivalOffsetMinutes: null,
  arrivalAt: null,
  windowStartsAt: null,
  windowEndsAt: null,
};

// Returns { errors } (field -> message) or { data } with every stored field
// (irrelevant ones set to null), ready to save.
export function buildAvailability(body, now) {
  if (!isPlainObject(body)) {
    return { errors: { body: 'Request body must be a JSON object with an availability status.' } };
  }

  const errors = {};
  // Dates, expiry and owner are always decided by the server
  for (const field of Object.keys(body)) {
    if (!BODY_FIELDS.includes(field)) errors[field] = 'This field can’t be set.';
  }

  const status = STORED_STATUS[body.status];
  if (!status) {
    errors.status = isMissing(body.status)
      ? 'Choose an availability status.'
      : 'Status must be one of: ACTIVE, COMING_SOON, AT_SPOT, OFF.';
    return { errors };
  }

  const endOfDay = startOfNextLisbonDay(now);
  const spot = validateSpotId(body.spotId, status === 'coming_soon' || status === 'at_spot');
  if (spot.error) errors.spotId = spot.error;
  if (status === 'off' && spot.value) errors.spotId = 'Off doesn’t take a surf spot.';

  let arrivalFields = EMPTY_ARRIVAL;
  let expiresAt = null;

  if (status === 'coming_soon') {
    const arrival = buildArrival(body.arrival, now, endOfDay);
    if (arrival.error) errors.arrival = arrival.error;
    else {
      arrivalFields = { ...EMPTY_ARRIVAL, ...arrival.fields };
      expiresAt = arrival.expiresAt;
    }
  } else if (!isMissing(body.arrival)) {
    errors.arrival = 'An arrival time is only used with Coming Soon.';
  }

  if (status === 'active') expiresAt = endOfDay;
  if (status === 'at_spot') expiresAt = earliest(new Date(now.getTime() + AT_SPOT_DURATION_MS), endOfDay);

  // Never store something that is already over (OFF has no expiry)
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    errors.status = 'This availability would already be over. Please try again.';
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { data: { status, spotId: spot.value ?? null, ...arrivalFields, expiresAt } };
}

// The API view of a stored availability (never the row id or user id)
export function toAvailabilityResponse(row, now) {
  const isOff = row.status === 'off';
  const isAvailable = row.isCurrentlyAvailable(now);
  let arrival = null;
  if (row.arrivalType === 'relative') {
    arrival = { type: 'relative', minutes: row.arrivalOffsetMinutes, arrivesAt: row.arrivalAt };
  } else if (row.arrivalType === 'window') {
    arrival = {
      type: 'window',
      startHour: lisbonParts(row.windowStartsAt).hour,
      startsAt: row.windowStartsAt,
      endsAt: row.windowEndsAt,
    };
  }

  return {
    status: API_STATUS[row.status],
    // 'available': counts now; 'expired': the time is over; 'off': not available
    state: isOff ? 'off' : isAvailable ? 'available' : 'expired',
    isAvailable,
    spot: row.spot ? toPublicSpot(row.spot) : null,
    arrival,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}
