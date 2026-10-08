// Ranked name search over the campus places.
//
// Filtering alone is not enough here. "hostel" matches eight places and "a" matches most of
// them, so what matters is which one lands at the top: typing "a hos" should offer A Hostel
// before ABC Auditorium Complex. Rank is therefore by *how* the query matched, not just
// whether it did.

export interface SearchablePlace {
  id: string
  name: string
  category: string
  /** Extra words that should find this place: abbreviations not in the name, like OAT. */
  aliases?: readonly string[]
}

/** Lower is better. The order of these cases is the whole design. */
const Rank = {
  Exact: 0,
  NameStart: 1,
  WordStart: 2,
  Contains: 3,
  AllWords: 4,
  None: 5,
} as const

type Rank = (typeof Rank)[keyof typeof Rank]

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/** Splits on anything that is not a letter or digit, so "ECED (Block.II)" yields real words. */
const words = (text: string) => normalise(text).split(/[^a-z0-9]+/).filter(Boolean)

function rank(place: SearchablePlace, query: string): Rank {
  const name = normalise(place.name)
  if (name === query) return Rank.Exact
  if (name.startsWith(query)) return Rank.NameStart
  // An alias is a name people actually use, so a hit on one ranks with a name hit.
  if (place.aliases?.some((alias) => normalise(alias) === query)) return Rank.Exact
  if (words(place.name).some((word) => word.startsWith(query))) return Rank.WordStart
  if (place.aliases?.some((alias) => normalise(alias).startsWith(query))) return Rank.WordStart
  if (name.includes(query)) return Rank.Contains

  // Last resort: every word of the query turns up somewhere, in any order. This is what lets
  // "hostel pg" find PG I Hostel, and "food" find the places filed under that category.
  const haystack = `${name} ${normalise(place.category)} ${(place.aliases ?? []).map(normalise).join(' ')}`
  const queryWords = words(query)
  if (queryWords.length > 0 && queryWords.every((word) => haystack.includes(word))) {
    return Rank.AllWords
  }
  return Rank.None
}

/**
 * The places matching `query`, best first. An empty query returns everything in its original
 * order, so the field can double as a plain browsable list.
 */
export function searchPlaces<T extends SearchablePlace>(
  places: readonly T[],
  query: string,
  limit = 40,
): T[] {
  const trimmed = normalise(query)
  if (!trimmed) return places.slice(0, limit)

  const scored: { place: T; rank: Rank; index: number }[] = []
  for (const [index, place] of places.entries()) {
    const r = rank(place, trimmed)
    if (r !== Rank.None) scored.push({ place, rank: r, index })
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    // Within a rank, the shorter name is the more specific answer: "A Hostel" over
    // "ABC Auditorium Complex" for "a". Ties fall back to the incoming order, which is
    // alphabetical, so the list never reshuffles between keystrokes for no reason.
    const byLength = a.place.name.length - b.place.name.length
    return byLength !== 0 ? byLength : a.index - b.index
  })

  return scored.slice(0, limit).map((s) => s.place)
}
