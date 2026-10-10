import type { ScheduleEvent } from '../../shared/schedule.ts'
import { flagshipPlaces, markerPlaceId } from '../data/campus'
import { festVenues } from '../data/festContent'

/** The venues labelled by name on the map: the stages and the flagship events. */
export const flagshipPlaceIds: ReadonlySet<string> = new Set(flagshipPlaces.map((p) => p.id))

/**
 * Venues that name an **event** rather than a place, and the host they are held at.
 *
 * Robowars is at the Open Air Theatre and stored that way, so nothing about the event itself
 * says "Robowars venue". Matching on the title is what lets a pin called Robowars hold the
 * Robowars events instead of opening onto "No events scheduled here" while the theatre beside
 * it has them.
 */
const titled = festVenues
  .filter((v) => v.titles?.length)
  .map((v) => ({ id: v.id, at: v.at, titles: v.titles!.map((t) => t.toLowerCase()) }))

/**
 * The flagship venue an event belongs to by name, if any.
 *
 * Matched on the start of the title so that numbered sessions and shifts come along —
 * "Workshops (Session 1)" belongs to Workshops. The host has to agree too: an event called
 * Robowars somewhere else entirely is not this venue's, and quietly filing it here would put a
 * pin on the wrong side of campus.
 */
export function flagshipVenueOf(event: Pick<ScheduleEvent, 'placeId' | 'title'>): string | null {
  const title = event.title.trim().toLowerCase()
  for (const venue of titled) {
    if (event.placeId !== venue.at) continue
    if (venue.titles.some((t) => title.startsWith(t))) return venue.id
  }
  return null
}

/** Whether a row should be marked as flagship, however it is reached. */
export function isFlagshipEvent(event: Pick<ScheduleEvent, 'placeId' | 'title'>): boolean {
  return flagshipPlaceIds.has(markerPlaceId(event.placeId)) || flagshipVenueOf(event) !== null
}
