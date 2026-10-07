import { parse } from 'csv-parse/sync'
import { fieldErrors, eventInputSchema } from '../../shared/schedule.ts'
import type { EventInput } from '../../shared/schedule.ts'
import { knownPlaces } from '../../shared/places.ts'
import { COLUMN_MAP, VENUE_ALIASES } from './columns.ts'
import { matchVenue } from './venues.ts'

export interface ParseResult {
  ok: { line: number; input: EventInput }[]
  errors: { line: number; message: string }[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function parseScheduleCsv(text: string): ParseResult {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    info: true,
  }) as { record: Record<string, string | undefined>; info: { lines: number } }[]

  const result: ParseResult = { ok: [], errors: [] }
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

    const date = cell('date')
    const badTime = [date && DATE.test(date) ? null : date, ...[cell('start'), cell('end')].map((t) => (TIME.test(t) ? null : t))]
      .find((v) => v !== null)
    if (badTime !== undefined) {
      fail(`Bad time "${badTime}"`)
      continue
    }

    const parsed = eventInputSchema.safeParse({
      title: cell('title'),
      description: cell('description') || null,
      category: cell('category').toLowerCase() || 'other',
      placeId: venue.placeId,
      room: venue.room,
      startAt: `${date}T${cell('start')}:00+05:30`,
      endAt: `${date}T${cell('end')}:00+05:30`,
      note: cell('note') || null,
    })
    if (parsed.success) result.ok.push({ line, input: parsed.data })
    else fail(Object.values(fieldErrors(parsed.error)).join('; '))
  }
  return result
}
