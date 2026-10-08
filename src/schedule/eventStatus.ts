import { eventState, timeShift } from '../../shared/classify.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'

/** An upcoming event this close to its start gets a countdown instead of no badge at all. */
export const SOON_MINUTES = 15

export type StatusTone = 'cancelled' | 'soon' | 'delayed' | 'early' | 'live'

export interface EventStatus {
  label: string
  tone: StatusTone
}

const minutesUntil = (iso: string, now: Date) => Math.ceil((Date.parse(iso) - now.getTime()) / 60_000)

/**
 * The one badge an event row shows. A countdown beats "delayed" because it is what someone
 * deciding whether to walk over needs; the struck-through original time still shows the delay.
 */
export function eventStatus(event: ScheduleEvent, now: Date): EventStatus | null {
  const state = eventState(event, now)
  if (state === 'cancelled') return { label: 'CANCELLED', tone: 'cancelled' }
  if (state === 'upcoming') {
    const minutes = minutesUntil(event.startAt, now)
    if (minutes <= SOON_MINUTES) return { label: `in ${minutes} min`, tone: 'soon' }
  }
  const shift = timeShift(event)
  if (shift === 'delayed') return { label: 'DELAYED', tone: 'delayed' }
  if (shift === 'early') return { label: 'EARLY', tone: 'early' }
  if (state === 'live') return { label: `${minutesUntil(event.endAt, now)} min left`, tone: 'live' }
  return null
}
