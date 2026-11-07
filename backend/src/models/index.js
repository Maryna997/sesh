// Loads every model and declares how they relate to each other.
// Import models from this file when a query needs associations (include).
import { User } from './User.js';
import { Session } from './Session.js';
import { SurfSpot } from './SurfSpot.js';
import { SurferProfile } from './SurferProfile.js';
import { FavoriteSpot } from './FavoriteSpot.js';
import { SurferAvailability } from './SurferAvailability.js';
import { Conversation } from './Conversation.js';
import { Message } from './Message.js';

// A user has zero or one surfer profile
User.hasOne(SurferProfile, { foreignKey: 'userId', as: 'surferProfile' });
SurferProfile.belongsTo(User, { foreignKey: 'userId' });

// A surfer can have many favourite spots, and a spot can be the favourite of
// many surfers (through the surfer_favorite_spots table)
SurferProfile.belongsToMany(SurfSpot, {
  through: FavoriteSpot,
  foreignKey: 'userId',
  otherKey: 'spotId',
  as: 'favoriteSpots',
});
SurfSpot.belongsToMany(SurferProfile, {
  through: FavoriteSpot,
  foreignKey: 'spotId',
  otherKey: 'userId',
  as: 'favoritedBy',
});

// A user has zero or one current availability; it may name one surf spot
// (Coming Soon and At the Spot), and a spot can have many available surfers
User.hasOne(SurferAvailability, { foreignKey: 'userId', as: 'availability' });
SurferAvailability.belongsTo(User, { foreignKey: 'userId' });
SurferAvailability.belongsTo(SurfSpot, { foreignKey: 'spotId', as: 'spot' });
SurfSpot.hasMany(SurferAvailability, { foreignKey: 'spotId', as: 'availabilities' });

// Availability and profile share user_id, so Discover can join them directly
// (no database constraint between them: both belong to the user)
SurferAvailability.belongsTo(SurferProfile, { foreignKey: 'userId', targetKey: 'userId', as: 'profile', constraints: false });

// Private messaging: a conversation has exactly two participants (userOne,
// userTwo, canonical order) and many messages; each message has one sender.
// "A user's conversations" are those where they are userOne OR userTwo (see
// participantWhere in Conversation.js), so there are two aliases on User.
Conversation.belongsTo(User, { foreignKey: 'userOneId', as: 'userOne' });
Conversation.belongsTo(User, { foreignKey: 'userTwoId', as: 'userTwo' });
User.hasMany(Conversation, { foreignKey: 'userOneId', as: 'conversationsAsUserOne' });
User.hasMany(Conversation, { foreignKey: 'userTwoId', as: 'conversationsAsUserTwo' });
Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });

export { User, Session, SurfSpot, SurferProfile, FavoriteSpot, SurferAvailability, Conversation, Message };
