import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

// Join table between surfer profiles and surf spots: one row per
// (surfer, favourite spot). The composite primary key prevents duplicates.
// See the create-surfer-profiles migration.
export const FavoriteSpot = sequelize.define(
  'FavoriteSpot',
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    spotId: {
      type: DataTypes.STRING(100),
      primaryKey: true,
    },
  },
  {
    tableName: 'surfer_favorite_spots',
    underscored: true,
    // Rows are only ever added or removed, never edited
    updatedAt: false,
  },
);
