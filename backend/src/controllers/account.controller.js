import { UniqueConstraintError } from 'sequelize';
import { sequelize } from '../db/index.js';
import { Session, SurferProfile, User } from '../models/index.js';
import { avatarStorage, isOwnAvatarPublicId } from '../services/avatarStorage.js';
import { hashPassword, normalizePassword, verifyPassword } from '../utils/password.js';
import { checkEmail, checkNewPassword } from '../utils/validation.js';
import { rejectUnauthenticated } from '../middleware/requireAuth.js';
import { clearSessionCookie, createSessionToken, setSessionCookie, toPublicUser } from './auth.controller.js';

// Account settings (Settings & Privacy): change email, change password,
// delete the account. Mounted at /api/v1/account behind requireAuth; the
// global Origin check protects every one of them (all change data).
//
// The account is always the signed-in user's (req.auth.userId). Request
// bodies never name a user; any extra fields are ignored.

export const DELETE_CONFIRMATION = 'DELETE';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function badRequest(res, message, errors) {
  return res.status(400).json({ status: 'error', message, errors });
}

// Only the error type and message, never request data or credentials
function logAccountProblem(context, error) {
  if (process.env.NODE_ENV === 'test') return;
  console.error(`Account ${context} failed: ${error?.name ?? 'Error'}: ${error?.message ?? 'unknown error'}`);
}

// ---------- PUT /api/v1/account/email  { newEmail } ----------
// Changes the sign-in email at once (no verification email in the MVP).
// Same rules and normalization as registration; the unique index on
// lower(email) is the real guard against two accounts with one address, also
// when two requests race. The session stays valid. 200 { user }.
export async function changeEmail(req, res) {
  if (!isPlainObject(req.body)) {
    return badRequest(res, 'Please check the new email address.', { body: 'Request body must be a JSON object with newEmail.' });
  }
  const check = checkEmail(req.body.newEmail);
  if (check.error) return badRequest(res, 'Please check the new email address.', { newEmail: check.error });

  let result;
  try {
    result = await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(req.auth.userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user) return { missing: true };
      if (user.email === check.email) return { same: true };
      await user.update({ email: check.email }, { transaction });
      return { user };
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        status: 'error',
        message: 'An account with this email already exists.',
        errors: { newEmail: 'An account with this email already exists.' },
      });
    }
    throw error;
  }

  if (result.missing) return rejectUnauthenticated(req, res);
  if (result.same) return badRequest(res, 'Please check the new email address.', { newEmail: 'This is already your email address.' });
  return res.status(200).json({ user: toPublicUser(result.user) });
}

// ---------- PUT /api/v1/account/password  { currentPassword, newPassword } ----------
// Checks the current password (bcrypt, constant-time compare), applies the
// registration rules to the new one, refuses the same password, stores a new
// bcrypt hash.
//
// Sessions: every session of the account is ended (other browsers and
// devices are signed out) and this browser gets a fresh session cookie in
// the same response, so the user stays signed in without logging in again.
// 200 { status, message }.
//
// A wrong current password is a 400 field error, not a 401: the session is
// fine, and 401 means "signed out" to the frontend.
export async function changePassword(req, res) {
  if (!isPlainObject(req.body)) {
    return badRequest(res, 'Please check your passwords.', { body: 'Request body must be a JSON object with currentPassword and newPassword.' });
  }
  const { currentPassword, newPassword } = req.body;
  const errors = {};
  if (currentPassword === undefined || currentPassword === null || currentPassword === '') errors.currentPassword = 'Enter your current password.';
  else if (typeof currentPassword !== 'string') errors.currentPassword = 'Password must be a string.';
  const newPasswordError = checkNewPassword(newPassword);
  if (newPasswordError) errors.newPassword = newPasswordError;
  if (Object.keys(errors).length > 0) return badRequest(res, 'Please check your passwords.', errors);

  const userId = req.auth.userId;
  const user = await User.findByPk(userId, { attributes: ['id', 'passwordHash'] });
  if (!user) return rejectUnauthenticated(req, res);

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return badRequest(res, 'Please check your passwords.', { currentPassword: 'Your current password is incorrect.' });
  }
  if (normalizePassword(newPassword) === normalizePassword(currentPassword)) {
    return badRequest(res, 'Please check your passwords.', { newPassword: 'Choose a password different from your current one.' });
  }

  const newHash = await hashPassword(newPassword);
  const token = await sequelize.transaction(async (transaction) => {
    // Lock the account; give up if the password changed meanwhile (another request)
    const locked = await User.findByPk(userId, { attributes: ['id', 'passwordHash'], transaction, lock: transaction.LOCK.UPDATE });
    if (!locked || locked.passwordHash !== user.passwordHash) return null;
    await locked.update({ passwordHash: newHash }, { transaction });
    await Session.destroy({ where: { userId }, transaction });
    return createSessionToken(userId, { transaction });
  });

  if (!token) {
    return res.status(409).json({ status: 'error', message: 'Your password was just changed. Please try again.' });
  }

  setSessionCookie(res, token);
  return res.status(200).json({ status: 'ok', message: 'Password updated.' });
}

