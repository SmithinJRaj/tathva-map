const TZ = 'Asia/Kolkata'

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** IST calendar date of an instant, as 'YYYY-MM-DD'. */
export function istDateKey(t: string | Date): string {
  const p = Object.fromEntries(dateParts.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/** IST wall-clock time, 24 h, e.g. '14:30'. */
export function formatIstTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

/** 'Sat 6 Feb' for an IST date key. */
export function formatIstDay(dateKey: string): string {
  const p = Object.fromEntries(
    dayFmt.formatToParts(new Date(`${dateKey}T12:00:00+05:30`)).map((x) => [x.type, x.value]),
  )
  return `${p.weekday} ${p.day} ${p.month}`
}
