// Unit tests for the Cloudinary configuration and the image type check.
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCloudinaryConfig } from '../src/config/cloudinary.js';
import { detectImageType } from '../src/utils/imageType.js';
import { isOwnAvatarPublicId } from '../src/services/avatarStorage.js';

const FULL = { CLOUDINARY_CLOUD_NAME: 'demo-cloud', CLOUDINARY_API_KEY: '123456789012345', CLOUDINARY_API_SECRET: 'abcDEF123secret' };

describe('loadCloudinaryConfig', () => {
  test('all three variables enable uploads', () => {
    const config = loadCloudinaryConfig(FULL);
    assert.equal(config.enabled, true);
    assert.equal(config.cloudName, 'demo-cloud');
  });

  test('none set: disabled in development, a startup error in production', () => {
    assert.deepEqual(loadCloudinaryConfig({}), { enabled: false });
    assert.throws(() => loadCloudinaryConfig({ NODE_ENV: 'production' }), /Cloudinary is not configured/);
  });

  test('partly configured is a startup error naming the missing variables (never the values)', () => {
    assert.throws(
      () => loadCloudinaryConfig({ ...FULL, CLOUDINARY_API_SECRET: '  ' }),
      (error) => /Missing: CLOUDINARY_API_SECRET/.test(error.message) && !error.message.includes(FULL.CLOUDINARY_API_KEY),
    );
  });

  test('placeholder values are a startup error', () => {
    assert.throws(() => loadCloudinaryConfig({ ...FULL, CLOUDINARY_CLOUD_NAME: 'your-cloud-name' }), /placeholders: CLOUDINARY_CLOUD_NAME/);
  });
});

describe('detectImageType', () => {
  test('recognises JPEG, PNG and WebP by their first bytes', () => {
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0])), 'image/jpeg');
    assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
    assert.equal(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'image/webp');
  });

  test('rejects everything else', () => {
    for (const value of [
      Buffer.from('GIF89a......'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from('%PDF-1.7'),
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]),
      Buffer.from([0xff, 0xd8]),
      Buffer.alloc(0),
      'not a buffer',
    ]) {
      assert.equal(detectImageType(value), null);
    }
  });
});

test('only public ids inside sesh/avatars count as our own', () => {
  assert.equal(isOwnAvatarPublicId('sesh/avatars/abc123'), true);
  assert.equal(isOwnAvatarPublicId('sesh/other/abc'), false);
  assert.equal(isOwnAvatarPublicId('sesh/avatars'), false);
  assert.equal(isOwnAvatarPublicId(null), false);
});
