// Makes text easy to compare in searches:
// lowercase, accents removed and apostrophes dropped.
// "São João" -> "sao joao", "Ribeira d’Ilhas" -> "ribeira dilhas"
export function normalizeText(text = '') {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .trim()
}
