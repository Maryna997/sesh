// Detects an image type from the file's first bytes ("magic numbers").
//
// The file name and the browser's Content-Type can be anything the client
// wants, so they are not trusted. Only the actual contents decide.
// Cloudinary then decodes the image as a second check, so a file that only
// starts like an image is still rejected.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Returns 'image/jpeg', 'image/png', 'image/webp', or null for anything else
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  // WebP: "RIFF" <4-byte size> "WEBP"
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
