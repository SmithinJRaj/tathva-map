import { parse } from 'csv-parse/sync'
import { fieldErrors, eventInputSchema } from '../../shared/schedule.ts'
import type { EventInput } from '../../shared/schedule.ts'
import { istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { COLUMN_MAP, VENUE_ALIASES } from './columns.ts'
import { matchVenue } from './venues.ts'

export interface ParseResult {
  ok: { line: number; input: EventInput }[]
  errors: { line: number; message: string }[]
}

export interface ParseOptions {
  /**
   * The date for rows that carry no Date cell. The events sheet keeps the date in the tab
   * name rather than in the rows, so one export per day arrives dated only by its filename.
   */
  defaultDate?: string
  /**
   * Expand every row across these IST date keys, ignoring any Date cell. This is the
   * "everyday events" tab, where one row means one event on each day of the fest. The
   * expansions share a title and differ by day, which is exactly what the store matches on,
   * so they stay distinct and keep their ids across re-imports.
   */
  everyDay?: readonly string[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function parseScheduleCsv(text: string, options: ParseOptions = {}): ParseResult {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    info: true,
  }) as { record: Record<string, string | undefined>; info: { lines: number } }[]

  const result: ParseResult = { ok: [], errors: [] }
  const seen = new Map<string, number>()
  for (const { record, info } of records) {
    if (Object.values(record).every((v) => !v)) continue
    const line = info.lines
    const cell = (key: keyof typeof COLUMN_MAP) => record[COLUMN_MAP[key]] ?? ''
    const fail = (message: string) => result.errors.push({ line, message })

    const venueText = cell('venue')
    const venue = matchVenue(venueText, knownPlaces, VENUE_ALIASES)
    if (!venue) {
      fail(`Unknown venue "${venueText}"`)
      continue
    }

    // One row becomes one event per date: its own, the file's, or every fest day.
    const dates = options.everyDay?.length ? options.everyDay : [cell('date') || options.defaultDate || '']

    const times = [cell('start'), cell('end')]
    const badTime = times.find((t) => !TIME.test(t))
    if (badTime !== undefined) {
      fail(`Bad time "${badTime}"`)
      continue
    }
    const badDate = dates.find((d) => !DATE.test(d))
    if (badDate !== undefined) {
      fail(badDate ? `Bad date "${badDate}"` : 'No date: the sheet has none, and none was given')
      continue
    }

    for (const date of dates) {
      const parsed = eventInputSchema.safeParse({
        title: cell('title'),
        description: cell('description') || null,
        category: cell('category').toLowerCase() || 'other',
        placeId: venue.placeId,
        room: venue.room,
        startAt: `${date}T${times[0]}:00+05:30`,
        endAt: `${date}T${times[1]}:00+05:30`,
        note: cell('note') || null,
      })
      if (!parsed.success) {
        fail(Object.values(fieldErrors(parsed.error)).join('; '))
        continue
      }
      // Rows are matched to stored events by title + IST day, so a repeat would overwrite the first.
      const key = `${parsed.data.title}\n${istDateKey(parsed.data.startAt)}`
      const first = seen.get(key)
      if (first !== undefined) {
        fail(`Duplicate of line ${first} (same title and day)`)
        continue
      }
      seen.set(key, line)
      result.ok.push({ line, input: parsed.data })
    }
  }
  return result
}
