'use strict';

// Prepares surfer profiles for profile pictures stored on Cloudinary.
//
// - avatar_url (already in surfer_profiles): the hosted image URL the
//   frontend displays.
// - avatar_public_id (added here): Cloudinary's identifier for the image,
//   needed to replace or delete it later. Internal only, never sent to clients.
//
// Both stay NULL until the upload feature is built; only the backend will
// set them. Additive change: existing rows keep their data.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('surfer_profiles', 'avatar_public_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('surfer_profiles', 'avatar_public_id');
  },
};
