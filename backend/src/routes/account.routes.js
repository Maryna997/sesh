import { Router } from 'express';
import { changeEmail, changePassword, deleteAccount } from '../controllers/account.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Account settings, mounted at /api/v1/account. Signed-in users only (a
// completed profile isn't needed); every route changes data, so the global
// Origin (CSRF) check applies too.
const router = Router();

router.use(requireAuth);

// PUT /api/v1/account/email - change the sign-in email
router.put('/email', changeEmail);

// PUT /api/v1/account/password - change the password (keeps this session)
router.put('/password', changePassword);

// DELETE /api/v1/account - permanently delete the account ({ confirmation: "DELETE" })
router.delete('/', deleteAccount);

export default router;
