'use strict';

// Creates "conversations" and "messages": private one-to-one messaging.
//
// Design: a conversation always has exactly two surfers, stored directly on
// the row (user_one_id, user_two_id) instead of in a participants table.
// That lets PostgreSQL itself guarantee the MVP rules without triggers:
// - CHECK user_one_id < user_two_id: the pair is stored in one canonical
//   order (the smaller UUID first), and a user can never be paired with
//   themselves (a value is never smaller than itself).
// - UNIQUE (user_one_id, user_two_id): together with the canonical order,
//   one conversation per unordered pair. A + B and B + A are the same row, and
//   two simultaneous "create" attempts can't both succeed.
// A participants table could not guarantee "exactly two" or "one per pair"
// without triggers; it can be introduced later if group chats are ever needed.
//
// Messages:
// - body: plain text (never HTML), 1–2,000 characters (char_length counts
//   Unicode code points, so 🌊 counts once; combining marks count separately),
//   and not only whitespace (see BODY_CHECK). Line breaks allowed.
// - No updated_at: messages can't be edited (no editing in the MVP).
// - sender_id must reference an existing user. That the sender is one of the
//   conversation's two participants is NOT enforced by these tables: the
//   messaging API checks it, with the sender taken from the session.
//
// Deleting a user deletes their conversations (ON DELETE CASCADE on both
// participant columns), and deleting a conversation deletes its messages; a
// user's sent messages are removed with them as well. Nothing is left orphaned.
//
// Indexes, for the planned API:
// - the unique pair index also serves "conversations where I am user_one" and
//   "the conversation between A and B"; user_two_id has its own index
// - (conversation_id, created_at, id): a conversation's messages in stable
//   chronological order, ready for pagination (also covers conversation_id)
// - sender_id: "messages sent by a user" and fast cascades on user deletion

const PARTICIPANTS_CHECK = 'user_one_id < user_two_id';

// "Not only whitespace" uses an explicit list of whitespace characters,
// exactly JavaScript's \s set (the same list as models/Message.js), instead
// of PostgreSQL's [:space:], whose members depend on the server's locale
// (e.g. U+0085 and U+001C count as space there, U+FEFF doesn't). So the model
// and the database always agree, on any server. String.raw keeps the
// backslashes for PostgreSQL's regex escapes (\t, \u00a0, …).
const BODY_CHECK = String.raw`char_length(body) <= 2000 AND body ~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const userReference = (allowNull = false) => ({
        type: Sequelize.UUID,
        allowNull,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });

      await queryInterface.createTable(
        'conversations',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          user_one_id: userReference(),
          user_two_id: userReference(),
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

      await queryInterface.sequelize.query(
        `ALTER TABLE conversations ADD CONSTRAINT conversations_participants_order_check CHECK (${PARTICIPANTS_CHECK})`,
        { transaction },
      );
      await queryInterface.addIndex('conversations', ['user_one_id', 'user_two_id'], {
        name: 'conversations_participants_unique',
        unique: true,
        transaction,
      });
      await queryInterface.addIndex('conversations', ['user_two_id'], {
        name: 'conversations_user_two_id_idx',
        transaction,
      });

      await queryInterface.createTable(
        'messages',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          conversation_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'conversations', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          sender_id: userReference(),
          body: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE messages ADD CONSTRAINT messages_body_check CHECK (${BODY_CHECK})`,
        { transaction },
      );
      await queryInterface.addIndex('messages', ['conversation_id', 'created_at', 'id'], {
        name: 'messages_conversation_id_created_at_id_idx',
        transaction,
      });
      await queryInterface.addIndex('messages', ['sender_id'], {
        name: 'messages_sender_id_idx',
        transaction,
      });
    });
  },

  // Removes only the messaging tables (messages first: it references conversations)
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('messages', { transaction });
      await queryInterface.dropTable('conversations', { transaction });
    });
  },
};
