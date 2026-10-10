import { eventState } from '../../shared/classify.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { hostPlaceId, markerPlaceId } from '../data/campus'
import { flagshipVenueOf } from './flagship'

/**
 * Events grouped for the map.
 *
 * `byPlace` is keyed by the marker whose popup should list them, so an indoor room's events show
 * on its building and a stage's acts show on the stage rather than on whatever it stands on.
 *
 * An event can land in **two** buckets. Robowars is stored at the Open Air Theatre, and belongs
 * both on the theatre's pin — which is what it is — and on the pin named Robowars, which is what
 * people are looking for. Listing it twice is the honest answer; leaving either one empty is not.
 *
 * The highlight sets are keyed by every id involved, because they colour shapes as well as pins:
 * the proshow should light its own pin and the football ground it is held on.
 */
export function indexByVenue(events: ScheduleEvent[], now: Date) {
  const byPlace = new Map<string, ScheduleEvent[]>()
  const liveVenueIds = new Set<string>()
  const eventVenueIds = new Set<string>()
  for (const e of events) {
    const ids = [markerPlaceId(e.placeId), hostPlaceId(e.placeId), flagshipVenueOf(e)]
    for (const id of new Set(ids.filter((id): id is string => id !== null))) {
      // The host only gets a bucket when it is the marker too; otherwise its pin would list a
      // room's events twice over. It always gets the highlight, because its shape is drawn.
      if (id === markerPlaceId(e.placeId) || id === flagshipVenueOf(e)) {
        const list = byPlace.get(id)
        if (list) list.push(e)
        else byPlace.set(id, [e])
      }
      const state = eventState(e, now)
      if (state === 'live') {
        liveVenueIds.add(id)
        eventVenueIds.add(id)
      } else if (state === 'upcoming') {
        eventVenueIds.add(id)
      }
    }
  }
  return { byPlace, liveVenueIds, eventVenueIds }
}
