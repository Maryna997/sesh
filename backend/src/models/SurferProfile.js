import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

// A surfer's public identity in Sesh: display name, level, board and bio.
// Account data (email, password) stays in User; nothing is duplicated here.
//
// userId is the primary key, so each user has at most one profile. A profile
// is only created when the user submits their profile details for the first
// time (PUT /api/v1/profile/me), never at registration or login.
//
// Database constraints (see the create-surfer-profiles migration):
// - display_name: required, not blank, at most 50 characters
// - skill_level: 'beginner', 'intermediate' or 'advanced'
// - board_type, about: optional (allowed values checked by the API)
// - avatar_url, avatar_public_id: profile picture on Cloudinary (URL to
//   display, and the id used to replace or delete it). Set only by the
//   backend once uploads exist; NULL for now. avatarPublicId is internal and
//   never included in API responses.
export const SurferProfile = sequelize.define(
  'SurferProfile',
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    displayName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    skillLevel: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    boardType: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    about: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    avatarPublicId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'surfer_profiles',
    underscored: true,
  },
);
