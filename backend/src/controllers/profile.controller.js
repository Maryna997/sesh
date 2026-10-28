import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../db/index.js';
import { FavoriteSpot, SurfSpot, SurferProfile } from '../models/index.js';
import { missingRequiredFields, validateProfileInput } from '../utils/profileValidation.js';
import { toPublicSpot } from './surfSpot.controller.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Profile fields any signed-in surfer may see. Never includes account data
// (email, password hash, sessions) or the internal avatarPublicId.
function toPublicProfile(profile) {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    skillLevel: profile.skillLevel,
    boardType: profile.boardType,
    about: profile.about,
    avatarUrl: profile.avatarUrl,
    favoriteSpots: profile.favoriteSpots.map(toPublicSpot),
  };
}

// The owner's own view adds when the profile was created and last changed
export function toOwnProfile(profile) {
  return { ...toPublicProfile(profile), createdAt: profile.createdAt, updatedAt: profile.updatedAt };
}

// Loads a profile with its favourite spots (alphabetical), or null
export function findProfile(userId) {
  return SurferProfile.findByPk(userId, {
    include: [{ model: SurfSpot, as: 'favoriteSpots', through: { attributes: [] } }],
    order: [[{ model: SurfSpot, as: 'favoriteSpots' }, 'name', 'ASC']],
  });
}

function rejectInvalidProfile(res, errors) {
  return res.status(400).json({ status: 'error', message: 'Please check the profile details.', errors });
}

// Creates or updates the profile in one transaction, so the profile and its
// favourite spots are saved together or not at all.
// Returns { created } on success or { errors } when the request can't be applied.
async function saveProfile(userId, changes) {
  return sequelize.transaction(async (transaction) => {
    // Lock the row (if any) so two updates for the same user run one after another
    const existing = await SurferProfile.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });

    // A new profile needs both mandatory fields; nothing is saved otherwise
    if (!existing) {
      const missing = missingRequiredFields(changes);
      if (missing) return { errors: missing };
    }

    const { favoriteSpotIds, ...fields } = changes;

    if (favoriteSpotIds) {
      const found = await SurfSpot.findAll({
        where: { id: { [Op.in]: favoriteSpotIds } },
        attributes: ['id'],
        transaction,
      });
      const knownIds = new Set(found.map((spot) => spot.id));
      const unknownIds = favoriteSpotIds.filter((id) => !knownIds.has(id));
      if (unknownIds.length > 0) {
        return { errors: { favoriteSpotIds: `Unknown surf spot: ${unknownIds.join(', ')}.` } };
      }
    }

    if (existing) {
      existing.set(fields);
      // Changing only the spots still counts as updating the profile
      if (favoriteSpotIds) existing.changed('updatedAt', true);
      await existing.save({ transaction });
    } else {
      await SurferProfile.create({ ...fields, userId }, { transaction });
    }

    if (favoriteSpotIds) {
      await FavoriteSpot.destroy({ where: { userId }, transaction });
      await FavoriteSpot.bulkCreate(
        favoriteSpotIds.map((spotId) => ({ userId, spotId })),
        { transaction },
      );
    }

    return { created: !existing };
  });
}

// GET /api/v1/profile/me (requires authentication)
// The signed-in user's own profile, or { profile: null } if they haven't
// created one yet. Never creates a profile.
export async function getMyProfile(req, res) {
  const profile = await findProfile(req.auth.userId);
  return res.status(200).json({ profile: profile ? toOwnProfile(profile) : null });
}

// PUT /api/v1/profile/me (requires authentication)
// The first valid submission creates the profile (201); later ones update
// it (200). The owner is always the signed-in user, never a client-sent id.
export async function saveMyProfile(req, res) {
  const { errors, data } = validateProfileInput(req.body);
  if (errors) return rejectInvalidProfile(res, errors);

  const { userId } = req.auth;
  let result;

  try {
    result = await saveProfile(userId, data);
  } catch (error) {
    // Two first-time submissions at the same moment: both found no profile,
    // and the database's primary key rejected the second insert. That
    // profile exists now, so apply this request as an update instead.
    if (!(error instanceof UniqueConstraintError)) throw error;
    result = await saveProfile(userId, data);
  }

  if (result.errors) return rejectInvalidProfile(res, result.errors);

  const profile = await findProfile(userId);
  return res.status(result.created ? 201 : 200).json({ profile: toOwnProfile(profile) });
}

// GET /api/v1/profiles/:userId (requires authentication and a completed profile)
// Another surfer's public profile. A user without a profile and an unknown
// id get the same 404, so the response doesn't reveal which accounts exist.
export async function getPublicProfile(req, res) {
  const { userId } = req.params;
  const profile = UUID_PATTERN.test(userId) ? await findProfile(userId) : null;

  if (!profile) {
    return res.status(404).json({ status: 'error', message: 'Surfer profile not found.' });
  }
  return res.status(200).json({ profile: toPublicProfile(profile) });
}