// ---------- DELETE /api/v1/account  { confirmation: "DELETE" } ----------
// Permanently deletes the account. The user row is deleted in a transaction;
// the database's ON DELETE CASCADE rules remove everything that belongs to it:
// sessions, surfer profile, favorite spots, availability, every conversation
// the user took part in and all messages in those conversations (the other
// participant's too). Other accounts are untouched.
//
// Profile picture (Cloudinary can't join the database transaction): it is
// deleted FIRST. If that fails, nothing is deleted and the user is asked to
// try again (502), so a photo is never left behind without anyone being told.
// If the database step then fails, the account stays (500); the photo is
// already gone and the profile shows initials; trying again works ("not
// found" counts as deleted). A picture uploaded in the moment between the
// two steps is removed after the account is gone (logged if that fails).
//
// 200 { status, message } and the session cookie is cleared.
export async function deleteAccount(req, res) {
  if (!isPlainObject(req.body) || req.body.confirmation !== DELETE_CONFIRMATION) {
    return badRequest(res, 'Please confirm the deletion.', { confirmation: `Type ${DELETE_CONFIRMATION} to confirm.` });
  }
  const userId = req.auth.userId;

  const profile = await SurferProfile.findByPk(userId, { attributes: ['userId', 'avatarPublicId'] });
  const publicId = profile?.avatarPublicId ?? null;

  // Only images Sesh stored in its avatars folder are ever deleted
  if (isOwnAvatarPublicId(publicId)) {
    if (!avatarStorage.isEnabled()) {
      return res.status(503).json({ status: 'error', message: 'Account deletion isn’t available right now. Please try again later.' });
    }
    try {
      await avatarStorage.remove(publicId);
    } catch (error) {
      logAccountProblem('deletion (profile picture)', error);
      return res.status(502).json({
        status: 'error',
        message: 'We couldn’t remove your profile picture, so your account wasn’t deleted. Please try again.',
      });
    }
  }

  const deleted = await sequelize.transaction(async (transaction) => {
    // The lock makes a second, simultaneous deletion wait and then find nothing
    const user = await User.findByPk(userId, { attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
    if (!user) return null;
    const current = await SurferProfile.findByPk(userId, { attributes: ['avatarPublicId'], transaction });
    await user.destroy({ transaction }); // ON DELETE CASCADE does the rest
    const latePublicId = current?.avatarPublicId;
    return { latePublicId: latePublicId && latePublicId !== publicId ? latePublicId : null };
  });

  if (!deleted) return rejectUnauthenticated(req, res);

  if (isOwnAvatarPublicId(deleted.latePublicId) && avatarStorage.isEnabled()) {
    try {
      await avatarStorage.remove(deleted.latePublicId);
    } catch (error) {
      logAccountProblem('cleanup (late profile picture)', error);
    }
  }

  clearSessionCookie(res);
  return res.status(200).json({ status: 'ok', message: 'Account deleted.' });
}
