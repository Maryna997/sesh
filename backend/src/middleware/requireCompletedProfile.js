import { SurferProfile } from '../models/index.js';
import { isProfileComplete } from '../utils/profileValidation.js';

// Protects features that need a surfer identity (discovery, availability,
// messaging...): only users who have completed their surfer profile get through.
//
// Always use it AFTER requireAuth, which identifies the user:
//   router.get('/surfers', requireAuth, requireCompletedProfile, handler)
//
// Users without a profile get 403 with code PROFILE_REQUIRED, which tells
// the frontend to send them to profile creation.
//
// Do not use it on authentication routes or on /profile/me: users must be
// able to sign in and create their profile before they have one.
export async function requireCompletedProfile(req, res, next) {
  if (!req.auth) {
    throw new Error('requireCompletedProfile must run after requireAuth');
  }

  const profile = await SurferProfile.findByPk(req.auth.userId, {
    attributes: ['userId', 'displayName', 'skillLevel'],
  });

  if (!isProfileComplete(profile)) {
    return res.status(403).json({
      status: 'error',
      code: 'PROFILE_REQUIRED',
      message: 'Complete your surfer profile to use this feature.',
    });
  }

  return next();
}
