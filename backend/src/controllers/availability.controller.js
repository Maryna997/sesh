import { UniqueConstraintError } from 'sequelize';
import { SurfSpot, SurferAvailability } from '../models/index.js';
import { buildAvailability, toAvailabilityResponse } from '../utils/availabilityRules.js';
import { clock } from '../utils/clock.js';

// The signed-in surfer's availability: GET and POST /api/v1/availability/me.
// The owner always comes from the session (req.auth.userId); arrival times
// and the expiry are calculated here from one captured "now".

function findAvailability(userId) {
  return SurferAvailability.findOne({
    where: { userId },
    include: [{ model: SurfSpot, as: 'spot' }],
  });
}

function rejectInvalid(res, errors) {
  return res.status(400).json({ status: 'error', message: 'Please check the availability details.', errors });
}

function rejectExisting(res) {
  return res.status(409).json({
    status: 'error',
    code: 'AVAILABILITY_EXISTS',
    message: 'You already have an availability status.',
  });
}

// GET /api/v1/availability/me (requires authentication and a completed profile)
// { availability: null } when none was ever set; otherwise the status with
// its state: 'available', 'expired' (time is over) or 'off'.
export async function getMyAvailability(req, res) {
  const now = clock.now();
  const row = await findAvailability(req.auth.userId);
  return res.status(200).json({ availability: row ? toAvailabilityResponse(row, now) : null });
}

// POST /api/v1/availability/me (requires authentication and a completed profile)
// Creates the first availability (201). If one already exists, 409: changing
// it is a separate update request (Task 7.3).
export async function createMyAvailability(req, res) {
  const now = clock.now();
  const { userId } = req.auth;

  const { errors, data } = buildAvailability(req.body, now);
  if (errors) return rejectInvalid(res, errors);

  if (data.spotId && !(await SurfSpot.findByPk(data.spotId, { attributes: ['id'] }))) {
    return rejectInvalid(res, { spotId: 'Choose a surf spot from the list.' });
  }

  if (await SurferAvailability.findOne({ where: { userId }, attributes: ['id'] })) return rejectExisting(res);

  try {
    await SurferAvailability.create({ userId, ...data });
  } catch (error) {
    // Two first requests at the same moment: the unique user_id index lets
    // only one of them in
    if (error instanceof UniqueConstraintError) return rejectExisting(res);
    throw error;
  }

  const row = await findAvailability(userId);
  return res.status(201).json({ availability: toAvailabilityResponse(row, now) });
}
