import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../db/index.js';

// A surfer's current availability: at most one row per user (unique user_id),
// updated or replaced when the status changes. No history is kept.
// See the create-surfer-availability migration for the table and its CHECK
// constraints, which allow only valid combinations of the fields below.

// Stored values. The API and frontend use the uppercase names (ACTIVE,
// COMING_SOON, AT_SPOT, OFF); the UI label for 'off' is "Off".
export const AVAILABILITY_STATUSES = ['active', 'coming_soon', 'at_spot', 'off'];

// How a Coming Soon arrival was given
export const ARRIVAL_TYPES = ['relative', 'window'];

// "In about 30 minutes / 1 hour / 2 hours"
export const RELATIVE_ARRIVAL_MINUTES = [30, 60, 120];

// Custom two-hour windows today: 05:00–07:00 … 19:00–21:00
export const ARRIVAL_WINDOW_START_HOURS = [5, 7, 9, 11, 13, 15, 17, 19];
export const ARRIVAL_WINDOW_HOURS = 2;

// "Today", the windows and end-of-day expiry are all Lisbon local time
export const AVAILABILITY_TIME_ZONE = 'Europe/Lisbon';

export const SurferAvailability = sequelize.define(
  'SurferAvailability',
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
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [AVAILABILITY_STATUSES] },
    },
    // Required for Coming Soon and At the Spot; never for Off
    spotId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Coming Soon only: 'relative' or 'window'
    arrivalType: {
      type: DataTypes.STRING(10),
      allowNull: true,
      validate: { isIn: [ARRIVAL_TYPES] },
    },
    // Relative arrivals: the option chosen (30, 60 or 120) and the estimate
    arrivalOffsetMinutes: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      validate: { isIn: [RELATIVE_ARRIVAL_MINUTES] },
    },
    arrivalAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Custom window arrivals: the two-hour window
    windowStartsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    windowEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // When the status stops counting as available; NULL only for 'off'
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'surfer_availability',
    underscored: true,
  },
);

// The rule for "currently available", in one place: not Off and not yet
// expired. Queries must use it, so an expired row never counts, even before
// any cleanup has run.
export function currentlyAvailableWhere(now = new Date()) {
  return { status: { [Op.ne]: 'off' }, expiresAt: { [Op.gt]: now } };
}

// The same rule for a loaded row
SurferAvailability.prototype.isCurrentlyAvailable = function isCurrentlyAvailable(now = new Date()) {
  return this.status !== 'off' && this.expiresAt instanceof Date && this.expiresAt > now;
};
