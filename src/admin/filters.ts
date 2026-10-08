import { eventState, type EventState } from '../../shared/classify.ts'
import { istDateKey } from '../../shared/ist.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'

export interface AdminFilters {
  day: string | null
  placeId: string | null
  state: EventState | null
  search: string
}

/** Unlike the attendee view, ended events stay in: organisers fix mistakes after the fact. */
export function filterEvents(events: ScheduleEvent[], f: AdminFilters, now: Date): ScheduleEvent[] {
  const needle = f.search.trim().toLowerCase()
  return events.filter(
    (e) =>
      (!f.day || istDateKey(e.startAt) === f.day) &&
      (!f.placeId || e.placeId === f.placeId) &&
      (!f.state || eventState(e, now) === f.state) &&
      (!needle || e.title.toLowerCase().includes(needle)),
  )
}
