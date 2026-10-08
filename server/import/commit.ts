import type Database from 'better-sqlite3'
import { istDateKey } from '../../shared/ist.ts'
import type { EventInput } from '../../shared/schedule.ts'
import type { Store } from '../store.ts'

/**
 * What the sheet stops being authoritative about once someone has moved an event during the
 * fest. These are the things a delay, a venue change or a cancellation actually touches.
 *
 * The sheet is written days in advance; the bridge and the admin GUI are written minutes
 * ago. Re-importing a stale sheet over a live change would put the old time back silently
 * and the attendee would walk to a room that emptied an hour earlier — and the next sync
 * would do it again, all festival.
 *
 * Everything else — title, description, category, note — still syncs, so fixing a typo in
 * the sheet and re-importing works as expected even on an event that has moved.
 *
 * Only four, because EventInput is all a sheet row can say. It has no `status`, so a
 * cancellation by the bridge is safe without listing it, and no `originalStartAt`, so the
 * moved-from marker survives on its own once startAt is omitted — that is what applyEdit
 * keys the marker off. `satisfies` keeps this honest if EventInput ever grows a field.
 */
const LIVE_FIELDS = ['startAt', 'endAt', 'placeId', 'room'] as const satisfies readonly (keyof EventInput)[]

/** Imported rows are written as `import`; anything else means a human or the bridge. */
const IMPORT_AUTHOR = 'import'

export interface CommitCounts {
  created: number
  updated: number
  /** Matched, but their live fields were left as they stood. */
  preserved: number
}

/** Create or update one event per row, all in one transaction: any failure writes nothing. */
export function commitRows(
  db: Database.Database,
  store: Store,
  rows: { input: EventInput }[],
): CommitCounts {
  return db.transaction(() => {
    const counts: CommitCounts = { created: 0, updated: 0, preserved: 0 }
    for (const { input } of rows) {
      const existing = store.findByTitleAndDay(input.title, istDateKey(input.startAt))
      if (!existing) {
        store.create(input, IMPORT_AUTHOR, 'import')
        counts.created++
        continue
      }

      const movedSinceImport = existing.updatedBy !== IMPORT_AUTHOR
      const patch: Partial<EventInput> = { ...input }
      if (movedSinceImport) for (const field of LIVE_FIELDS) delete patch[field]

      store.edit(
        existing.id,
        {
          ...patch,
          updatedAt: existing.updatedAt,
          // A correction clears the moved-from marker, which is right when the sheet is
          // restating the time and wrong when it is not allowed to touch it.
          correction: !movedSinceImport,
        },
        IMPORT_AUTHOR,
        'import',
      )
      if (movedSinceImport) counts.preserved++
      else counts.updated++
    }
    return counts
  })()
}
