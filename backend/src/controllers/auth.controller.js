import { UniqueConstraintError } from 'sequelize';
import { User } from '../models/User.js';
import { validateRegistration } from '../utils/validation.js';
import { hashPassword } from '../utils/password.js';

// POST /api/v1/auth/register
// Creates an account from { email, password }. It does not log the user in;
// login and sessions are added in a later task.
export async function register(req, res) {
  const { errors, data } = validateRegistration(req.body);

  if (errors) {
    return res.status(400).json({
      status: 'error',
      message: 'Please check the registration details.',
      errors,
    });
  }

  const passwordHash = await hashPassword(data.password);

  try {
    // Only email and passwordHash are passed on: any other fields in the
    // request body (e.g. an "id") are ignored.
    const user = await User.create({ email: data.email, passwordHash });

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    // We don't check "does this email exist?" first: two requests could pass
    // that check at the same time. The database's unique index is the real
    // guard, and this turns its error into a clear 409 response.
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        status: 'error',
        message: 'An account with this email already exists.',
      });
    }

    // Anything else is unexpected: the error handler returns a safe 500.
    throw error;
  }
}
