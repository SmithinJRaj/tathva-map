import { readFileSync } from 'node:fs'
import { istDateKey, formatIstTime } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { openDb } from '../db.ts'
import { createStore } from '../store.ts'
import { commitRows } from '../import/commit.ts'
import { parseScheduleCsv } from '../import/parse.ts'
import { FEST_DAYS } from '../../src/schedule/festDays.ts'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const file = args.find((a) => !a.startsWith('--'))
const dateFlag = args.find((a) => a.startsWith('--date='))?.slice('--date='.length)
const everyDay = args.includes('--every-day')
if (!file) {
  console.error(
    'Usage: npm run import-schedule -- <file.csv> [--date=YYYY-MM-DD] [--every-day] [--commit]\n' +
      '\n' +
      "  --date       the date for rows with no Date cell. The sheet's day tabs keep the date\n" +
      '               in the tab name, so each exported tab needs it supplied here.\n' +
      '  --every-day  one event per fest day for every row, for the "everyday events" tab.\n' +
      '               Reads the dates from FEST_DAYS in src/schedule/festDays.ts.',
  )
  process.exit(1)
}
if (dateFlag && !/^\d{4}-\d{2}-\d{2}$/.test(dateFlag)) {
  console.error(`--date must be YYYY-MM-DD, got "${dateFlag}"`)
  process.exit(1)
}

const festDates = Object.keys(FEST_DAYS).sort()
if (everyDay && festDates.length === 0) {
  console.error(
    'FEST_DAYS in src/schedule/festDays.ts is empty, so there are no days to repeat across.\n' +
      "Fill in the fest dates first — they are also what labels a day as \"Day 1\" in the app.",
  )
  process.exit(1)
}
if (everyDay) console.log(`Repeating every row across ${festDates.join(', ')}\n`)

const dbPath = process.env.DB_PATH
if (!dbPath) {
  console.error('DB_PATH is not set')
  process.exit(1)
}

const { ok, errors } = parseScheduleCsv(readFileSync(file, 'utf8'), {
  defaultDate: dateFlag,
  everyDay: everyDay ? festDates : undefined,
})

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
    const { created, updated, preserved } = commitRows(db, createStore(db), ok)
    console.log(`Created ${created}, updated ${updated}`)
    if (preserved > 0) {
      console.log(
        `Left ${preserved} alone: moved during the fest, so the sheet's times and venues` +
          ' were not put back. Edit those in /admin.',
      )
    }
  } catch (err) {
    console.error(`Import failed, nothing was written: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
