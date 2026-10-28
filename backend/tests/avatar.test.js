// API tests for profile pictures (POST/DELETE /api/v1/profile/me/avatar).
//
// Cloudinary is never called: `avatarStorage.upload` and `.remove` are
// replaced with mocks in every test, so no credentials or network access are
// needed. The database part is real (test accounts under @sesh-test.invalid,
// deleted afterwards).
import { TEST_CLIENT_ORIGIN } from './setup.js';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { SurferProfile } from '../src/models/index.js';
import { avatarStorage } from '../src/services/avatarStorage.js';
import { deleteTestUsers, request, sessionToken, startServer, testEmail } from './helpers.js';

const PASSWORD = 'correct horse battery';
const VALID_PROFILE = { displayName: 'Kai Silva', skillLevel: 'intermediate' };
const MB = 1024 * 1024;

// The first bytes of each format are enough for the content check; the
// (mocked) Cloudinary would decode the rest.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(52, 3)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64, 4)]);
const TEXT = Buffer.from('definitely not an image');

let server;
let baseUrl;
let uploadCount = 0;
const call = (path, options) => request(baseUrl, path, options);

async function signedInUser(name, { withProfile = true } = {}) {
  const email = testEmail(name);
  const registered = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(registered.status, 201);
  const loggedIn = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const user = { id: registered.body.user.id, token: sessionToken(loggedIn) };
  if (withProfile) {
    const created = await call('/api/v1/profile/me', { method: 'PUT', cookie: user.token, origin: TEST_CLIENT_ORIGIN, body: VALID_PROFILE });
    assert.equal(created.status, 201);
  }
  return user;
}

