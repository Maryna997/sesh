// INITIAL SAMPLE DATASET of surf spots in Portugal.
//
// This is NOT an exhaustive database of Portuguese surf spots. It is a small,
// hand-checked list of well-established beaches and breaks, used by the
// SurfSpotCombobox until spots are stored in the database (a later task).
//
// Fields:
// - id: stable, unique identifier. Store this, never the display name.
//       Do not change an existing id once it is in use.
// - name: spot name as surfers know it
// - kind: 'beach' (a named beach) or 'break' (a named surf break/reef)
// - area: town or locality, used for search and to tell similar names apart
// - municipality: Portuguese municipality (concelho)
// - region: district, e.g. "Lisbon". Faro district is shown as "Faro (Algarve)".
// - country
//
// Names and locations were checked against Visit Portugal, Turismo de Lisboa,
// Centro de Portugal and established surf guides (Surfer Today, The Surf Atlas).

import { normalizeText } from '../utils/normalizeText'

const PORTUGAL = 'Portugal'

export const SURF_SPOTS = [
  // Costa da Caparica (south of Lisbon)
  { id: 'pt-almada-sao-joao-da-caparica', name: 'Praia de São João da Caparica', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: PORTUGAL },
  { id: 'pt-almada-cds', name: 'Praia do CDS', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: PORTUGAL },
  { id: 'pt-almada-castelo', name: 'Praia do Castelo', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: PORTUGAL },
  { id: 'pt-almada-fonte-da-telha', name: 'Praia da Fonte da Telha', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: PORTUGAL },

  // Cascais and Sintra coast
  { id: 'pt-cascais-carcavelos', name: 'Praia de Carcavelos', kind: 'beach', area: 'Carcavelos', municipality: 'Cascais', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-cascais-sao-pedro-do-estoril', name: 'Praia de São Pedro do Estoril', kind: 'beach', area: 'São Pedro do Estoril', municipality: 'Cascais', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-cascais-guincho', name: 'Praia do Guincho', kind: 'beach', area: 'Guincho', municipality: 'Cascais', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-sintra-praia-grande', name: 'Praia Grande', kind: 'beach', area: 'Colares', municipality: 'Sintra', region: 'Lisbon', country: PORTUGAL },

  // Ericeira (World Surfing Reserve)
  { id: 'pt-mafra-ribeira-dilhas', name: 'Ribeira d’Ilhas', kind: 'beach', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-mafra-coxos', name: 'Coxos', kind: 'break', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-mafra-sao-lourenco', name: 'São Lourenço', kind: 'break', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-mafra-pedra-branca', name: 'Pedra Branca', kind: 'break', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: PORTUGAL },
  { id: 'pt-mafra-foz-do-lizandro', name: 'Praia da Foz do Lizandro', kind: 'beach', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: PORTUGAL },

  // Peniche and Nazaré
  { id: 'pt-peniche-supertubos', name: 'Supertubos', kind: 'break', area: 'Peniche', municipality: 'Peniche', region: 'Leiria', country: PORTUGAL },
  { id: 'pt-peniche-molhe-leste', name: 'Molhe Leste', kind: 'break', area: 'Peniche', municipality: 'Peniche', region: 'Leiria', country: PORTUGAL },
  { id: 'pt-peniche-baleal', name: 'Praia do Baleal', kind: 'beach', area: 'Baleal', municipality: 'Peniche', region: 'Leiria', country: PORTUGAL },
  { id: 'pt-nazare-praia-do-norte', name: 'Praia do Norte', kind: 'beach', area: 'Nazaré', municipality: 'Nazaré', region: 'Leiria', country: PORTUGAL },

  // Centre and north
  { id: 'pt-figueira-buarcos', name: 'Buarcos', kind: 'beach', area: 'Buarcos', municipality: 'Figueira da Foz', region: 'Coimbra', country: PORTUGAL },
  { id: 'pt-figueira-cabedelo', name: 'Praia do Cabedelo', kind: 'beach', area: 'Figueira da Foz', municipality: 'Figueira da Foz', region: 'Coimbra', country: PORTUGAL },
  { id: 'pt-espinho-espinho', name: 'Praia de Espinho', kind: 'beach', area: 'Espinho', municipality: 'Espinho', region: 'Aveiro', country: PORTUGAL },
  { id: 'pt-matosinhos-matosinhos', name: 'Praia de Matosinhos', kind: 'beach', area: 'Matosinhos', municipality: 'Matosinhos', region: 'Porto', country: PORTUGAL },
  { id: 'pt-viana-cabedelo', name: 'Praia do Cabedelo', kind: 'beach', area: 'Viana do Castelo', municipality: 'Viana do Castelo', region: 'Viana do Castelo', country: PORTUGAL },

  // Algarve west coast and Sagres
  { id: 'pt-aljezur-arrifana', name: 'Praia da Arrifana', kind: 'beach', area: 'Arrifana', municipality: 'Aljezur', region: 'Faro (Algarve)', country: PORTUGAL },
  { id: 'pt-aljezur-amoreira', name: 'Praia da Amoreira', kind: 'beach', area: 'Aljezur', municipality: 'Aljezur', region: 'Faro (Algarve)', country: PORTUGAL },
  { id: 'pt-aljezur-amado', name: 'Praia do Amado', kind: 'beach', area: 'Carrapateira', municipality: 'Aljezur', region: 'Faro (Algarve)', country: PORTUGAL },
  { id: 'pt-vila-do-bispo-castelejo', name: 'Praia do Castelejo', kind: 'beach', area: 'Vila do Bispo', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: PORTUGAL },
  { id: 'pt-vila-do-bispo-cordoama', name: 'Praia da Cordoama', kind: 'beach', area: 'Vila do Bispo', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: PORTUGAL },
  { id: 'pt-vila-do-bispo-tonel', name: 'Praia do Tonel', kind: 'beach', area: 'Sagres', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: PORTUGAL },
  { id: 'pt-vila-do-bispo-beliche', name: 'Praia do Beliche', kind: 'beach', area: 'Sagres', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: PORTUGAL },
]

// "Ericeira, Mafra · Lisbon, Portugal" — shown under the spot name so that
// spots with the same name (e.g. the two "Praia do Cabedelo") can be told apart.
export function formatSpotLocation(spot) {
  const place = spot.area === spot.municipality ? spot.area : `${spot.area}, ${spot.municipality}`
  return `${place} · ${spot.region}, ${spot.country}`
}

export function getSurfSpotById(id) {
  return SURF_SPOTS.find((spot) => spot.id === id) ?? null
}

// Finds spots matching a partial search, ignoring case and accents.
// Every typed word must appear in the spot's name, area, municipality or
// region, so "cap" finds the Costa da Caparica beaches and "sao joao"
// finds "Praia de São João da Caparica". Spots whose *name* matches are
// listed first; otherwise the dataset's (north-to-south-ish) order is kept.
export function searchSurfSpots(query, spots = SURF_SPOTS) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return spots

  const matches = []
  for (const spot of spots) {
    const searchable = normalizeText(`${spot.name} ${spot.area} ${spot.municipality} ${spot.region}`)
    if (!words.every((word) => searchable.includes(word))) continue

    const name = normalizeText(spot.name)
    matches.push({ spot, nameMatch: words.every((word) => name.includes(word)) })
  }

  return matches.sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch)).map((match) => match.spot)
}
