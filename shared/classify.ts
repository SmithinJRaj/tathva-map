import { istDateKey } from './ist.ts'
import type { ScheduleEvent } from './schedule.ts'

export type EventState = 'cancelled' | 'live' | 'upcoming' | 'ended'

const ms = (iso: string) => Date.parse(iso)

export function eventState(e: ScheduleEvent, now: Date): EventState {
  const t = now.getTime()
  if (e.status === 'cancelled') return 'cancelled'
  if (t >= ms(e.endAt)) return 'ended'
  if (t >= ms(e.startAt)) return 'live'
  return 'upcoming'
}

export function timeShift(e: ScheduleEvent): 'delayed' | 'early' | null {
  if (!e.originalStartAt) return null
  const diff = ms(e.startAt) - ms(e.originalStartAt)
  if (diff > 0) return 'delayed'
  if (diff < 0) return 'early'
  return null
}

export function classify(
  events: ScheduleEvent[],
  now: Date,
): { live: ScheduleEvent[]; upcomingByDay: { dateKey: string; events: ScheduleEvent[] }[] } {
  const t = now.getTime()
  const live: ScheduleEvent[] = []
  const upcoming: ScheduleEvent[] = []
  for (const e of events) {
    const state = eventState(e, now)
    if (state === 'live') live.push(e)
    else if (state === 'upcoming') upcoming.push(e)
    // cancelled events stay listed (greyed) until they would have ended
    else if (state === 'cancelled' && t < ms(e.endAt)) upcoming.push(e)
  }
  live.sort((a, b) => ms(a.endAt) - ms(b.endAt))
  upcoming.sort((a, b) => ms(a.startAt) - ms(b.startAt))
  const days = new Map<string, ScheduleEvent[]>()
  for (const e of upcoming) {
    const key = istDateKey(e.startAt)
    const list = days.get(key)
    if (list) list.push(e)
    else days.set(key, [e])
  }
  const upcomingByDay = [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, evs]) => ({ dateKey, events: evs }))
  return { live, upcomingByDay }
}
