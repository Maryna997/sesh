'use strict';

// Keeps conversations when one participant deletes their account.
//
// Before: deleting a user deleted every conversation they took part in and
// every message in it (ON DELETE CASCADE on user_one_id, user_two_id and
// messages.sender_id), so the other surfer lost the whole history.
//
// After:
// - conversations.user_one_id / user_two_id are nullable, ON DELETE SET NULL:
//   the deleted person's id is replaced by NULL (it is not kept anywhere, so
//   it can never point to another account). NULL means "deleted account".
// - messages.sender_id is nullable, ON DELETE SET NULL: the deleted person's
//   messages stay readable, with no sender.
// - CHECK (user_one_id IS NOT NULL OR user_two_id IS NOT NULL): a conversation
//   always keeps at least one real participant. When the second participant
//   is deleted too, the account deletion removes the conversation first (and
//   its messages, by the existing cascade); otherwise this check makes the
//   deletion fail instead of leaving a conversation nobody can read.
// Unchanged: the order check (user_one_id < user_two_id is NULL, i.e. passes,
// when one side is NULL), the unique pair index (rows with a NULL never
// conflict, and no new conversation can be created with a deleted account),
// messages.conversation_id ON DELETE CASCADE, all indexes.
//
// No data is changed by "up". "down" restores NOT NULL + CASCADE, which first
// has to DELETE every conversation with a deleted participant and every
// message without a sender (retained history is lost on rollback).

// The foreign key on a column, whatever PostgreSQL named it
async function foreignKeyName(queryInterface, table, column, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f' AND rel.relname = :table AND att.attname = :column AND nsp.nspname = current_schema()`,
    { replacements: { table, column }, transaction },
  );
  if (rows.length !== 1) throw new Error(`Expected one foreign key on ${table}.${column}, found ${rows.length}.`);
  return rows[0].conname;
}

async function setUserReference(queryInterface, table, column, { nullable, onDelete }, transaction) {
  const name = await foreignKeyName(queryInterface, table, column, transaction);
  const sql = queryInterface.sequelize;
  await sql.query(`ALTER TABLE ${table} DROP CONSTRAINT "${name}"`, { transaction });
  await sql.query(`ALTER TABLE ${table} ALTER COLUMN ${column} ${nullable ? 'DROP' : 'SET'} NOT NULL`, { transaction });
  await sql.query(
    `ALTER TABLE ${table} ADD CONSTRAINT "${table}_${column}_fkey" FOREIGN KEY (${column}) REFERENCES users (id) ON DELETE ${onDelete} ON UPDATE CASCADE`,
    { transaction },
  );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const keep = { nullable: true, onDelete: 'SET NULL' };
      await setUserReference(queryInterface, 'conversations', 'user_one_id', keep, transaction);
      await setUserReference(queryInterface, 'conversations', 'user_two_id', keep, transaction);
      await setUserReference(queryInterface, 'messages', 'sender_id', keep, transaction);
      await queryInterface.sequelize.query(
        'ALTER TABLE conversations ADD CONSTRAINT conversations_participant_present_check CHECK (user_one_id IS NOT NULL OR user_two_id IS NOT NULL)',
        { transaction },
      );
    });
  },

  // Back to "deleting a user deletes their conversations". Retained history
  // (conversations with a deleted participant, messages without a sender)
  // can't satisfy NOT NULL and is deleted first.
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const sql = queryInterface.sequelize;
      await sql.query('ALTER TABLE conversations DROP CONSTRAINT conversations_participant_present_check', { transaction });
      await sql.query('DELETE FROM conversations WHERE user_one_id IS NULL OR user_two_id IS NULL', { transaction });
      await sql.query('DELETE FROM messages WHERE sender_id IS NULL', { transaction });
      const cascade = { nullable: false, onDelete: 'CASCADE' };
      await setUserReference(queryInterface, 'conversations', 'user_one_id', cascade, transaction);
      await setUserReference(queryInterface, 'conversations', 'user_two_id', cascade, transaction);
      await setUserReference(queryInterface, 'messages', 'sender_id', cascade, transaction);
    });
  },
};
