import type { EventInput, ScheduleEvent } from '../../shared/schedule.ts'
import type { AuditEntry } from './api.ts'

/**
 * Putting a change back.
 *
 * A revert writes the *fields* an entry changed back to what they were — it does not write the
 * whole stored row back. That matters for one field in particular: `updatedBy`. Restoring it
 * wholesale would make the revert look like whoever made the original change, and if that was
 * `import` it would hand the event back to the sheet-overwrite rule, so the next sync would
 * silently undo the revert. Writing the fields as the admin doing the reverting keeps both the
 * history and that protection honest: the revert shows up in the log as its own edit, by them.
 *
 * The moved-from marker is derived rather than restored, for the same reason — it is not a field
 * anyone can set. Reverting an event that was never marked as moved clears the marker (a
 * correction); reverting one that already carried it leaves it carrying one.
 */

const PATCHABLE = [
  'title', 'description', 'category', 'placeId', 'room', 'startAt', 'endAt', 'note',
] as const satisfies readonly (keyof EventInput)[]

export type RevertPlan =
  | { kind: 'blocked'; reason: string }
  | {
      kind: 'revert'
      fields: Partial<EventInput>
      /** Set when the entry flipped cancelled/scheduled, which is its own call, not a field. */
      status: ScheduleEvent['status'] | null
      correction: boolean
    }

export function revertPlan(entry: AuditEntry): RevertPlan {
  if (!entry.before) {
    return { kind: 'blocked', reason: 'this entry added the event — undoing it means deleting it, from Edit' }
  }
  if (!entry.after) {
    return { kind: 'blocked', reason: 'this entry deleted the event — it has to be added again' }
  }

  const before = entry.before
  const after = entry.after
  const fields: Partial<EventInput> = {}
  for (const field of PATCHABLE) {
    if (before[field] !== after[field]) (fields as Record<string, unknown>)[field] = before[field]
  }
  const status = before.status !== after.status ? before.status : null
  if (status === null && Object.keys(fields).length === 0) {
    return { kind: 'blocked', reason: 'nothing changed in this entry' }
  }
  return { kind: 'revert', fields, status, correction: fields.startAt !== undefined && before.originalStartAt === null }
}

/** Just the calls a revert makes, so this can be exercised without a server. */
export interface RevertApi {
  cancel(id: string, updatedAt: string, note?: string): Promise<ScheduleEvent>
  restore(id: string, updatedAt: string): Promise<ScheduleEvent>
  patch(id: string, patch: Partial<EventInput> & { updatedAt: string; correction?: boolean }): Promise<ScheduleEvent>
}

/**
 * Runs a plan against the event as it stands now. Each call carries the previous one's
 * `updatedAt`, so a revert raced by someone else's edit fails the optimistic lock rather than
 * overwriting them.
 */
export async function applyRevert(
  api: RevertApi,
  event: ScheduleEvent,
  plan: Extract<RevertPlan, { kind: 'revert' }>,
): Promise<ScheduleEvent> {
  let current = event
  if (plan.status && plan.status !== current.status) {
    current =
      plan.status === 'cancelled'
        ? await api.cancel(current.id, current.updatedAt, plan.fields.note ?? undefined)
        : await api.restore(current.id, current.updatedAt)
  }
  if (Object.keys(plan.fields).length > 0) {
    current = await api.patch(current.id, {
      ...plan.fields,
      updatedAt: current.updatedAt,
      ...(plan.correction ? { correction: true } : {}),
    })
  }
  return current
}
