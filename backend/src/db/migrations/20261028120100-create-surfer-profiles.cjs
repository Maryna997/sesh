'use strict';

// Creates the surfer profile tables.
//
// surfer_profiles: one optional profile per account.
// - user_id is both the primary key and a foreign key to users, so a user
//   can have zero or one profile, enforced by the database. Two requests can
//   never create two profiles for the same user.
// - Account data (email, password) stays in "users"; nothing is duplicated.
// - display_name and skill_level are required. The CHECK constraints mean a
//   stored profile is always complete, even if a row is written outside the API.
// - board_type is validated by the API (a list that may grow), not by the
//   database, so new board types don't need a migration.
// - avatar_url is reserved for a later task and stays NULL for now.
//
// surfer_favorite_spots: which surf spots each surfer likes (many-to-many).
// - One row per (surfer, spot); the primary key prevents duplicates.
// - The spot_id index supports "find surfers by spot" later.
//
// Deleting a user deletes their profile and favourite spots (ON DELETE
// CASCADE). A surf spot that is still someone's favourite can't be deleted
// (ON DELETE RESTRICT). The users table is not changed.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'surfer_profiles',
        {
          user_id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          display_name: {
            type: Sequelize.STRING(50),
            allowNull: false,
          },
          skill_level: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          board_type: {
            type: Sequelize.STRING(30),
            allowNull: true,
          },
          about: {
            type: Sequelize.STRING(500),
            allowNull: true,
          },
          avatar_url: {
            type: Sequelize.STRING(2048),
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

      await queryInterface.addConstraint('surfer_profiles', {
        type: 'check',
        fields: ['skill_level'],
        where: { skill_level: ['beginner', 'intermediate', 'advanced'] },
        name: 'surfer_profiles_skill_level_check',
        transaction,
      });

      // A display name can't be empty or only spaces
      await queryInterface.sequelize.query(
        'ALTER TABLE surfer_profiles ADD CONSTRAINT surfer_profiles_display_name_check CHECK (length(btrim(display_name)) > 0)',
        { transaction },
      );

      await queryInterface.createTable(
        'surfer_favorite_spots',
        {
          user_id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            references: { model: 'surfer_profiles', key: 'user_id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          spot_id: {
            type: Sequelize.STRING(100),
            primaryKey: true,
            allowNull: false,
            references: { model: 'surf_spots', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction },
      );

      await queryInterface.addIndex('surfer_favorite_spots', ['spot_id'], {
        name: 'surfer_favorite_spots_spot_id_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('surfer_favorite_spots', { transaction });
      await queryInterface.dropTable('surfer_profiles', { transaction });
    });
  },
};