// Sends a multipart upload like a browser's FormData
async function uploadAvatar(user, file, { field = 'avatar', type = 'image/png', name = 'photo.png', origin = TEST_CLIENT_ORIGIN, extra } = {}) {
  const form = new FormData();
  if (file) form.append(field, new Blob([file], { type }), name);
  if (extra) extra(form);
  const response = await fetch(`${baseUrl}/api/v1/profile/me/avatar`, {
    method: 'POST',
    headers: { ...(user && { Cookie: `sesh_session=${user.token}` }), ...(origin && { Origin: origin }) },
    body: form,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

const removeAvatar = (user, options = {}) =>
  call('/api/v1/profile/me/avatar', { method: 'DELETE', cookie: user?.token, origin: TEST_CLIENT_ORIGIN, ...options });

const savedAvatar = async (user) => {
  const profile = await SurferProfile.findByPk(user.id);
  return { url: profile.avatarUrl, publicId: profile.avatarPublicId };
};

// Fake Cloudinary: every upload gets a new id in the avatars folder
function fakeUpload() {
  uploadCount += 1;
  const publicId = `sesh/avatars/test-${uploadCount}-${Date.now().toString(36)}`;
  return { url: `https://res.cloudinary.com/sesh-test-cloud/image/upload/v1/${publicId}.png`, publicId };
}

let uploadMock;
let removeMock;

before(async () => {
  await deleteTestUsers();
  ({ server, baseUrl } = await startServer());
});

beforeEach(() => {
  uploadMock = mock.method(avatarStorage, 'upload', async () => fakeUpload());
  removeMock = mock.method(avatarStorage, 'remove', async () => {});
});

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  await deleteTestUsers();
  server.close();
  await sequelize.close();
});

describe('upload', () => {
  for (const [format, bytes, type, name] of [
    ['PNG', PNG, 'image/png', 'photo.png'],
    ['JPEG', JPEG, 'image/jpeg', 'photo.jpg'],
    ['WebP', WEBP, 'image/webp', 'photo.webp'],
  ]) {
    test(`a valid ${format} is uploaded and saved on the profile`, async () => {
      const user = await signedInUser(`avatar-${format.toLowerCase()}`);
      const response = await uploadAvatar(user, bytes, { type, name });

      assert.equal(response.status, 200, response.text);
      assert.equal(uploadMock.mock.callCount(), 1);
      assert.ok(Buffer.from(uploadMock.mock.calls[0].arguments[0]).equals(bytes), 'the exact file is sent to Cloudinary');

      const saved = await savedAvatar(user);
      assert.match(saved.url, /^https:\/\//);
      assert.match(saved.publicId, /^sesh\/avatars\//);
      assert.equal(response.body.profile.avatarUrl, saved.url);
      assert.equal(response.body.profile.displayName, 'Kai Silva');
      assert.ok(!('avatarPublicId' in response.body.profile));
      // The id is part of the delivery URL by design, but the internal field
      // is never sent
      assert.ok(!/publicId/i.test(response.text), 'no public id field in the response');
      assert.equal(removeMock.mock.callCount(), 0);
    });
  }

  test('the content decides, not the file name or Content-Type', async () => {
    const user = await signedInUser('avatar-sniff');
    // A real PNG sent with a misleading name and type is accepted...
    const disguisedImage = await uploadAvatar(user, PNG, { type: 'text/plain', name: 'notes.txt' });
    assert.equal(disguisedImage.status, 200);

    // ...while a text file pretending to be a PNG is rejected
    const spoofed = await uploadAvatar(user, TEXT, { type: 'image/png', name: 'photo.png' });
    assert.equal(spoofed.status, 400);
    assert.equal(spoofed.body.errors.avatar, 'Profile picture must be a JPEG, PNG or WebP image.');
    assert.equal(uploadMock.mock.callCount(), 1);
  });

  test('unsupported formats (GIF, text) are rejected before Cloudinary', async () => {
    const user = await signedInUser('avatar-format');
    for (const [bytes, type, name] of [[GIF, 'image/gif', 'a.gif'], [TEXT, 'text/plain', 'a.txt']]) {
      const response = await uploadAvatar(user, bytes, { type, name });
      assert.equal(response.status, 400, name);
      assert.deepEqual(response.body, {
        status: 'error',
        message: 'Please check the profile picture.',
        errors: { avatar: 'Profile picture must be a JPEG, PNG or WebP image.' },
      });
    }
    assert.equal(uploadMock.mock.callCount(), 0);
    assert.equal((await savedAvatar(user)).url, null);
  });

  test('files over 5 MB are rejected with 413; exactly 5 MB is accepted', async () => {
    const user = await signedInUser('avatar-size');
    const tooBig = Buffer.concat([PNG, Buffer.alloc(5 * MB + 1 - PNG.length)]);
    const rejected = await uploadAvatar(user, tooBig);
    assert.equal(rejected.status, 413);
    assert.equal(rejected.body.errors.avatar, 'Profile picture must be at most 5 MB.');
    assert.equal(uploadMock.mock.callCount(), 0);

    const maxSize = Buffer.concat([PNG, Buffer.alloc(5 * MB - PNG.length)]);
    const accepted = await uploadAvatar(user, maxSize);
    assert.equal(accepted.status, 200);
  });

  test('missing file, wrong field, extra fields or two files are rejected', async () => {
    const user = await signedInUser('avatar-shape');

    const empty = await uploadAvatar(user, null);
    assert.equal(empty.status, 400);
    assert.equal(empty.body.errors.avatar, 'Choose an image to upload.');

    const wrongField = await uploadAvatar(user, PNG, { field: 'photo' });
    assert.equal(wrongField.status, 400);

    const extraField = await uploadAvatar(user, PNG, { extra: (form) => form.append('avatarPublicId', 'sesh/avatars/other') });
    assert.equal(extraField.status, 400);

    const twoFiles = await uploadAvatar(user, PNG, { extra: (form) => form.append('avatar', new Blob([PNG]), 'b.png') });
    assert.equal(twoFiles.status, 400);

    // A JSON body (e.g. a Cloudinary URL chosen by the client) is not an upload
    const json = await call('/api/v1/profile/me/avatar', {
      method: 'POST',
      cookie: user.token,
      origin: TEST_CLIENT_ORIGIN,
      body: { avatarUrl: 'https://example.com/me.png', avatarPublicId: 'sesh/avatars/x' },
    });
    assert.equal(json.status, 400);

    assert.equal(uploadMock.mock.callCount(), 0);
    assert.deepEqual(await savedAvatar(user), { url: null, publicId: null });
  });

  test('a Cloudinary failure returns 502 and changes nothing', async () => {
    const user = await signedInUser('avatar-cloud-down');
    uploadMock.mock.mockImplementation(async () => {
      throw Object.assign(new Error('Server error'), { http_code: 500 });
    });
    const response = await uploadAvatar(user, PNG);
    assert.equal(response.status, 502);
    assert.equal(response.body.message, 'We couldn’t upload your picture. Please try again.');
    assert.deepEqual(await savedAvatar(user), { url: null, publicId: null });
  });

  test('an image Cloudinary cannot decode returns 400', async () => {
    const user = await signedInUser('avatar-corrupt');
    uploadMock.mock.mockImplementation(async () => {
      throw Object.assign(new Error('Invalid image file'), { http_code: 400 });
    });
    const response = await uploadAvatar(user, PNG);
    assert.equal(response.status, 400);
    assert.match(response.body.errors.avatar, /couldn’t be read as an image/);
  });

  test('a database failure after the upload deletes the new image and keeps the old one', async () => {
    const user = await signedInUser('avatar-db-fail');
    assert.equal((await uploadAvatar(user, PNG)).status, 200);
    const before = await savedAvatar(user);

    const updateMock = mock.method(SurferProfile.prototype, 'update', async () => {
      throw new Error('simulated database failure');
    });
    const response = await uploadAvatar(user, JPEG, { type: 'image/jpeg' });
    updateMock.mock.restore();

    assert.equal(response.status, 500);
    assert.equal(response.body.message, 'Something went wrong. Please try again later.');
    assert.ok(!response.text.includes('simulated'));
    // The new upload (second call) is cleaned up; the saved picture is untouched
    const newPublicId = (await uploadMock.mock.calls[1].result).publicId;
    assert.deepEqual(removeMock.mock.calls.map((call) => call.arguments[0]), [newPublicId]);
    assert.deepEqual(await savedAvatar(user), before);
  });
});

describe('replace and remove', () => {
  test('replacing saves the new picture, then deletes the previous one', async () => {
    const user = await signedInUser('avatar-replace');
    await uploadAvatar(user, PNG);
    const first = await savedAvatar(user);

    const response = await uploadAvatar(user, JPEG, { type: 'image/jpeg' });
    assert.equal(response.status, 200);
    const second = await savedAvatar(user);

    assert.notEqual(second.publicId, first.publicId);
    assert.equal(response.body.profile.avatarUrl, second.url);
    assert.deepEqual(removeMock.mock.calls.map((call) => call.arguments[0]), [first.publicId]);
  });

  test('a failed cleanup of the old picture does not undo the replacement', async () => {
    const user = await signedInUser('avatar-cleanup-fail');
    await uploadAvatar(user, PNG);
    removeMock.mock.mockImplementation(async () => {
      throw new Error('Cloudinary unavailable');
    });
    const response = await uploadAvatar(user, WEBP, { type: 'image/webp' });
    assert.equal(response.status, 200);
    assert.equal((await savedAvatar(user)).url, response.body.profile.avatarUrl);
    assert.equal(removeMock.mock.callCount(), 1);
  });

  test('removing clears the profile fields, then deletes the stored image', async () => {
    const user = await signedInUser('avatar-remove');
    await uploadAvatar(user, PNG);
    const { publicId } = await savedAvatar(user);

    const response = await removeAvatar(user);
    assert.equal(response.status, 200);
    assert.equal(response.body.profile.avatarUrl, null);
    assert.equal(response.body.profile.displayName, 'Kai Silva');
    assert.deepEqual(await savedAvatar(user), { url: null, publicId: null });
    assert.deepEqual(removeMock.mock.calls.map((call) => call.arguments[0]), [publicId]);

    // Removing again is harmless and deletes nothing
    const again = await removeAvatar(user);
    assert.equal(again.status, 200);
    assert.equal(removeMock.mock.callCount(), 1);
  });

  test('removal still succeeds when deleting the image from Cloudinary fails', async () => {
    const user = await signedInUser('avatar-remove-fail');
    await uploadAvatar(user, PNG);
    removeMock.mock.mockImplementation(async () => {
      throw new Error('Cloudinary unavailable');
    });
    const response = await removeAvatar(user);
    assert.equal(response.status, 200);
    assert.deepEqual(await savedAvatar(user), { url: null, publicId: null });
  });

  test('a public id sent by the client is ignored; only the saved one is deleted', async () => {
    const user = await signedInUser('avatar-remove-body');
    await uploadAvatar(user, PNG);
    const { publicId } = await savedAvatar(user);
    await removeAvatar(user, { body: { publicId: 'sesh/avatars/someone-else', avatarPublicId: 'sesh/avatars/x' } });
    assert.deepEqual(removeMock.mock.calls.map((call) => call.arguments[0]), [publicId]);
  });

  test('images outside the Sesh avatars folder are never deleted', async () => {
    const user = await signedInUser('avatar-foreign-id');
    await SurferProfile.update(
      { avatarUrl: 'https://res.cloudinary.com/sesh-test-cloud/image/upload/v1/other/photo.png', avatarPublicId: 'other/photo' },
      { where: { userId: user.id } },
    );
    const response = await removeAvatar(user);
    assert.equal(response.status, 200);
    assert.deepEqual(await savedAvatar(user), { url: null, publicId: null });
    assert.equal(removeMock.mock.callCount(), 0);
  });
});

describe('access control', () => {
  test('both endpoints require a session', async () => {
    const upload = await uploadAvatar(null, PNG);
    assert.equal(upload.status, 401);
    const remove = await removeAvatar(null);
    assert.equal(remove.status, 401);
    assert.equal(uploadMock.mock.callCount(), 0);
  });

  test('both endpoints require a completed profile', async () => {
    const user = await signedInUser('avatar-no-profile', { withProfile: false });
    const upload = await uploadAvatar(user, PNG);
    assert.equal(upload.status, 403);
    assert.equal(upload.body.code, 'PROFILE_REQUIRED');
    const remove = await removeAvatar(user);
    assert.equal(remove.status, 403);
    assert.equal(uploadMock.mock.callCount(), 0);
  });

  test('requests from another website are blocked (CSRF), nothing changes', async () => {
    const user = await signedInUser('avatar-csrf');
    await uploadAvatar(user, PNG);
    const before = await savedAvatar(user);

    const upload = await uploadAvatar(user, JPEG, { origin: 'https://evil.example' });
    assert.equal(upload.status, 403);
    const remove = await removeAvatar(user, { origin: 'https://evil.example' });
    assert.equal(remove.status, 403);

    assert.equal(uploadMock.mock.callCount(), 1);
    assert.equal(removeMock.mock.callCount(), 0);
    assert.deepEqual(await savedAvatar(user), before);
  });

  test('users can only change their own picture', async () => {
    const owner = await signedInUser('avatar-owner');
    const other = await signedInUser('avatar-other');
    await uploadAvatar(owner, PNG);
    const ownerPicture = await savedAvatar(owner);

    // The other user uploads and removes: only their own profile changes
    await uploadAvatar(other, JPEG, { type: 'image/jpeg' });
    await removeAvatar(other, { body: { userId: owner.id } });

    assert.deepEqual(await savedAvatar(owner), ownerPicture);
    assert.deepEqual(await savedAvatar(other), { url: null, publicId: null });
    assert.ok(!removeMock.mock.calls.some((call) => call.arguments[0] === ownerPicture.publicId));
  });

  test('the general profile endpoint still cannot set or clear avatar fields', async () => {
    const user = await signedInUser('avatar-put');
    await uploadAvatar(user, PNG);
    const before = await savedAvatar(user);

    const response = await call('/api/v1/profile/me', {
      method: 'PUT',
      cookie: user.token,
      origin: TEST_CLIENT_ORIGIN,
      body: { avatarUrl: 'https://example.com/me.png', avatarPublicId: 'sesh/avatars/other' },
    });
    assert.equal(response.status, 400);
    // null is ignored (not "clear"), so the picture stays
    const cleared = await call('/api/v1/profile/me', {
      method: 'PUT',
      cookie: user.token,
      origin: TEST_CLIENT_ORIGIN,
      body: { about: 'Still here', avatarUrl: null, avatarPublicId: null },
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await savedAvatar(user), before);
  });

  test('uploads answer 503 when Cloudinary is not configured', async () => {
    const user = await signedInUser('avatar-disabled');
    mock.method(avatarStorage, 'isEnabled', () => false);
    const response = await uploadAvatar(user, PNG);
    assert.equal(response.status, 503);
    assert.equal(response.body.message, 'Profile picture uploads are not available right now.');
    assert.equal(uploadMock.mock.callCount(), 0);
  });
});
