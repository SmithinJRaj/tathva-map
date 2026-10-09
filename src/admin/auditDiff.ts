import { formatIstDay, formatIstTime, istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import type { AuditEntry } from './api.ts'

/** Every field worth showing a change in, in the order they read best. */
export const AUDIT_FIELDS = [
  'title', 'description', 'category', 'placeId', 'room', 'startAt', 'endAt',
  'originalStartAt', 'status', 'note',
] as const satisfies readonly (keyof ScheduleEvent)[]

const TIME_FIELDS: ReadonlySet<string> = new Set(['startAt', 'endAt', 'originalStartAt'])

export function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (TIME_FIELDS.has(field)) {
    const iso = String(v)
    return `${formatIstDay(istDateKey(iso))} ${formatIstTime(iso)}`
  }
  if (field === 'placeId') return knownPlaces.get(String(v)) ?? String(v)
  return String(v)
}

export interface FieldChange {
  field: string
  before: string
  after: string
}

export function changes(entry: AuditEntry): FieldChange[] {
  if (!entry.before || !entry.after) return []
  return AUDIT_FIELDS.filter((f) => entry.before![f] !== entry.after![f]).map((field) => ({
    field,
    before: show(field, entry.before![field]),
    after: show(field, entry.after![field]),
  }))
}

export function when(iso: string): string {
  return `${formatIstDay(istDateKey(iso))} ${formatIstTime(iso)}`
}

/** The event's name at the time of the entry — it may since have been renamed, or deleted. */
export function titleOf(entry: AuditEntry): string {
  return entry.after?.title ?? entry.before?.title ?? entry.eventId
}
