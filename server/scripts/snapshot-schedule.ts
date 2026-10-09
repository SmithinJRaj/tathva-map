/**
 * Copies the *running service's* schedule into `public/api/schedule`, the static file the
 * deployed site serves.
 *
 *   npm run snapshot-schedule            # from http://127.0.0.1:8787
 *   npm run snapshot-schedule -- <url>   # from somewhere else
 *
 * This exists because the hosted site has no backend. Vercel serves `dist/`, and `dist/api/schedule`
 * is this file, so every attendee reads a snapshot taken whenever it was last committed. Meanwhile
 * the admin GUI, the WhatsApp bridge and the importer all write to the SQLite service, which only
 * this machine can reach. The two drift apart silently and nothing anywhere reports it: the site
 * keeps serving a perfectly valid schedule that is simply old.
 *
 * `static-schedule` is the other way to build the same file, from the CSV exports. Use that one
 * before the service exists. Use this one once it does, because the CSVs do not contain anything
 * the bridge or an organiser added since.
 *
 * **A snapshot is frozen.** Delays and cancellations made after it is taken do not reach anyone
 * until the next deploy. The real fix is to point `/api` at the service — see server/README.md.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScheduleResponse } from '../../shared/schedule.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'public', 'api', 'schedule')
const source = process.argv[2] ?? process.env.SCHEDULE_URL ?? 'http://127.0.0.1:8787/api/schedule'

let payload: ScheduleResponse
try {
  const res = await fetch(source, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  payload = (await res.json()) as ScheduleResponse
} catch (err) {
  console.error(`Could not read the schedule from ${source}`)
  console.error(`  ${err instanceof Error ? err.message : String(err)}`)
  console.error('\nIs the service running? `npm run server` with DB_PATH set.')
  process.exit(1)
}

if (!Array.isArray(payload?.events)) {
  console.error(`${source} did not answer with a schedule. Is that the right URL?`)
  process.exit(1)
}

// The same guard static-schedule has: an empty file would wipe the deployed schedule, and an
// empty schedule is never what anyone meant.
if (payload.events.length === 0) {
  console.error('That schedule has no events in it; not overwriting the deployed one with nothing.')
  process.exit(1)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(payload)}\n`)

const days = new Map<string, number>()
for (const e of payload.events) {
  const day = e.startAt.slice(0, 10)
  days.set(day, (days.get(day) ?? 0) + 1)
}

console.log(`Wrote ${OUT}`)
console.log(`${payload.events.length} events from ${source}`)
for (const [day, n] of [...days].sort()) console.log(`  ${day}  ${n}`)
console.log('\nCommit and push it: the deployed site serves this file, so nothing reaches')
console.log('attendees until it is deployed — and nothing after it does either, until the next one.')
