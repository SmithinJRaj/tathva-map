/**
 * Reads the events sheet's free-text `Time` column.
 *
 * One column has to become a start and an end, and the sheet writes it sixteen different
 * ways. The rule throughout is that an unambiguous range is parsed and **nothing else is
 * guessed**: no default durations, no inferred AM, no invented end times. A row this cannot
 * read is reported and added in the admin GUI by someone who knows what it meant, which is
 * always better than a confident wrong time on a public map.
 */

export interface TimeRange {
  /** 24-hour HH:mm, IST. */
  start: string
  end: string
}

export type TimeParse =
  | { kind: 'ranges'; ranges: TimeRange[] }
  /** Readable, but not something a start and an end can be taken from. */
  | { kind: 'unparsed'; reason: string }

/** A month name means the cell carries its own date, which the Date column already owns. */
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i

/** "(tentative)", "(TBD)" — a qualifier on the time, not part of it. */
const PARENTHETICAL = /\([^)]*\)/g

/** Both halves of "9am to 12pm and 2pm to 5pm". */
const SESSION_SPLIT = /\s+and\s+|\s*&\s*/i

const RANGE_SEPARATOR = /\s*(?:-|–|—|to|till|until)\s*/i

/** "9am", "2 PM", "5 P M", "11:30pm", "18:00". Spaces inside "P M" are tolerated. */
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\s*\.?\s*m\s*\.?)?$/i

const hasMeridiem = (text: string) => /[ap]\s*\.?\s*m\s*\.?\s*$/i.test(text.trim())

function toMinutes(text: string): number | null {
  const m = CLOCK.exec(text.trim())
  if (!m) return null
  let hour = Number(m[1])
  const minute = m[2] ? Number(m[2]) : 0
  const meridiem = m[3]?.toLowerCase()
  if (minute > 59) return null

  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'a') hour = hour === 12 ? 0 : hour
    else hour = hour === 12 ? 12 : hour + 12
  } else if (hour > 23) {
    return null
  }
  return hour * 60 + minute
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function parseTimeRange(text: string): TimeParse {
  const cleaned = text.replace(PARENTHETICAL, ' ').trim()
  if (!cleaned) return { kind: 'unparsed', reason: 'no time given' }
  if (MONTH.test(cleaned)) {
    return { kind: 'unparsed', reason: `names a date ("${text.trim()}"), which the sheet keeps in the tab` }
  }

  const ranges: TimeRange[] = []
  for (const session of cleaned.split(SESSION_SPLIT)) {
    const parts = session.split(RANGE_SEPARATOR).filter((p) => p.trim())
    if (parts.length !== 2) {
      // One clock face is a start with no end, which is not a range however clear it reads.
      const single = parts.length === 1 && toMinutes(parts[0]) !== null
      return {
        kind: 'unparsed',
        reason: single
          ? `only a start time ("${session.trim()}"), with no end`
          : `could not read "${session.trim()}" as a time range`,
      }
    }
    // "2 to 4pm" means 14:00, not 02:00 — but 02:00 to 16:00 is a perfectly valid range, so
    // nothing downstream would catch the twelve-hour error. A bare hour beside one that
    // names am or pm is genuinely ambiguous, and the only safe reading is to refuse it.
    // Either both ends say, or neither does and it is read as a 24-hour clock.
    if (hasMeridiem(parts[0]) !== hasMeridiem(parts[1])) {
      return {
        kind: 'unparsed',
        reason: `"${session.trim()}" says am/pm on only one end, so the other could be either`,
      }
    }

    const start = toMinutes(parts[0])
    const end = toMinutes(parts[1])
    if (start === null || end === null) {
      return { kind: 'unparsed', reason: `could not read "${session.trim()}" as a time range` }
    }
    // An end before the start is left to fail validation rather than "corrected" here: the
    // three rows reading "11:00PM to 12:30PM" mean 11:00 AM, and silently deciding that for
    // them would be a twelve-hour guess.
    ranges.push({ start: hhmm(start), end: hhmm(end) })
  }
  return { kind: 'ranges', ranges }
}
