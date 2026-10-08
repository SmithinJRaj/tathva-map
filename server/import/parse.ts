import { parse } from 'csv-parse/sync'
import { fieldErrors, eventInputSchema } from '../../shared/schedule.ts'
import type { EventInput } from '../../shared/schedule.ts'
import { istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { COLUMN_MAP, SECTION_CATEGORIES, VENUE_ALIASES, VENUE_ROOMS } from './columns.ts'
import { parseTimeRange } from './times.ts'
import type { ColumnField } from './columns.ts'
import { matchVenue, suggestVenue } from './venues.ts'

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

/**
 * Which column holds each field, by header name.
 *
 * The sheet's tabs open with a title row ("DAY 1") above the headers, so the header is not
 * always the first line. Rather than hard-code an offset, find the first row that names the
 * columns we need; anything above it is decoration.
 */
function findHeader(rows: string[][]): { index: number; columns: Partial<Record<ColumnField, number>> } | null {
  for (const [index, row] of rows.entries()) {
    const columns: Partial<Record<ColumnField, number>> = {}
    for (const [field, names] of Object.entries(COLUMN_MAP) as [ColumnField, readonly string[]][]) {
      const at = row.findIndex((cell) => names.includes(cell.trim().toLowerCase()))
      if (at !== -1) columns[field] = at
    }
    // A title and a venue are the least a row needs to be an event at all.
    if (columns.title !== undefined && columns.venue !== undefined) return { index, columns }
  }
  return null
}

export function parseScheduleCsv(text: string, options: ParseOptions = {}): ParseResult {
  const rows = parse(text, {
    columns: false,
    skip_empty_lines: false,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as string[][]

  const result: ParseResult = { ok: [], errors: [] }
  const header = findHeader(rows)
  if (!header) {
    result.errors.push({ line: 1, message: 'No header row naming a title and a venue column' })
    return result
  }

  const seen = new Map<string, number>()
  // Set by a section header row ("EXPO:") and applied until the next one, since the sheet
  // groups rows under headings instead of carrying a Category column.
  let section: string | null = null

  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i]
    const line = i + 1
    const at = (key: ColumnField) => {
      const index = header.columns[key]
      return index === undefined ? '' : (row[index] ?? '').trim()
    }
    const fail = (message: string) => result.errors.push({ line, message })

    if (row.every((cell) => !cell.trim())) continue

    // "EXPO:" with nothing else on the row is a heading, not an event.
    const title = at('title')
    const isHeading = title.endsWith(':') && row.every((cell, index) => index === header.columns.title || !cell.trim())
    if (isHeading) {
      section = SECTION_CATEGORIES[title.slice(0, -1).trim().toLowerCase()] ?? null
      continue
    }
    if (!title) continue

    const cell = (key: ColumnField) => {
      if (key === 'category') return at('category') || section || ''
      return at(key)
    }

    const venueText = cell('venue')
    if (!venueText) {
      fail('No venue given')
      continue
    }
    const venue = matchVenue(venueText, knownPlaces, VENUE_ALIASES, VENUE_ROOMS)
    if (!venue) {
      // Name the near miss: the matcher refuses an uncertain guess, so the human needs to
      // see what it was refusing before they can correct the sheet.
      const near = suggestVenue(venueText, knownPlaces)
      fail(`Unknown venue "${venueText}"${near ? ` — did you mean "${near}"?` : ''}`)
      continue
    }

    // One row becomes one event per date: its own, the file's, or every fest day.
    const dates = options.everyDay?.length ? options.everyDay : [cell('date') || options.defaultDate || '']

    let times: [string, string]
    if (cell('start') || cell('end')) {
      times = [cell('start'), cell('end')]
      const badTime = times.find((t) => !TIME.test(t))
      if (badTime !== undefined) {
        fail(`Bad time "${badTime}"`)
        continue
      }
    } else {
      const parsed = parseTimeRange(cell('time'))
      if (parsed.kind === 'unparsed') {
        fail(`No usable time: ${parsed.reason}. Add it in /admin.`)
        continue
      }
      if (parsed.ranges.length > 1) {
        // Two sessions share a title and a day, which is how events are identified here, so
        // the second would overwrite the first on the next import rather than sit beside it.
        fail(
          `Two sessions in one row (${parsed.ranges
            .map((r) => `${r.start}-${r.end}`)
            .join(', ')}). Split them into two rows with distinct titles, or add the second in /admin.`,
        )
        continue
      }
      times = [parsed.ranges[0].start, parsed.ranges[0].end]
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
