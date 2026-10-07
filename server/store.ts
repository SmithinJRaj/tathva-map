import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { applyDelay, applyEdit } from '../shared/rules.ts'
import { istDateKey } from '../shared/ist.ts'
import type { EventFields, EventInput, EventPatch, ScheduleEvent } from '../shared/schedule.ts'

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`Event not found: ${id}`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  current: ScheduleEvent

  constructor(current: ScheduleEvent) {
    super('Event was changed by someone else')
    this.name = 'ConflictError'
    this.current = current
  }
}

export type AuditAction = 'create' | 'edit' | 'delay' | 'cancel' | 'restore' | 'delete' | 'import'

export interface AuditEntry {
  id: number
  at: string
  admin: string
  action: AuditAction
  eventId: string
  before: ScheduleEvent | null
  after: ScheduleEvent | null
}

export interface Store {
  version(): number
  list(): ScheduleEvent[]
  get(id: string): ScheduleEvent | null
  create(input: EventInput, admin: string, action?: 'create' | 'import'): ScheduleEvent
  edit(id: string, patch: EventPatch, admin: string, action?: 'edit' | 'import'): ScheduleEvent
  delay(id: string, minutes: number, admin: string, expectedUpdatedAt?: string): ScheduleEvent
  cancel(id: string, note: string | undefined, admin: string, expectedUpdatedAt?: string): ScheduleEvent
  restore(id: string, note: string | undefined, admin: string, expectedUpdatedAt?: string): ScheduleEvent
  remove(id: string, admin: string): void
  audit(eventId?: string): AuditEntry[]
  findByTitleAndDay(title: string, dateKey: string): ScheduleEvent | null
}

interface EventRow {
  id: string
  title: string
  description: string | null
  category: ScheduleEvent['category']
  place_id: string
  room: string | null
  start_at: string
  end_at: string
  original_start_at: string | null
  status: ScheduleEvent['status']
  note: string | null
  updated_at: string
  updated_by: string
}

interface AuditRow {
  id: number
  at: string
  admin: string
  action: AuditAction
  event_id: string
  before: string | null
  after: string | null
}

function rowToEvent(r: EventRow): ScheduleEvent {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    placeId: r.place_id,
    room: r.room,
    startAt: r.start_at,
    endAt: r.end_at,
    originalStartAt: r.original_start_at,
    status: r.status,
    note: r.note,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }
}

function rowToAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    at: r.at,
    admin: r.admin,
    action: r.action,
    eventId: r.event_id,
    before: r.before ? (JSON.parse(r.before) as ScheduleEvent) : null,
    after: r.after ? (JSON.parse(r.after) as ScheduleEvent) : null,
  }
}

/** Current time, bumped by 1 ms if needed so updatedAt strictly increases per event. */
function nextStamp(previous?: string): string {
  const now = new Date().toISOString()
  if (previous === undefined || now > previous) return now
  return new Date(new Date(previous).getTime() + 1).toISOString()
}

const SELECT_LIVE = 'SELECT * FROM events WHERE deleted = 0'

export function createStore(db: Database.Database): Store {
  const getRow = db.prepare<[string], EventRow>(`${SELECT_LIVE} AND id = ?`)
  const insertAudit = db.prepare(
    'INSERT INTO audit_log (at, admin, action, event_id, before, after) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const bump = db.prepare('UPDATE meta SET version = version + 1 WHERE id = 1')
  const insertEvent = db.prepare(`INSERT INTO events
    (id, title, description, category, place_id, room, start_at, end_at, original_start_at, status, note, deleted, updated_at, updated_by)
    VALUES (@id, @title, @description, @category, @placeId, @room, @startAt, @endAt, @originalStartAt, @status, @note, 0, @updatedAt, @updatedBy)`)
  const updateEvent = db.prepare(`UPDATE events SET
    title = @title, description = @description, category = @category, place_id = @placeId, room = @room,
    start_at = @startAt, end_at = @endAt, original_start_at = @originalStartAt, status = @status, note = @note,
    updated_at = @updatedAt, updated_by = @updatedBy WHERE id = @id`)
  const softDelete = db.prepare('UPDATE events SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?')

  function load(id: string, expectedUpdatedAt?: string): ScheduleEvent {
    const row = getRow.get(id)
    if (!row) throw new NotFoundError(id)
    const current = rowToEvent(row)
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== current.updatedAt) {
      throw new ConflictError(current)
    }
    return current
  }

  function record(admin: string, action: AuditAction, before: ScheduleEvent | null, after: ScheduleEvent | null) {
    insertAudit.run(
      new Date().toISOString(),
      admin,
      action,
      (after ?? before)!.id,
      before && JSON.stringify(before),
      after && JSON.stringify(after),
    )
    bump.run()
  }

  /** Apply a change to an existing event inside one transaction. */
  function change(
    id: string,
    admin: string,
    action: AuditAction,
    expectedUpdatedAt: string | undefined,
    fn: (before: ScheduleEvent) => EventFields,
  ): ScheduleEvent {
    return db.transaction(() => {
      const before = load(id, expectedUpdatedAt)
      const after: ScheduleEvent = {
        ...fn(before),
        id,
        updatedAt: nextStamp(before.updatedAt),
        updatedBy: admin,
      }
      updateEvent.run(after)
      record(admin, action, before, after)
      return after
    })()
  }

  return {
    version: () => (db.prepare('SELECT version FROM meta WHERE id = 1').get() as { version: number }).version,

    list: () => db.prepare<[], EventRow>(`${SELECT_LIVE} ORDER BY start_at, id`).all().map(rowToEvent),

    get(id) {
      const row = getRow.get(id)
      return row ? rowToEvent(row) : null
    },

    create(input, admin, action = 'create') {
      return db.transaction(() => {
        const event: ScheduleEvent = {
          ...input,
          id: nanoid(10),
          originalStartAt: null,
          status: 'scheduled',
          updatedAt: nextStamp(),
          updatedBy: admin,
        }
        insertEvent.run(event)
        record(admin, action, null, event)
        return event
      })()
    },

    edit(id, patch, admin, action = 'edit') {
      const { updatedAt, correction, ...fields } = patch
      return change(id, admin, action, updatedAt, (before) => applyEdit(before, fields, correction ?? false))
    },

    delay: (id, minutes, admin, expected) =>
      change(id, admin, 'delay', expected, (before) => applyDelay(before, minutes)),

    cancel: (id, note, admin, expected) =>
      change(id, admin, 'cancel', expected, (before) => ({
        ...before,
        status: 'cancelled',
        note: note ?? before.note,
      })),

    // The cancel note ("Rain") would be wrong once the event is back on, so it goes unless replaced.
    restore: (id, note, admin, expected) =>
      change(id, admin, 'restore', expected, (before) => ({ ...before, status: 'scheduled', note: note ?? null })),

    remove(id, admin) {
      db.transaction(() => {
        const before = load(id)
        softDelete.run(nextStamp(before.updatedAt), admin, id)
        record(admin, 'delete', before, null)
      })()
    },

    audit(eventId) {
      const rows = eventId
        ? db.prepare<[string], AuditRow>('SELECT * FROM audit_log WHERE event_id = ? ORDER BY id DESC').all(eventId)
        : db.prepare<[], AuditRow>('SELECT * FROM audit_log ORDER BY id DESC').all()
      return rows.map(rowToAudit)
    },

    findByTitleAndDay(title, dateKey) {
      const wanted = title.trim()
      const hit = this.list().find((e) => e.title === wanted && istDateKey(e.startAt) === dateKey)
      return hit ?? null
    },
  }
}
