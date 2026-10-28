// Unit tests for surfer profile validation (no database needed).
import './setup.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABOUT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  FAVORITE_SPOTS_MAX,
  isProfileComplete,
  missingRequiredFields,
  validateProfileInput,
} from '../src/utils/profileValidation.js';

const errorsFor = (body) => validateProfileInput(body).errors ?? {};

describe('validateProfileInput', () => {
  test('accepts a full profile and normalizes text', () => {
    const result = validateProfileInput({
      displayName: '  Kai   Silva ',
      skillLevel: 'intermediate',
      boardType: 'fish',
      about: '  Dawn patrol fan.\r\nUsually at Carcavelos. ',
      favoriteSpotIds: ['pt-cascais-carcavelos', 'pt-cascais-guincho'],
    });
    assert.deepEqual(result, {
      data: {
        displayName: 'Kai Silva',
        skillLevel: 'intermediate',
        boardType: 'fish',
        about: 'Dawn patrol fan.\nUsually at Carcavelos.',
        favoriteSpotIds: ['pt-cascais-carcavelos', 'pt-cascais-guincho'],
      },
    });
  });

  test('returns only the fields that were sent (partial updates)', () => {
    assert.deepEqual(validateProfileInput({ about: 'Hi' }), { data: { about: 'Hi' } });
    assert.deepEqual(validateProfileInput({}), { data: {} });
  });

  test('ignores unknown fields such as userId or hasCompletedProfile', () => {
    const result = validateProfileInput({ userId: 'someone-else', hasCompletedProfile: true, email: 'x@y.pt' });
    assert.deepEqual(result, { data: {} });
  });

  test('rejects a body that is not an object', () => {
    for (const body of [undefined, null, 'text', 42, ['Kai']]) {
      assert.ok(errorsFor(body).body, `body ${JSON.stringify(body)}`);
    }
  });

  test('display name: required, text, at most 50 characters, no control characters', () => {
    for (const value of [null, '', '   ']) {
      assert.equal(errorsFor({ displayName: value }).displayName, 'Display name is required.');
    }
    assert.equal(errorsFor({ displayName: 42 }).displayName, 'Display name must be text.');
    assert.match(errorsFor({ displayName: 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) }).displayName, /at most 50/);
    assert.equal(errorsFor({ displayName: 'Kai\u0000' }).displayName, 'Display name contains invalid characters.');
    // 50 emoji are 50 characters
    assert.equal(validateProfileInput({ displayName: '🏄'.repeat(DISPLAY_NAME_MAX_LENGTH) }).errors, undefined);
  });

  test('skill level: one of beginner, intermediate, advanced', () => {
    for (const value of ['beginner', 'intermediate', 'advanced']) {
      assert.deepEqual(validateProfileInput({ skillLevel: value }), { data: { skillLevel: value } });
    }
    for (const value of [null, '']) {
      assert.equal(errorsFor({ skillLevel: value }).skillLevel, 'Skill level is required.');
    }
    for (const value of ['Beginner', 'pro', 3, ['beginner']]) {
      assert.match(errorsFor({ skillLevel: value }).skillLevel, /must be one of/);
    }
  });

  test('board type: optional, from the list; null or "" clears it', () => {
    assert.deepEqual(validateProfileInput({ boardType: 'longboard' }), { data: { boardType: 'longboard' } });
    assert.deepEqual(validateProfileInput({ boardType: null }), { data: { boardType: null } });
    assert.deepEqual(validateProfileInput({ boardType: '' }), { data: { boardType: null } });
    assert.match(errorsFor({ boardType: 'surfboard' }).boardType, /must be one of/);
  });

  test('about: optional, at most 500 characters; null or blank clears it', () => {
    assert.deepEqual(validateProfileInput({ about: null }), { data: { about: null } });
    assert.deepEqual(validateProfileInput({ about: '   ' }), { data: { about: null } });
    assert.match(errorsFor({ about: 'a'.repeat(ABOUT_MAX_LENGTH + 1) }).about, /at most 500/);
    assert.equal(errorsFor({ about: 'bell\u0007' }).about, 'About contains invalid characters.');
    assert.equal(errorsFor({ about: 7 }).about, 'About must be text.');
    // Line breaks and tabs are fine
    assert.equal(validateProfileInput({ about: 'a\n\tb' }).errors, undefined);
  });

  test('display name and skill level can be replaced with other valid values', () => {
    assert.deepEqual(validateProfileInput({ displayName: 'Kai S.' }), { data: { displayName: 'Kai S.' } });
    assert.deepEqual(validateProfileInput({ skillLevel: 'beginner' }), { data: { skillLevel: 'beginner' } });
  });

  test('favourite spots: list of ids, no duplicates, at most 3; null or [] clears', () => {
    assert.equal(FAVORITE_SPOTS_MAX, 3);
    for (let count = 0; count <= FAVORITE_SPOTS_MAX; count += 1) {
      const ids = Array.from({ length: count }, (_, i) => `spot-${i}`);
      assert.deepEqual(validateProfileInput({ favoriteSpotIds: ids }), { data: { favoriteSpotIds: ids } });
    }
    assert.deepEqual(validateProfileInput({ favoriteSpotIds: null }), { data: { favoriteSpotIds: [] } });
    assert.deepEqual(validateProfileInput({ favoriteSpotIds: null }), { data: { favoriteSpotIds: [] } });
    assert.match(errorsFor({ favoriteSpotIds: 'pt-cascais-guincho' }).favoriteSpotIds, /must be a list/);
    assert.match(errorsFor({ favoriteSpotIds: ['ok', 3] }).favoriteSpotIds, /must be a surf spot id/);
    assert.match(errorsFor({ favoriteSpotIds: [''] }).favoriteSpotIds, /must be a surf spot id/);
    assert.equal(errorsFor({ favoriteSpotIds: ['a', 'a'] }).favoriteSpotIds, 'Each surf spot can only be added once.');
    const tooMany = Array.from({ length: FAVORITE_SPOTS_MAX + 1 }, (_, i) => `spot-${i}`);
    assert.equal(errorsFor({ favoriteSpotIds: tooMany }).favoriteSpotIds, 'Choose a maximum of 3 favorite spots.');
  });

  test('avatar fields cannot be set by the client; null or "" is ignored', () => {
    const message = 'Change your profile picture with the photo upload instead.';
    assert.equal(errorsFor({ avatarUrl: 'https://example.com/me.jpg' }).avatarUrl, message);
    assert.equal(errorsFor({ avatarPublicId: 'sesh/avatars/someone' }).avatarPublicId, message);
    assert.deepEqual(validateProfileInput({ avatarUrl: null, avatarPublicId: '' }), { data: {} });
  });

  test('reports every invalid field at once', () => {
    assert.deepEqual(Object.keys(errorsFor({ displayName: '', skillLevel: 'pro', boardType: 'x' })).sort(), [
      'boardType',
      'displayName',
      'skillLevel',
    ]);
  });
});

describe('missingRequiredFields', () => {
  test('a new profile needs displayName and skillLevel', () => {
    assert.deepEqual(missingRequiredFields({}), {
      displayName: 'Display name is required.',
      skillLevel: 'Skill level is required.',
    });
    assert.deepEqual(missingRequiredFields({ displayName: 'Kai' }), { skillLevel: 'Skill level is required.' });
    assert.equal(missingRequiredFields({ displayName: 'Kai', skillLevel: 'beginner' }), null);
  });
});

describe('isProfileComplete', () => {
  test('true only for a profile with a display name and a valid skill level', () => {
    assert.equal(isProfileComplete({ displayName: 'Kai', skillLevel: 'advanced' }), true);
    assert.equal(isProfileComplete(null), false);
    assert.equal(isProfileComplete(undefined), false);
    assert.equal(isProfileComplete({ displayName: ' ', skillLevel: 'advanced' }), false);
    assert.equal(isProfileComplete({ displayName: 'Kai', skillLevel: 'pro' }), false);
  });
});
