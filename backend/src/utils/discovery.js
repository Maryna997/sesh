// Discover: query parameters and the public card shape.
//
// Only what a Discover card needs is ever returned: who (user id for
// navigation, display name, avatar, skill level) and their current
// availability (status, spot, approximate arrival). Board type, bio,
// favourite spots, email, account and session data, the Cloudinary public id
// and the expiry time are never included; the full public profile is a
// separate request (GET /api/v1/profiles/:userId).
import { API_STATUS } from './availabilityRules.js';
import { SKILL_LEVELS } from './profileValidation.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

// Accepted query parameters: pagination and the optional filters
const QUERY_FIELDS = ['page', 'limit', 'spotId', 'skillLevel', 'status', 'arrivalFrom', 'arrivalTo'];
const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/;

// Surf spot ids look like "pt-cascais-carcavelos" (whether it exists is
// checked against the database by the controller)
const SPOT_ID = /^[a-z0-9-]{1,100}$/;

// Statuses that can appear in Discover (API name -> stored value); OFF never does
const DISCOVERABLE_STATUS = { ACTIVE: 'active', COMING_SOON: 'coming_soon', AT_SPOT: 'at_spot' };

// ISO 8601 date-time with seconds optional and an explicit offset (Z or ±hh:mm),
// e.g. 2026-11-06T14:00:00Z. Without an offset the instant would depend on the
// server's time zone, so it is rejected.
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/;

// The instant of a strict ISO timestamp, or null. Date.parse alone accepts
// impossible dates (30 February becomes 2 March) and 24:00, so the calendar
// parts are checked first.
export function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', , offsetHours = '0', offsetMinutes = '0'] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(month) < 1 || Number(month) > 12 ||
    Number(day) < 1 || Number(day) > daysInMonth ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
    Number(offsetHours) > 14 || Number(offsetMinutes) > 59
  ) {
    return null;
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

// Returns { errors } or { page, limit, filters }.
// filters: { spotId?, skillLevel?, status? (stored value), arrivalFrom?, arrivalTo? (Dates) }
export function parseDiscoverQuery(query) {
  const errors = {};

  for (const field of Object.keys(query)) {
    if (!QUERY_FIELDS.includes(field)) errors[field] = 'This filter isn’t supported.';
  }

  // Repeated parameters (?page=1&page=2) arrive as arrays and are rejected
  const single = (field) => (typeof query[field] === 'string' ? query[field] : undefined);
  const isRepeated = (field) => query[field] !== undefined && typeof query[field] !== 'string';

  function positiveInteger(field, fallback) {
    const raw = query[field];
    if (raw === undefined) return fallback;
    if (isRepeated(field) || !POSITIVE_INTEGER.test(raw)) {
      errors[field] = `${field === 'page' ? 'Page' : 'Limit'} must be a whole number of 1 or more.`;
      return fallback;
    }
    return Number(raw);
  }

  const page = positiveInteger('page', DEFAULT_PAGE);
  const limit = positiveInteger('limit', DEFAULT_LIMIT);
  if (!errors.limit && limit > MAX_LIMIT) errors.limit = `Limit must be at most ${MAX_LIMIT}.`;

  const filters = {};

  if (query.spotId !== undefined) {
    if (isRepeated('spotId') || !SPOT_ID.test(single('spotId'))) errors.spotId = 'Choose a surf spot from the list.';
    else filters.spotId = query.spotId;
  }

  if (query.skillLevel !== undefined) {
    if (isRepeated('skillLevel') || !SKILL_LEVELS.includes(single('skillLevel'))) {
      errors.skillLevel = `Skill level must be one of: ${SKILL_LEVELS.join(', ')}.`;
    } else {
      filters.skillLevel = query.skillLevel;
    }
  }

  if (query.status !== undefined) {
    const stored = DISCOVERABLE_STATUS[single('status')];
    if (isRepeated('status') || !stored) {
      errors.status = `Status must be one of: ${Object.keys(DISCOVERABLE_STATUS).join(', ')}.`;
    } else {
      filters.status = stored;
    }
  }

  for (const field of ['arrivalFrom', 'arrivalTo']) {
    if (query[field] === undefined) continue;
    const instant = isRepeated(field) ? null : parseTimestamp(single(field));
    if (!instant) {
      errors[field] = 'Use a date and time with a time zone, like 2026-11-06T14:00:00Z.';
    } else {
      filters[field] = instant;
    }
  }
  if (filters.arrivalFrom && filters.arrivalTo && filters.arrivalFrom > filters.arrivalTo) {
    errors.arrivalTo = 'The end of the arrival time range must not be before its start.';
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { page, limit, filters };
}

// Approximate arrival as already calculated and stored (never recalculated):
// relative → the estimated arrival time; window → its start and end
function toPublicArrival(row) {
  if (row.arrivalType === 'relative') return { type: 'relative', arrivesAt: row.arrivalAt };
  if (row.arrivalType === 'window') return { type: 'window', startsAt: row.windowStartsAt, endsAt: row.windowEndsAt };
  return null;
}

// The public part of a current availability row (with its spot loaded):
// status, spot and approximate arrival. Never the expiry, the chosen offset
// or window hour, or any timestamps of the row itself. Used by Discover cards
// and by the public surfer profile, so both always show the same thing.
export function toPublicAvailability(row) {
  return {
    status: API_STATUS[row.status],
    // A spot's area tells apart spots with the same name (e.g. two "Praia do Cabedelo")
    spot: row.spot ? { id: row.spot.id, name: row.spot.name, area: row.spot.area } : null,
    arrival: toPublicArrival(row),
  };
}

// One Discover card from an availability row with its profile and spot
export function toDiscoverCard(row) {
  return {
    userId: row.userId,
    displayName: row.profile.displayName,
    avatarUrl: row.profile.avatarUrl,
    skillLevel: row.profile.skillLevel,
    availability: toPublicAvailability(row),
  };
}
