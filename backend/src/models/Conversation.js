import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../db/index.js';

// A private conversation between exactly two surfers (see the
// create-conversations-and-messages migration for the full design).
//
// The pair is stored in canonical order: userOneId is always the smaller
// UUID. The database enforces it (CHECK user_one_id < user_two_id, so no
// self-conversations either) and allows one conversation per pair (UNIQUE).
// Build the pair with orderParticipants() so A + B and B + A give the same row
// (its result is also the `where` to find the conversation between two users).
//
// Who may read or write a conversation is NOT decided here: the messaging API
// must check that the signed-in user is one of the two participants.
export const Conversation = sequelize.define(
  'Conversation',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userOneId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userTwoId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    tableName: 'conversations',
    underscored: true,
    validate: {
      // Mirrors the database CHECK, so the ORM explains the problem early
      canonicalPair() {
        if (!(String(this.userOneId) < String(this.userTwoId))) {
          throw new Error('A conversation needs two different users, stored in canonical order (use orderParticipants).');
        }
      },
    },
  },
);

// { userOneId, userTwoId } for two user ids in canonical order (PostgreSQL
// compares UUIDs like their lowercase text). Throws for the same user twice.
export function orderParticipants(firstUserId, secondUserId) {
  const [userOneId, userTwoId] = [String(firstUserId).toLowerCase(), String(secondUserId).toLowerCase()].sort();
  if (userOneId === userTwoId) throw new Error('A conversation needs two different users.');
  return { userOneId, userTwoId };
}

// `where` for every conversation a user takes part in
export function participantWhere(userId) {
  return { [Op.or]: [{ userOneId: userId }, { userTwoId: userId }] };
}

// True when the user is one of the two participants
Conversation.prototype.hasParticipant = function hasParticipant(userId) {
  const id = String(userId).toLowerCase();
  return this.userOneId === id || this.userTwoId === id;
};

// The other participant's id, seen from one participant
Conversation.prototype.otherParticipantId = function otherParticipantId(userId) {
  if (!this.hasParticipant(userId)) return null;
  return this.userOneId === String(userId).toLowerCase() ? this.userTwoId : this.userOneId;
};
