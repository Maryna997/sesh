'use strict';

// Creates the "users" table: authentication data only (email + password hash).
// Surfer profile details (name, level, spots, photo) will live in a separate
// table in a later migration.
//
// Everything runs in one transaction, so a failure leaves the database unchanged.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'users',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            // Built into PostgreSQL 13+, so no extension is needed
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          email: {
            type: Sequelize.STRING(254),
            allowNull: false,
          },
          password_hash: {
            type: Sequelize.STRING(255),
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

      // One account per email, regardless of letter case. Indexing lower(email)
      // means "Surfer@Example.com" and "surfer@example.com" count as the same
      // address even if a row is ever inserted without going through the API.
      await queryInterface.sequelize.query(
        'CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email))',
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    // Dropping the table also drops its index
    await queryInterface.dropTable('users');
  },
};
