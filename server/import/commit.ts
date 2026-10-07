import type Database from 'better-sqlite3'
import { istDateKey } from '../../shared/ist.ts'
import type { EventInput } from '../../shared/schedule.ts'
import type { Store } from '../store.ts'

/** Create or update one event per row, all in one transaction: any failure writes nothing. */
export function commitRows(
  db: Database.Database,
  store: Store,
  rows: { input: EventInput }[],
): { created: number; updated: number } {
  return db.transaction(() => {
    let created = 0
    let updated = 0
    for (const { input } of rows) {
      const existing = store.findByTitleAndDay(input.title, istDateKey(input.startAt))
      if (existing) {
        store.edit(existing.id, { ...input, updatedAt: existing.updatedAt, correction: true }, 'import', 'import')
        updated++
      } else {
        store.create(input, 'import', 'import')
        created++
      }
    }
    return { created, updated }
  })()
}
