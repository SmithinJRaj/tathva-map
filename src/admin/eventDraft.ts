import type { Category, EventInput, ScheduleEvent } from '../../shared/schedule.ts'
import { toIstInputs } from './istInputs.ts'

/** Everything the form holds as typed, so it survives a trip through the login screen. */
export interface EventDraft {
  title: string
  description: string
  category: Category
  placeId: string
  room: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  note: string
  correction: boolean
}

export function draftOf(event?: ScheduleEvent): EventDraft {
  const start = event ? toIstInputs(event.startAt) : { date: '', time: '' }
  const end = event ? toIstInputs(event.endAt) : { date: '', time: '' }
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    category: event?.category ?? 'other',
    placeId: event?.placeId ?? '',
    room: event?.room ?? '',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    note: event?.note ?? '',
    correction: false,
  }
}

/**
 * Fills a blank draft from what the announcement parser worked out. Only the fields it supplied
 * are touched: a venue or a time it could not read stays empty rather than being filled with a
 * plausible-looking guess, because an empty field is visibly unanswered and a wrong one is not.
 */
export function draftFromParsed(parsed: Partial<EventInput>): EventDraft {
  const draft = draftOf()
  if (parsed.title) draft.title = parsed.title
  if (parsed.description) draft.description = parsed.description
  if (parsed.category) draft.category = parsed.category
  if (parsed.placeId) draft.placeId = parsed.placeId
  if (parsed.room) draft.room = parsed.room
  if (parsed.note) draft.note = parsed.note
  if (parsed.startAt) {
    const start = toIstInputs(parsed.startAt)
    draft.startDate = start.date
    draft.startTime = start.time
  }
  if (parsed.endAt) {
    const end = toIstInputs(parsed.endAt)
    draft.endDate = end.date
    draft.endTime = end.time
  }
  return draft
}
