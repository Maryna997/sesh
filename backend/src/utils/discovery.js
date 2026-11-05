// Discover: query parameters and the public card shape.
//
// Only what a Discover card needs is ever returned: who (user id for
// navigation, display name, avatar, skill level) and their current
// availability (status, spot, approximate arrival). Board type, bio,
// favourite spots, email, account and session data, the Cloudinary public id
// and the expiry time are never included; the full public profile is a
// separate request (GET /api/v1/profiles/:userId).
import { API_STATUS } from './availabilityRules.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

// Accepted query parameters (filters will be added in the next task)
const QUERY_FIELDS = ['page', 'limit'];
const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/;

// Returns { errors } or { page, limit }
export function parseDiscoverQuery(query) {
  const errors = {};

  for (const field of Object.keys(query)) {
    if (!QUERY_FIELDS.includes(field)) errors[field] = 'This filter isn’t supported.';
  }

  function positiveInteger(field, fallback) {
    const raw = query[field];
    if (raw === undefined) return fallback;
    // Repeated parameters (?page=1&page=2) arrive as arrays
    if (typeof raw !== 'string' || !POSITIVE_INTEGER.test(raw)) {
      errors[field] = `${field === 'page' ? 'Page' : 'Limit'} must be a whole number of 1 or more.`;
      return fallback;
    }
    return Number(raw);
  }

  const page = positiveInteger('page', DEFAULT_PAGE);
  const limit = positiveInteger('limit', DEFAULT_LIMIT);
  if (!errors.limit && limit > MAX_LIMIT) errors.limit = `Limit must be at most ${MAX_LIMIT}.`;

  if (Object.keys(errors).length > 0) return { errors };
  return { page, limit };
}

// Approximate arrival as already calculated and stored (never recalculated):
// relative → the estimated arrival time; window → its start and end
function toPublicArrival(row) {
  if (row.arrivalType === 'relative') return { type: 'relative', arrivesAt: row.arrivalAt };
  if (row.arrivalType === 'window') return { type: 'window', startsAt: row.windowStartsAt, endsAt: row.windowEndsAt };
  return null;
}

// One Discover card from an availability row with its profile and spot
export function toDiscoverCard(row) {
  return {
    userId: row.userId,
    displayName: row.profile.displayName,
    avatarUrl: row.profile.avatarUrl,
    skillLevel: row.profile.skillLevel,
    availability: {
      status: API_STATUS[row.status],
      // A spot's area tells apart spots with the same name (e.g. two "Praia do Cabedelo")
      spot: row.spot ? { id: row.spot.id, name: row.spot.name, area: row.spot.area } : null,
      arrival: toPublicArrival(row),
    },
  };
}
