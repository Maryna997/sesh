import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

// A signed-in session. Created at login, deleted at logout.
// The session token (JWT) stores this row's id as its "jti" claim; a token is
// only accepted while its row exists and expiresAt is in the future.
// See the create-sessions migration for the table definition.
export const Session = sequelize.define(
  'Session',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'sessions',
    underscored: true,
  },
);
