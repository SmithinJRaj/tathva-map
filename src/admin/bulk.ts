import { istDateKey } from '../../shared/ist.ts'
import type { Category, EventInput, ScheduleEvent } from '../../shared/schedule.ts'
import { fromIstInputs } from './istInputs.ts'

/**
 * One change applied to several events. Blank means "leave this alone", so a bulk edit only
 * ever touches the fields someone filled in.
 *
 * The case this exists for: a couple of dozen events imported with a placeholder 09:00–18:00
 * window, which makes each of them look live for nine hours. Fixing those one at a time is a
 * couple of dozen round trips.
 */
export interface BulkEdit {
  /** IST 'HH:mm', applied to each event's own day. */
  startTime: string
  endTime: string
  placeId: string
  category: Category | ''
  /**
   * Whether the new time is a fix rather than a delay. Correcting a placeholder window is not
   * a move, and marking two dozen events "delayed" would tell attendees something untrue —
   * which is why this defaults on for a bulk time change.
   */
  correction: boolean
}

export const emptyBulkEdit: BulkEdit = {
  startTime: '',
  endTime: '',
  placeId: '',
  category: '',
  correction: true,
}

export type BulkChange =
  | { kind: 'change'; fields: Partial<EventInput>; correction: boolean }
  /** Already as asked, so no write and no audit entry for a change that didn't happen. */
  | { kind: 'skip' }
  | { kind: 'invalid'; reason: string }

export const hasBulkEdit = (edit: BulkEdit) =>
  Boolean(edit.startTime || edit.endTime || edit.placeId || edit.category)

/**
 * What this edit means for one event. Times land on the event's **start** day, so a bulk time
 * change cannot make an event cross midnight — one that needs to is reported here and done
 * individually instead of being guessed at.
 */
export function bulkChange(event: ScheduleEvent, edit: BulkEdit): BulkChange {
  const fields: Partial<EventInput> = {}
  const day = istDateKey(event.startAt)

  if (edit.startTime) {
    const startAt = fromIstInputs(day, edit.startTime)
    if (!startAt) return { kind: 'invalid', reason: 'that start time is not a time' }
    if (startAt !== event.startAt) fields.startAt = startAt
  }
  if (edit.endTime) {
    const endAt = fromIstInputs(day, edit.endTime)
    if (!endAt) return { kind: 'invalid', reason: 'that end time is not a time' }
    if (endAt !== event.endAt) fields.endAt = endAt
  }
  const startAt = fields.startAt ?? event.startAt
  const endAt = fields.endAt ?? event.endAt
  if (endAt <= startAt) {
    return { kind: 'invalid', reason: 'the end would not be after the start — fix this one on its own' }
  }

  if (edit.placeId && edit.placeId !== event.placeId) fields.placeId = edit.placeId
  if (edit.category && edit.category !== event.category) fields.category = edit.category

  if (Object.keys(fields).length === 0) return { kind: 'skip' }
  // A correction only means anything when the time moved; it is what clears the "delayed" marker.
  return { kind: 'change', fields, correction: edit.correction && fields.startAt !== undefined }
}
