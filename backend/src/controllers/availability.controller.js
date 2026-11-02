import { UniqueConstraintError } from 'sequelize';
import { sequelize } from '../db/index.js';
import { SurfSpot, SurferAvailability } from '../models/index.js';
import { buildAvailability, toAvailabilityResponse } from '../utils/availabilityRules.js';
import { clock } from '../utils/clock.js';

// The signed-in surfer's availability: GET, POST and PUT
// /api/v1/availability/me. The owner always comes from the session
// (req.auth.userId); arrival times and the expiry are calculated here from
// one captured "now".

function findAvailability(userId, transaction) {
  return SurferAvailability.findOne({
    where: { userId },
    include: [{ model: SurfSpot, as: 'spot' }],
    transaction,
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
// Creates the first availability (201). If one already exists (even expired
// or Off), 409: changing it is PUT.
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

// PUT /api/v1/availability/me (requires authentication and a completed profile)
// Replaces the current availability with the requested one (200): any status
// to any status, including Off, and reactivating an expired or Off record.
// Every PUT is a fresh declaration: the expiry is recalculated from now, even
// when the status is the same (e.g. At the Spot again = "still here").
//
// Replacement, not a merge: buildAvailability returns every stored field,
// with the ones the new status doesn't use set to null, so old arrival data
// or an old spot can never be carried over. The same row (and id) is kept.
// 404 if no availability exists yet: the first one is created with POST.
export async function updateMyAvailability(req, res) {
  const now = clock.now();
  const { userId } = req.auth;

  // Validate everything before touching the stored record
  const { errors, data } = buildAvailability(req.body, now);
  if (errors) return rejectInvalid(res, errors);

  if (data.spotId && !(await SurfSpot.findByPk(data.spotId, { attributes: ['id'] }))) {
    return rejectInvalid(res, { spotId: 'Choose a surf spot from the list.' });
  }

  // The row is locked while it is replaced, so concurrent updates run one
  // after another; each writes a complete status in a single UPDATE, and its
  // response is read before the lock is released (it shows its own result).
  const updated = await sequelize.transaction(async (transaction) => {
    const row = await SurferAvailability.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) return null;

    row.set(data);
    row.changed('updatedAt', true); // also a "renewal" with identical values
    await row.save({ transaction });
    return findAvailability(userId, transaction);
  });

  if (!updated) {
    return res.status(404).json({
      status: 'error',
      code: 'AVAILABILITY_NOT_FOUND',
      message: 'You haven’t set an availability status yet.',
    });
  }
  return res.status(200).json({ availability: toAvailabilityResponse(updated, now) });
}
