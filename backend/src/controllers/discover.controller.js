import { Op } from 'sequelize';
import { SurfSpot, SurferAvailability, SurferProfile } from '../models/index.js';
import { currentlyAvailableWhere } from '../models/SurferAvailability.js';
import { parseDiscoverQuery, toDiscoverCard } from '../utils/discovery.js';
import { clock } from '../utils/clock.js';

function rejectQuery(res, errors) {
  return res.status(400).json({ status: 'error', message: 'Please check the search options.', errors });
}

// Coming Soon arrivals that overlap the requested time range [from, to]
// (either end may be missing; all comparisons are inclusive):
// - relative arrival: the stored estimate lies in the range
// - two-hour window: the window and the range overlap (they touch or share time)
// Uses the stored, server-calculated times; never the original 30/60/120 offset.
function arrivalCondition(from, to) {
  const relative = { arrivalType: 'relative' };
  const window = { arrivalType: 'window' };
  if (from) {
    relative.arrivalAt = { [Op.gte]: from };
    window.windowEndsAt = { [Op.gte]: from };
  }
  if (to) {
    relative.arrivalAt = { ...relative.arrivalAt, [Op.lte]: to };
    window.windowStartsAt = { [Op.lte]: to };
  }
  return { status: 'coming_soon', [Op.or]: [relative, window] };
}

// Every condition a surfer must meet (combined with AND)
function availabilityConditions(filters, now, viewerId) {
  const conditions = [currentlyAvailableWhere(now), { userId: { [Op.ne]: viewerId } }];
  // The spot of the CURRENT availability (Coming Soon destination, At the
  // Spot location, or Active preferred spot). Active without a spot never
  // matches a spot filter. Favourite spots are not used.
  if (filters.spotId) conditions.push({ spotId: filters.spotId });
  if (filters.status) conditions.push({ status: filters.status });
  // An arrival range only applies to Coming Soon: combined with ACTIVE or
  // AT_SPOT it gives an empty result, never a broader one.
  if (filters.arrivalFrom || filters.arrivalTo) conditions.push(arrivalCondition(filters.arrivalFrom, filters.arrivalTo));
  return { [Op.and]: conditions };
}

// GET /api/v1/discover (requires authentication and a completed profile)
// Optional filters: spotId, skillLevel, status, arrivalFrom, arrivalTo,
// combined with AND; pagination: page, limit (see docs).
//
// Surfers who are available right now: one row per surfer, straight from
// surfer_availability (one row per user), so there are never duplicates.
// - Available = not Off and expires_at strictly later than now (one captured
//   "now"; the same rule as everywhere else, so expired rows never count,
//   even before any cleanup).
// - Only surfers with a profile (inner join; every stored profile is
//   complete by the database's constraints), never the requesting user.
// - All filters are SQL conditions applied before LIMIT/OFFSET, so the page
//   and the total describe the filtered results.
// - Newest declarations first (updated_at DESC), user_id as the unique
//   tie-breaker, so pages are stable.
export async function discoverSurfers(req, res) {
  const parsed = parseDiscoverQuery(req.query);
  if (parsed.errors) return rejectQuery(res, parsed.errors);
  const { page, limit, filters } = parsed;

  // An unknown spot is a mistake in the request, as in the availability API
  if (filters.spotId && !(await SurfSpot.findByPk(filters.spotId, { attributes: ['id'] }))) {
    return rejectQuery(res, { spotId: 'Choose a surf spot from the list.' });
  }

  const now = clock.now();
  const { rows, count } = await SurferAvailability.findAndCountAll({
    where: availabilityConditions(filters, now, req.auth.userId),
    attributes: ['userId', 'status', 'arrivalType', 'arrivalAt', 'windowStartsAt', 'windowEndsAt', 'updatedAt'],
    include: [
      {
        model: SurferProfile,
        as: 'profile',
        required: true,
        attributes: ['displayName', 'avatarUrl', 'skillLevel'],
        // The surfer's own profile level only
        ...(filters.skillLevel && { where: { skillLevel: filters.skillLevel } }),
      },
      { model: SurfSpot, as: 'spot', required: false, attributes: ['id', 'name', 'area'] },
    ],
    order: [
      ['updatedAt', 'DESC'],
      ['userId', 'ASC'],
    ],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return res.status(200).json({
    surfers: rows.map(toDiscoverCard),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  });
}
