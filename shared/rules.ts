import type { EventFields, EventInput } from './schedule.ts'

export class RuleError extends Error {
  field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = 'RuleError'
    this.field = field
  }
}

/** Drop the moved-from marker once an event is back at its original time. */
function normalize(e: EventFields): EventFields {
  return e.originalStartAt === e.startAt ? { ...e, originalStartAt: null } : e
}

function shift(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

export function applyDelay(e: EventFields, minutes: number): EventFields {
  return normalize({
    ...e,
    startAt: shift(e.startAt, minutes),
    endAt: shift(e.endAt, minutes),
    originalStartAt: e.originalStartAt ?? e.startAt,
  })
}

/** A key absent from the patch means unchanged. A correction fixes a typo, so it is not a move. */
export function applyEdit(e: EventFields, patch: Partial<EventInput>, correction: boolean): EventFields {
  const merged: EventFields = { ...e }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value
  }
  if (merged.endAt <= merged.startAt) throw new RuleError('endAt', 'End must be after start')
  if (correction) merged.originalStartAt = null
  else if (merged.startAt !== e.startAt) merged.originalStartAt = e.originalStartAt ?? e.startAt
  return normalize(merged)
}
