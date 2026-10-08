import { classify } from '../../shared/classify.ts'
import { istDateKey } from '../../shared/ist.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { dayLabel } from './festDays.ts'

export interface VenueSection {
  title: string
  events: ScheduleEvent[]
}

/** A venue's schedule as popup sections: live now, later today, then one per later day. */
export function venueSections(events: ScheduleEvent[], now: Date): VenueSection[] {
  const { live, upcomingByDay } = classify(events, now)
  const todayKey = istDateKey(now)
  const sections: VenueSection[] = [{ title: 'Live now', events: live }]
  for (const { dateKey, events: dayEvents } of upcomingByDay) {
    sections.push({ title: dateKey === todayKey ? 'Later today' : dayLabel(dateKey, todayKey), events: dayEvents })
  }
  return sections.filter((s) => s.events.length > 0)
}
