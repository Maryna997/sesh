// Loads every model and declares how they relate to each other.
// Import models from this file when a query needs associations (include).
import { User } from './User.js';
import { Session } from './Session.js';
import { SurfSpot } from './SurfSpot.js';
import { SurferProfile } from './SurferProfile.js';
import { FavoriteSpot } from './FavoriteSpot.js';
import { SurferAvailability } from './SurferAvailability.js';

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

export { User, Session, SurfSpot, SurferProfile, FavoriteSpot, SurferAvailability };
