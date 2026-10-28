import { sequelize } from '../db/index.js';
import { SurferProfile } from '../models/index.js';
import { avatarStorage, isOwnAvatarPublicId } from '../services/avatarStorage.js';
import { detectImageType } from '../utils/imageType.js';
import { rejectAvatar } from '../middleware/parseAvatarUpload.js';
import { findProfile, toOwnProfile } from './profile.controller.js';

// Profile pictures: POST and DELETE /api/v1/profile/me/avatar.
//
// The picture always belongs to the signed-in user (req.auth.userId); the
// request never says whose picture or which Cloudinary image to change.
// Cloudinary URLs and public ids only ever come from Cloudinary's own upload
// response and are stored by the backend.
//
// Order of operations, so a profile never points to a missing image:
// - upload/replace: upload the new image -> save it on the profile ->
//   delete the previous image. If saving fails, the new upload is deleted.
// - remove: clear the profile fields -> delete the image.
// Deleting an old image is "best effort": if it fails, the user's change
// still succeeds and a short diagnostic is logged (the image is orphaned on
// Cloudinary and can be cleaned up later).

function logAvatarProblem(context, error) {
  if (process.env.NODE_ENV === 'test') return;
  // Only the error type and message: never credentials or request data
  console.error(`Avatar ${context} failed: ${error?.name ?? 'Error'}: ${error?.message ?? 'unknown error'}`);
}

// Deletes an image we stored, without ever failing the request
async function removeStoredImage(publicId, context) {
  if (!isOwnAvatarPublicId(publicId)) {
    if (publicId) logAvatarProblem(context, new Error('Refused to delete an image outside the avatars folder.'));
    return;
  }
  if (!avatarStorage.isEnabled()) {
    logAvatarProblem(context, new Error('Cloudinary is not configured.'));
    return;
  }
  try {
    await avatarStorage.remove(publicId);
  } catch (error) {
    logAvatarProblem(context, error);
  }
}

// Cloudinary answers 400 when the file can't be decoded as an allowed image
function isRejectedImage(error) {
  return error?.http_code === 400;
}

async function sendOwnProfile(res, userId) {
  const profile = await findProfile(userId);
  return res.status(200).json({ profile: toOwnProfile(profile) });
}

// Before the upload is read: answer 503 if uploads aren't configured, so the
// client doesn't send 5 MB for nothing.
export function requireAvatarUploads(req, res, next) {
  if (!avatarStorage.isEnabled()) {
    return res.status(503).json({ status: 'error', message: 'Profile picture uploads are not available right now.' });
  }
  return next();
}

// POST /api/v1/profile/me/avatar (multipart/form-data, one file in "avatar")
// Requires authentication and a completed profile. Uploads the picture and
// returns the updated profile (200).
export async function uploadMyAvatar(req, res) {
  const { userId } = req.auth;

  if (!req.file) return rejectAvatar(res, 400, 'Choose an image to upload.');
  if (!detectImageType(req.file.buffer)) {
    return rejectAvatar(res, 400, 'Profile picture must be a JPEG, PNG or WebP image.');
  }

  let uploaded;
  try {
    uploaded = await avatarStorage.upload(req.file.buffer);
  } catch (error) {
    if (isRejectedImage(error)) {
      return rejectAvatar(res, 400, 'This file couldn’t be read as an image. Try another JPEG, PNG or WebP photo.');
    }
    logAvatarProblem('upload', error);
    return res.status(502).json({ status: 'error', message: 'We couldn’t upload your picture. Please try again.' });
  }

  let saved;
  try {
    saved = await sequelize.transaction(async (transaction) => {
      // Lock the row so two uploads for the same user run one after another
      // and each one deletes exactly the image it replaced
      const profile = await SurferProfile.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!profile) return null;

      const previousPublicId = profile.avatarPublicId;
      await profile.update({ avatarUrl: uploaded.url, avatarPublicId: uploaded.publicId }, { transaction });
      return { previousPublicId };
    });
  } catch (error) {
    // Nothing points to the new image: delete it, then report the failure
    await removeStoredImage(uploaded.publicId, 'new upload after a failed save');
    throw error;
  }

  // The profile disappeared after the profile check (e.g. account deleted)
  if (!saved) {
    await removeStoredImage(uploaded.publicId, 'new upload without a profile');
    return res.status(403).json({
      status: 'error',
      code: 'PROFILE_REQUIRED',
      message: 'Complete your surfer profile to use this feature.',
    });
  }

  if (saved.previousPublicId && saved.previousPublicId !== uploaded.publicId) {
    await removeStoredImage(saved.previousPublicId, 'replaced picture');
  }

  return sendOwnProfile(res, userId);
}

// DELETE /api/v1/profile/me/avatar
// Requires authentication and a completed profile. Clears the picture (the
// frontend shows initials again) and returns the updated profile (200).
// Removing when there is no picture is fine (nothing changes).
export async function removeMyAvatar(req, res) {
  const { userId } = req.auth;

  const previousPublicId = await sequelize.transaction(async (transaction) => {
    const profile = await SurferProfile.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!profile || (!profile.avatarUrl && !profile.avatarPublicId)) return null;

    const publicId = profile.avatarPublicId;
    await profile.update({ avatarUrl: null, avatarPublicId: null }, { transaction });
    return publicId;
  });

  if (previousPublicId) await removeStoredImage(previousPublicId, 'removed picture');

  return sendOwnProfile(res, userId);
}
