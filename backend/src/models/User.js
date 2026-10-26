import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';
import { normalizeEmail } from '../utils/validation.js';

// A Sesh account: authentication data only.
// Profile details belong to the SurferProfile model (a later task).
//
// Database constraints (see the create-users migration):
// - id: UUID primary key, generated automatically
// - email: required; unique regardless of letter case (index on lower(email))
// - password_hash: required bcrypt hash; the plaintext password is never stored
//
// underscored: true maps camelCase attributes (passwordHash, createdAt)
// to snake_case columns (password_hash, created_at).
export const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      // Always store emails trimmed and lowercase
      set(value) {
        this.setDataValue('email', typeof value === 'string' ? normalizeEmail(value) : value);
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    tableName: 'users',
    underscored: true,
  },
);

// Safety net: if a user object is ever sent with res.json(user) or logged,
// the password hash is left out.
User.prototype.toJSON = function toJSON() {
  const { passwordHash: _passwordHash, ...safeFields } = this.get();
  return safeFields;
};
