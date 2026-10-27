import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

// A named surf spot (beach or break), shared by all surfers.
// The id is a stable text key such as 'pt-cascais-carcavelos'.
// No coordinates are stored: Sesh works with named places, not GPS.
// See the create-surf-spots migration for the table and its initial data.
export const SurfSpot = sequelize.define(
  'SurfSpot',
  {
    id: {
      type: DataTypes.STRING(100),
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    kind: { type: DataTypes.STRING(10), allowNull: false },
    area: { type: DataTypes.STRING(100), allowNull: false },
    municipality: { type: DataTypes.STRING(100), allowNull: false },
    region: { type: DataTypes.STRING(100), allowNull: false },
    country: { type: DataTypes.STRING(100), allowNull: false },
  },
  {
    tableName: 'surf_spots',
    underscored: true,
  },
);
