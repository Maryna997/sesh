// "Emma Laurent" -> "EL", "Emma" -> "E", "John Michael Doe" -> "JD".
// Extra spaces are ignored; anything that isn't a usable name gives "".
// Letters are taken whole, so an accented or emoji first character isn't cut in half.
export function getInitials(name) {
  if (typeof name !== 'string') return ''
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const firstLetter = (word) => [...word][0] ?? ''
  const first = firstLetter(words[0])
  const last = words.length > 1 ? firstLetter(words[words.length - 1]) : ''
  return (first + last).toLocaleUpperCase()
}
