// Text shown on another surfer's public profile.
import { normalizeText } from './normalizeText'

// "Supertubos (Peniche)": the name plus its area, so spots are recognisable
// (and the two "Praia do Cabedelo" can be told apart). The area is left out
// when the name already contains it ("Praia de Carcavelos" in Carcavelos).
// Brackets rather than a comma, because favorite spots are listed with commas.
export function spotNameWithArea(spot) {
  if (!spot?.name) return ''
  if (!spot.area || normalizeText(spot.name).includes(normalizeText(spot.area))) return spot.name
  return `${spot.name} (${spot.area})`
}
