// Loads every model and declares how they relate to each other.
// Import models from this file when a query needs associations (include).
import { User } from './User.js';
import { Session } from './Session.js';
import { SurfSpot } from './SurfSpot.js';
import { SurferProfile } from './SurferProfile.js';
import { FavoriteSpot } from './FavoriteSpot.js';

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

export { User, Session, SurfSpot, SurferProfile, FavoriteSpot };
