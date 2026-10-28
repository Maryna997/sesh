import { v2 as cloudinary } from 'cloudinary';
import { AVATAR_FOLDER, cloudinaryConfig } from '../config/cloudinary.js';

// Stores profile pictures on Cloudinary (signed, server-side uploads only).
//
// The controller only talks to `avatarStorage`, never to the Cloudinary SDK
// directly. Tests replace `upload` and `remove` with mocks, so the test suite
// never needs real credentials or network access.

if (cloudinaryConfig.enabled) {
  cloudinary.config({
    cloud_name: cloudinaryConfig.cloudName,
    api_key: cloudinaryConfig.apiKey,
    api_secret: cloudinaryConfig.apiSecret,
    secure: true, // https:// URLs only
  });
}

// Upload options:
// - a random, unique public id inside the avatars folder (never chosen by the client)
// - only JPEG, PNG and WebP are accepted by Cloudinary too
// - large photos are scaled down to at most 1024 x 1024 when stored
//   (an avatar never needs more, and it keeps the stored files small)
const UPLOAD_OPTIONS = {
  folder: AVATAR_FOLDER,
  resource_type: 'image',
  allowed_formats: ['jpg', 'png', 'webp'],
  unique_filename: true,
  overwrite: false,
  transformation: [{ width: 1024, height: 1024, crop: 'limit' }],
};

function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(UPLOAD_OPTIONS, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

// Only images Sesh uploaded (inside the avatars folder) may ever be deleted
export function isOwnAvatarPublicId(publicId) {
  return typeof publicId === 'string' && publicId.startsWith(`${AVATAR_FOLDER}/`);
}

export const avatarStorage = {
  isEnabled() {
    return cloudinaryConfig.enabled;
  },

  // Returns { url, publicId } of the stored image
  async upload(buffer) {
    const result = await uploadBuffer(buffer);
    return { url: result.secure_url, publicId: result.public_id };
  },

  // Deletes one stored avatar. "not found" counts as done (already gone).
  async remove(publicId) {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    if (result?.result !== 'ok' && result?.result !== 'not found') {
      throw new Error(`Cloudinary did not delete the image (${result?.result ?? 'no result'}).`);
    }
  },
};
