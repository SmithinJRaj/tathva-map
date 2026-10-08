import { readFileSync } from 'node:fs'
import { istDateKey, formatIstTime } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { openDb } from '../db.ts'
import { createStore } from '../store.ts'
import { commitRows } from '../import/commit.ts'
import { parseScheduleCsv } from '../import/parse.ts'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Usage: npm run import-schedule -- <file.csv> [--commit]')
  process.exit(1)
}

const dbPath = process.env.DB_PATH
if (!dbPath) {
  console.error('DB_PATH is not set')
  process.exit(1)
}

const { ok, errors } = parseScheduleCsv(readFileSync(file, 'utf8'))

for (const { line, input } of ok) {
  const place = knownPlaces.get(input.placeId)
  const room = input.room ? ` (${input.room})` : ''
  console.log(
    `${line} · ${istDateKey(input.startAt)} ${formatIstTime(input.startAt)}–${formatIstTime(input.endAt)} · ${input.title} @ ${place}${room}`,
  )
}
for (const { line, message } of errors) console.error(`${line} · ERROR ${message}`)

if (!commit) {
  console.log(`Dry run: ${ok.length} ok, ${errors.length} errors. Nothing written; pass --commit to import.`)
} else if (errors.length > 0) {
  console.error(`Not importing: ${errors.length} errors`)
  process.exit(1)
} else {
  const db = openDb(dbPath)
  try {
    const { created, updated } = commitRows(db, createStore(db), ok)
    console.log(`Created ${created}, updated ${updated}`)
  } catch (err) {
    console.error(`Import failed, nothing was written: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
