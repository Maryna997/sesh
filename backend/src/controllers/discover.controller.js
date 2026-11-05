import { Op } from 'sequelize';
import { SurfSpot, SurferAvailability, SurferProfile } from '../models/index.js';
import { currentlyAvailableWhere } from '../models/SurferAvailability.js';
import { parseDiscoverQuery, toDiscoverCard } from '../utils/discovery.js';
import { clock } from '../utils/clock.js';

// GET /api/v1/discover?page=1&limit=20
// (requires authentication and a completed profile)
//
// Surfers who are available right now: one row per surfer, straight from
// surfer_availability (one row per user), so there are never duplicates.
// - Available = not Off and expires_at strictly later than now (one captured
//   "now"; the same rule as everywhere else, so expired rows never count,
//   even before any cleanup).
// - Only surfers with a profile (inner join; every stored profile is
//   complete by the database's constraints), never the requesting user.
// - Newest declarations first (updated_at DESC), user_id as the unique
//   tie-breaker, so pages are stable.
// Later filters (spot, level, status, arrival) only add conditions to
// `where` / the profile include.
export async function discoverSurfers(req, res) {
  const parsed = parseDiscoverQuery(req.query);
  if (parsed.errors) {
    return res.status(400).json({ status: 'error', message: 'Please check the search options.', errors: parsed.errors });
  }
  const { page, limit } = parsed;
  const now = clock.now();

  const { rows, count } = await SurferAvailability.findAndCountAll({
    where: { ...currentlyAvailableWhere(now), userId: { [Op.ne]: req.auth.userId } },
    attributes: ['userId', 'status', 'arrivalType', 'arrivalAt', 'windowStartsAt', 'windowEndsAt', 'updatedAt'],
    include: [
      { model: SurferProfile, as: 'profile', required: true, attributes: ['displayName', 'avatarUrl', 'skillLevel'] },
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
