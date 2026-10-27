import { SurfSpot } from '../models/index.js';

// The spot fields sent to clients
export function toPublicSpot(spot) {
  return {
    id: spot.id,
    name: spot.name,
    kind: spot.kind,
    area: spot.area,
    municipality: spot.municipality,
    region: spot.region,
    country: spot.country,
  };
}

// GET /api/v1/surf-spots
// The list of surf spots surfers can choose from (read-only reference data).
export async function listSurfSpots(req, res) {
  const spots = await SurfSpot.findAll({ order: [['name', 'ASC'], ['id', 'ASC']] });
  return res.status(200).json({ spots: spots.map(toPublicSpot) });
}
