import { knownPlaces } from '../../shared/places.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'

/**
 * True when every word of the query appears somewhere in what a row shows: title, venue,
 * room, category or note. Descriptions are left out - they only show in venue popups, and a
 * match on text nobody can see in the list reads as a bug.
 */
export function matchesQuery(event: ScheduleEvent, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [event.title, knownPlaces.get(event.placeId), event.room, event.category, event.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}
