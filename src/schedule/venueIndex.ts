import { eventState } from '../../shared/classify.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { hostPlaceId } from '../data/campus'

/** Events grouped by the building they are drawn on, so an indoor room's events show on its host. */
export function indexByVenue(events: ScheduleEvent[], now: Date) {
  const byPlace = new Map<string, ScheduleEvent[]>()
  const liveVenueIds = new Set<string>()
  const eventVenueIds = new Set<string>()
  for (const e of events) {
    const host = hostPlaceId(e.placeId)
    const list = byPlace.get(host)
    if (list) list.push(e)
    else byPlace.set(host, [e])
    const state = eventState(e, now)
    if (state === 'live') {
      liveVenueIds.add(host)
      eventVenueIds.add(host)
    } else if (state === 'upcoming') {
      eventVenueIds.add(host)
    }
  }
  return { byPlace, liveVenueIds, eventVenueIds }
}
