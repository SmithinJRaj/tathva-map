import { eventState } from '../../shared/classify.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { hostPlaceId, markerPlaceId } from '../data/campus'

/**
 * Events grouped for the map.
 *
 * `byPlace` is keyed by the marker whose popup should list them, so an indoor room's events show
 * on its building and a stage's acts show on the stage rather than on whatever it stands on.
 *
 * The highlight sets are keyed by **both** the marker and the host, because they colour shapes
 * as well as pins: the proshow should light its own pin and the football ground it is held on.
 */
export function indexByVenue(events: ScheduleEvent[], now: Date) {
  const byPlace = new Map<string, ScheduleEvent[]>()
  const liveVenueIds = new Set<string>()
  const eventVenueIds = new Set<string>()
  for (const e of events) {
    const marker = markerPlaceId(e.placeId)
    const list = byPlace.get(marker)
    if (list) list.push(e)
    else byPlace.set(marker, [e])
    const state = eventState(e, now)
    if (state === 'live') {
      for (const id of [marker, hostPlaceId(e.placeId)]) {
        liveVenueIds.add(id)
        eventVenueIds.add(id)
      }
    } else if (state === 'upcoming') {
      eventVenueIds.add(marker)
      eventVenueIds.add(hostPlaceId(e.placeId))
    }
  }
  return { byPlace, liveVenueIds, eventVenueIds }
}
