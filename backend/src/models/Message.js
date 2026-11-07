import { DataTypes } from 'sequelize';
import { sequelize } from '../db/index.js';

// One message in a conversation. Plain text (never interpreted as HTML),
// with line breaks, Unicode and emoji allowed.
//
// Rules (the database enforces them too, CHECK messages_body_check):
// - at most MESSAGE_MAX_LENGTH characters, counted as Unicode characters like
//   PostgreSQL's char_length (an emoji such as 🌊 counts once)
// - not empty and not only whitespace (an explicit list, see HAS_NON_WHITESPACE)
// - no NUL character (PostgreSQL can't store it; the database rejects it too)
// Messages are never edited, so there is no updatedAt.
//
// That the sender is one of the conversation's participants is NOT checked
// by the database: the messaging API must take the sender from the session
// and check participation before creating a message.
export const MESSAGE_MAX_LENGTH = 2000;

// Unicode characters (code points), the same count as PostgreSQL's char_length
// (an emoji like 🌊 is 1; "é" written as e + combining accent is 2)
export const characterCount = (text) => [...text].length;

// At least one character that isn't whitespace. The whitespace list is
// JavaScript's \s set written out, identical to the database CHECK in the
// create-conversations-and-messages migration (keep both in sync), so the
// model and PostgreSQL never disagree, whatever the server's locale.
const HAS_NON_WHITESPACE = /[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/u;

export const Message = sequelize.define(
  'Message',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notBlank(value) {
          if (typeof value !== 'string' || !HAS_NON_WHITESPACE.test(value)) throw new Error('Message can’t be empty.');
        },
        // PostgreSQL text can't store the NUL character at all
        noNullCharacter(value) {
          if (value.includes('\u0000')) throw new Error('Message contains a character that can’t be sent.');
        },
        maxCharacters(value) {
          if (characterCount(value) > MESSAGE_MAX_LENGTH) {
            throw new Error(`Message must be at most ${MESSAGE_MAX_LENGTH} characters.`);
          }
        },
      },
    },
  },
  {
    tableName: 'messages',
    underscored: true,
    updatedAt: false,
  },
);
