'use strict';

// Creates "surfer_availability": each surfer's current availability status.
//
// - One row per user at most (unique index on user_id). Changing status
//   updates or replaces that row; there is no history table.
// - status: 'active', 'coming_soon', 'at_spot' or 'off' (the ACTIVE,
//   COMING_SOON, AT_SPOT and OFF statuses, stored lowercase like skill_level).
// - spot_id points to the existing surf_spots table (named places only, no
//   coordinates: Sesh never stores a location).
// - Coming Soon has two arrival modes, told apart by arrival_type:
//   - 'relative': "in about 30 min / 1 h / 2 h". arrival_offset_minutes keeps
//     the choice (30, 60, 120) and arrival_at the estimated arrival time.
//   - 'window': a two-hour window today (05:00–07:00 … 19:00–21:00, Lisbon
//     time) in window_starts_at / window_ends_at.
// - expires_at: when the status stops counting as available (calculated by
//   the API; always within the current Lisbon day). NULL only for 'off',
//   which is never available.
// - All timestamps are TIMESTAMPTZ (absolute instants); "today" and the
//   windows are interpreted in Europe/Lisbon, including summer time.
//
// The CHECK constraints guarantee that every stored row is a valid
// combination (e.g. Coming Soon always has a spot and exactly one arrival
// mode; Active, At the Spot and Off never keep old arrival data). The API
// validates requests first; these checks are the last line of defence.
//
// Deleting a user deletes their availability (ON DELETE CASCADE). A surf spot
// in use can't be deleted (ON DELETE RESTRICT), as for favourite spots.

const STATUS_CHECK = `
  status IN ('active', 'coming_soon', 'at_spot', 'off')
`;

// Which fields each status must or must not have
const SHAPE_CHECK = `
  (
    status = 'active'
    AND arrival_type IS NULL AND arrival_offset_minutes IS NULL AND arrival_at IS NULL
    AND window_starts_at IS NULL AND window_ends_at IS NULL
    AND expires_at IS NOT NULL
  ) OR (
    status = 'at_spot'
    AND spot_id IS NOT NULL
    AND arrival_type IS NULL AND arrival_offset_minutes IS NULL AND arrival_at IS NULL
    AND window_starts_at IS NULL AND window_ends_at IS NULL
    AND expires_at IS NOT NULL
  ) OR (
    status = 'off'
    AND spot_id IS NULL
    AND arrival_type IS NULL AND arrival_offset_minutes IS NULL AND arrival_at IS NULL
    AND window_starts_at IS NULL AND window_ends_at IS NULL
    AND expires_at IS NULL
  ) OR (
    status = 'coming_soon'
    AND spot_id IS NOT NULL
    AND expires_at IS NOT NULL
    AND (
      (
        arrival_type = 'relative'
        AND arrival_offset_minutes IN (30, 60, 120) AND arrival_at IS NOT NULL
        AND window_starts_at IS NULL AND window_ends_at IS NULL
      ) OR (
        arrival_type = 'window'
        AND arrival_offset_minutes IS NULL AND arrival_at IS NULL
        AND window_starts_at IS NOT NULL
        AND window_ends_at = window_starts_at + interval '2 hours'
      )
    )
  )
`;

// Custom windows start on the hour at 05, 07, … 19 Lisbon time. (Summer-time
// changes happen at night, so a window is always exactly two hours long.)
const WINDOW_START_CHECK = `
  window_starts_at IS NULL OR (
    EXTRACT(HOUR FROM window_starts_at AT TIME ZONE 'Europe/Lisbon') IN (5, 7, 9, 11, 13, 15, 17, 19)
    AND EXTRACT(MINUTE FROM window_starts_at AT TIME ZONE 'Europe/Lisbon') = 0
    AND EXTRACT(SECOND FROM window_starts_at AT TIME ZONE 'Europe/Lisbon') = 0
  )
`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'surfer_availability',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          spot_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            references: { model: 'surf_spots', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          arrival_type: {
            type: Sequelize.STRING(10),
            allowNull: true,
          },
          arrival_offset_minutes: {
            type: Sequelize.SMALLINT,
            allowNull: true,
          },
          arrival_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          window_starts_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          window_ends_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction },
      );

      // One current availability per user, enforced by the database
      await queryInterface.addIndex('surfer_availability', ['user_id'], {
        name: 'surfer_availability_user_id_unique',
        unique: true,
        transaction,
      });

      // Discover (later): available surfers at a spot, not yet expired
      await queryInterface.addIndex('surfer_availability', ['spot_id', 'expires_at'], {
        name: 'surfer_availability_spot_id_expires_at_idx',
        transaction,
      });
      await queryInterface.addIndex('surfer_availability', ['expires_at'], {
        name: 'surfer_availability_expires_at_idx',
        transaction,
      });

      for (const [name, check] of [
        ['surfer_availability_status_check', STATUS_CHECK],
        ['surfer_availability_shape_check', SHAPE_CHECK],
        ['surfer_availability_window_start_check', WINDOW_START_CHECK],
      ]) {
        await queryInterface.sequelize.query(
          `ALTER TABLE surfer_availability ADD CONSTRAINT ${name} CHECK (${check})`,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('surfer_availability');
  },
};
