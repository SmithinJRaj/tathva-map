import { eventState } from '../../shared/classify.ts'
import { istDateKey } from '../../shared/ist.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { festVenues } from '../data/festContent.ts'

/** The venues whose programme is the headline running order, from the fest data. */
export const stagePlaceIds: ReadonlySet<string> = new Set(
  festVenues.filter((v) => v.stage).map((v) => v.id),
)

export const isStageEvent = (event: ScheduleEvent) => stagePlaceIds.has(event.placeId)

export interface StageDay {
  dateKey: string
  events: ScheduleEvent[]
}

const ms = (iso: string) => Date.parse(iso)

/**
 * The main stage running order: every act at a stage venue, by day, in start order.
 *
 * Unlike Live and Up next, this **keeps acts that have already finished today**. A running order
 * is read to find your place in the evening — "the magician is done, the band is on, the DJ is
 * at half nine" — and a list that deletes what has passed cannot answer that. Whole days that
 * are over are dropped, since nobody needs yesterday's order.
 *
 * Cancelled acts stay in, greyed by the row itself: a gap in the order is a question, and
 * "cancelled" is the answer to it.
 */
export function stageDays(events: ScheduleEvent[], now: Date): StageDay[] {
  const today = istDateKey(now)
  const byDay = new Map<string, ScheduleEvent[]>()
  for (const event of events) {
    if (!isStageEvent(event)) continue
    const key = istDateKey(event.startAt)
    if (key < today) continue
    const list = byDay.get(key)
    if (list) list.push(event)
    else byDay.set(key, [event])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, list]) => ({
      dateKey,
      events: list.sort((a, b) => ms(a.startAt) - ms(b.startAt) || a.title.localeCompare(b.title)),
    }))
}

/** How many acts are still to come, for the tab's count. What has finished is not "to come". */
export function stageRemaining(days: StageDay[], now: Date): number {
  let n = 0
  for (const day of days) for (const e of day.events) if (eventState(e, now) !== 'ended') n++
  return n
}
