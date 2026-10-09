/**
 * Builds `public/api/schedule` from the CSV exports, so the map can show the real schedule
 * with no service running behind it.
 *
 *   npm run static-schedule   # writes public/api/schedule, which is committed
 *   npm run build             # Vite copies it into dist/
 *
 * The attendee app only ever reads `GET /api/schedule`, so a static file at that path is
 * indistinguishable from the service to it: same shape, same ETag-and-304 behaviour from the
 * host, same offline cache on the client. What it cannot do is change — no admin edits, no
 * WhatsApp bridge — which is exactly the trade while the service has nowhere to run.
 *
 * Swapping back is deleting the file and pointing /api at the service.
 *
 * Ids are derived from title and day rather than minted, so rebuilding gives every event the
 * same id and a viewer's cached copy stays coherent across deploys.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { istDateKey } from '../../shared/ist.ts'
import type { ScheduleEvent, ScheduleResponse } from '../../shared/schedule.ts'
import { FEST_DAYS } from '../../src/schedule/festDays.ts'
import { parseScheduleCsv } from '../import/parse.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CSV_DIR = join(ROOT, process.argv[2] ?? 'csv')
// Written into public/, not dist/: Vite copies it verbatim at build time, so the deploy
// host rebuilds without ever seeing the CSVs - which carry volunteers' names and phone
// numbers and must not leave this machine. The generated file holds neither.
const OUT = join(ROOT, 'public', 'api', 'schedule')

const festDays = Object.keys(FEST_DAYS).sort()
if (festDays.length === 0) {
  console.error('FEST_DAYS in src/schedule/festDays.ts is empty; fill in the fest dates first.')
  process.exit(1)
}

/** Which file is which day. `Everyday` repeats across all of them. */
const FILES: { name: string; everyDay?: boolean; date?: string }[] = [
  ...festDays.map((date, i) => ({ name: `Day_${i + 1}.csv`, date })),
  { name: 'Everyday.csv', everyDay: true },
]

const id = (title: string, day: string) =>
  createHash('sha1').update(`${title}\n${day}`).digest('hex').slice(0, 16)

const events: ScheduleEvent[] = []
const now = new Date().toISOString()
let skipped = 0

for (const file of FILES) {
  let text: string
  try {
    text = readFileSync(join(CSV_DIR, file.name), 'utf8')
  } catch {
    console.warn(`  ${file.name}: not found, skipping`)
    continue
  }
  const { ok, errors } = parseScheduleCsv(text, {
    defaultDate: file.date,
    everyDay: file.everyDay ? festDays : undefined,
  })
  skipped += errors.length
  for (const { input } of ok) {
    const day = istDateKey(input.startAt)
    events.push({
      ...input,
      id: id(input.title, day),
      originalStartAt: null,
      status: 'scheduled',
      updatedAt: now,
      updatedBy: 'import',
    })
  }
  console.log(`  ${file.name.padEnd(14)} ${String(ok.length).padStart(3)} events, ${errors.length} skipped`)
}

if (events.length === 0) {
  console.error('No events parsed; not writing a schedule nobody can use.')
  process.exit(1)
}

events.sort((a, b) => a.startAt.localeCompare(b.startAt))

const payload: ScheduleResponse = { version: 1, generatedAt: now, events }
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(payload)}\n`)

console.log(`\nWrote ${OUT}`)
console.log(`${events.length} events, ${skipped} rows skipped (add those in /admin once the service runs).`)
