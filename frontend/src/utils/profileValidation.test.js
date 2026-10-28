import { describe, expect, test } from 'vitest'
import {
  buildProfilePayload,
  validateAbout,
  validateBoardType,
  validateDisplayName,
  validateFavoriteSpotIds,
  validateSkillLevel,
} from './profileValidation'

describe('profile validation', () => {
  test('display name: required, not only whitespace, at most 50 characters after normalizing', () => {
    expect(validateDisplayName('')).toBe('Display name is required.')
    expect(validateDisplayName('   \n\t ')).toBe('Display name is required.')
    expect(validateDisplayName('a'.repeat(51))).toBe('Display name must be at most 50 characters.')
    expect(validateDisplayName('a'.repeat(50))).toBeUndefined()
    // Surrounding spaces and repeated inner spaces don't count
    expect(validateDisplayName(`  ${'a'.repeat(25)}     ${'b'.repeat(24)}  `)).toBeUndefined()
    // An emoji counts as one character, as on the backend
    expect(validateDisplayName('🌊'.repeat(50))).toBeUndefined()
  })

  test('skill level: required, only the backend values', () => {
    expect(validateSkillLevel('')).toBe('Choose your surf level.')
    for (const level of ['beginner', 'intermediate', 'advanced']) expect(validateSkillLevel(level)).toBeUndefined()
    expect(validateSkillLevel('Beginner')).toBeDefined()
    expect(validateSkillLevel('pro')).toBeDefined()
  })

  test('board type: optional, only supported values', () => {
    expect(validateBoardType('')).toBeUndefined()
    expect(validateBoardType('longboard')).toBeUndefined()
    expect(validateBoardType('bodyboard')).toBe('Choose a board type from the list.')
  })

  test('about: optional, at most 500 characters', () => {
    expect(validateAbout('')).toBeUndefined()
    expect(validateAbout('x'.repeat(500))).toBeUndefined()
    expect(validateAbout(`  ${'x'.repeat(500)}  `)).toBeUndefined()
    expect(validateAbout('x'.repeat(501))).toBe('About must be at most 500 characters.')
  })

  test('favorite spots: 0-3 known, different spots', () => {
    const known = new Set(['a', 'b', 'c', 'd'])
    expect(validateFavoriteSpotIds([], known)).toBeUndefined()
    expect(validateFavoriteSpotIds(['a'], known)).toBeUndefined()
    expect(validateFavoriteSpotIds(['a', 'b', 'c'], known)).toBeUndefined()
    expect(validateFavoriteSpotIds(['a', 'b', 'c', 'd'], known)).toBe('Choose a maximum of 3 favorite spots.')
    expect(validateFavoriteSpotIds(['a', 'a'], known)).toBe('Each surf spot can only be added once.')
    expect(validateFavoriteSpotIds(['zz'], known)).toBe('Choose your favorite spots from the list.')
  })

  test('payload: only supported fields, normalized, empty optional fields as null', () => {
    const payload = buildProfilePayload({
      displayName: '  Kai   Silva ',
      skillLevel: 'beginner',
      boardType: '',
      about: '  \r\n ',
      favoriteSpotIds: ['a'],
      avatarUrl: 'https://example.com/x.png',
    })
    expect(payload).toEqual({ displayName: 'Kai Silva', skillLevel: 'beginner', boardType: null, about: null, favoriteSpotIds: ['a'] })
  })
})
