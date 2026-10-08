const words = (text: string) => text.split(/[^a-zA-Z0-9]+/).filter(Boolean)

/** Lowercase alphanumerics separated by single spaces. */
export function normalise(text: string): string {
  return words(text).join(' ').toLowerCase()
}

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

export function matchVenue(
  text: string,
  places: ReadonlyMap<string, string>,
  aliases: Record<string, string>,
): { placeId: string; room: string | null } | null {
  const tokens = words(text)
  const byName = new Map<string, string>()
  for (const [id, name] of places) byName.set(normalise(name), id)
  const lookup = (key: string) => byName.get(key) ?? aliases[key]

  for (let k = tokens.length; k >= 1; k--) {
    const placeId = lookup(tokens.slice(0, k).join(' ').toLowerCase())
    if (placeId) return { placeId, room: tokens.slice(k).join(' ') || null }
  }

  const whole = normalise(text)
  let best: { placeId: string; score: number } | null = null
  for (const [name, placeId] of byName) {
    const score = similarity(whole, name)
    if (score >= 0.8 && (!best || score > best.score)) best = { placeId, score }
  }
  return best && { placeId: best.placeId, room: null }
}
