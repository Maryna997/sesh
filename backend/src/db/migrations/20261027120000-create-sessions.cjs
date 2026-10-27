'use strict';

// Creates the "sessions" table, which makes logout real.
//
// Each login creates one row. The login token (a JWT) carries that row's id,
// and every protected request checks that the row still exists and hasn't
// expired. Logging out deletes the row, so the old token stops working even
// though it hasn't reached its expiry time.
//
// Deleting a user also deletes their sessions (ON DELETE CASCADE).
// The users table is not changed. Undoing this migration drops only this table
// (which signs everyone out).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'sessions',
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
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
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

      // Finding and cleaning up a user's sessions
      await queryInterface.addIndex('sessions', ['user_id'], {
        name: 'sessions_user_id_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sessions');
  },
};
