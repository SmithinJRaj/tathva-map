/** Alphanumeric runs, with where each one ends in the original text. */
function tokenise(text: string): { value: string; end: number }[] {
  const out: { value: string; end: number }[] = []
  const pattern = /[a-zA-Z0-9]+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    out.push({ value: match[0], end: match.index + match[0].length })
  }
  return out
}

const words = (text: string) => tokenise(text).map((t) => t.value)

/** Lowercase alphanumerics separated by single spaces. */
export function normalise(text: string): string {
  return words(text).join(' ').toLowerCase()
}

/**
 * Words that say what *kind* of place something is. Two names that disagree on these are not
 * the same place however alike they look: "Aryabhatta Hall" and "Aryabhatta Park" differ by
 * one word in two, score 0.87 on edit distance, and mean opposite things. Short multi-word
 * names put a semantic opposite comfortably inside any threshold loose enough to forgive a
 * typo, so similarity alone cannot be trusted to tell them apart.
 */
const TYPE_WORDS = new Set([
  'hall', 'park', 'lab', 'labs', 'laboratory', 'ground', 'grounds', 'court', 'block',
  'stage', 'room', 'centre', 'center', 'complex', 'department', 'dept', 'gate', 'office',
  'canteen', 'theatre', 'theater', 'auditorium', 'building', 'hostel', 'circle', 'gym',
  'school', 'mosque', 'church', 'plaza', 'avenue', 'road', 'field',
])

const typeWordsIn = (normalised: string) =>
  new Set(normalised.split(' ').filter((w) => TYPE_WORDS.has(w)))

/** True when both names say what kind of place they are, and disagree. */
function contradicts(a: string, b: string): boolean {
  const left = typeWordsIn(a)
  const right = typeWordsIn(b)
  if (left.size === 0 || right.size === 0) return false
  for (const word of left) if (right.has(word)) return false
  return true
}

/**
 * Separators that mean "and another place", not "room". A venue naming two places cannot be
 * one event's location, so it is left unresolved for a human rather than silently truncated
 * to the first.
 */
const CONJUNCTIONS = /[+&]|\bund\b/

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return 1 - prev[b.length] / max
}

export interface VenueMatch {
  placeId: string
  room: string | null
}

export function matchVenue(
  text: string,
  places: ReadonlyMap<string, string>,
  aliases: Record<string, string>,
  rooms: Record<string, VenueMatch> = {},
): VenueMatch | null {
  const byName = new Map<string, string>()
  for (const [id, name] of places) byName.set(normalise(name), id)
  const lookup = (key: string) => byName.get(key) ?? aliases[key]

  // "ELHC+Electronics lab" is two venues, and picking the first would put the event in the
  // wrong building with a plausible-looking room.
  if (CONJUNCTIONS.test(text)) return null

  // A name that is a room on its own ("SSL") carries its building with it.
  const asRoom = rooms[normalise(text)]
  if (asRoom) return asRoom

  const tokens = tokenise(text)
  for (let k = tokens.length; k >= 1; k--) {
    const placeId = lookup(tokens.slice(0, k).map((t) => t.value).join(' ').toLowerCase())
    if (!placeId) continue

    // Keep the remainder as it was written: "101,102,103" is a readable list of rooms, while
    // re-joining the words gives "101 102 103", which reads like one number.
    const rest = text.slice(tokens[k - 1].end).replace(/^[^a-zA-Z0-9]+/, '').trim()
    const restTokens = words(rest)

    // "ELHC 302, ELHC 301" names two rooms in a way one `room` cannot express.
    if (namesAPlace(rest, lookup)) return null

    // "Proshow Ground" is one place colloquially named; "Ground" is not a room in it. A
    // longer remainder like "ground floor" is a real location and is kept.
    const onlyTypeWord = restTokens.length === 1 && TYPE_WORDS.has(restTokens[0].toLowerCase())

    return { placeId, room: rest && !onlyTypeWord ? rest : null }
  }

  // Nothing matched outright. Fall back to edit distance, which forgives a typo but must not
  // be allowed to forgive a different kind of place.
  const whole = normalise(text)
  let best: { placeId: string; score: number } | null = null
  for (const [name, placeId] of byName) {
    if (contradicts(whole, name)) continue
    const score = similarity(whole, name)
    if (score >= 0.8 && (!best || score > best.score)) best = { placeId, score }
  }
  return best && { placeId: best.placeId, room: null }
}

/** True when a known place name or alias appears anywhere in the text. */
function namesAPlace(text: string, lookup: (key: string) => string | undefined): boolean {
  const tokens = words(text).map((t) => t.toLowerCase())
  for (let start = 0; start < tokens.length; start++) {
    for (let end = tokens.length; end > start; end--) {
      if (lookup(tokens.slice(start, end).join(' '))) return true
    }
  }
  return false
}

/**
 * The closest place name to an unresolved venue, for the error message. Ignores the
 * contradiction guard on purpose: "did you mean Aryabhatta Park?" is useful to a human
 * precisely when the matcher refused to assume it.
 */
export function suggestVenue(text: string, places: ReadonlyMap<string, string>): string | null {
  const whole = normalise(text)
  let best: { name: string; score: number } | null = null
  for (const name of places.values()) {
    const score = similarity(whole, normalise(name))
    if (score >= 0.6 && (!best || score > best.score)) best = { name, score }
  }
  return best?.name ?? null
}
