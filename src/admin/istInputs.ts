import { formatIstTime, istDateKey } from '../../shared/ist.ts'

/** IST offset is fixed (no DST), so conversion is plain arithmetic whatever the device zone. */
const IST_OFFSET = '+05:30'

/** Splits a UTC instant into the IST values a date input and a time input expect. */
export function toIstInputs(iso: string): { date: string; time: string } {
  return { date: istDateKey(iso), time: formatIstTime(iso) }
}

/** IST date ('YYYY-MM-DD') and time ('HH:mm') to a UTC ISO instant, or null if malformed. */
export function fromIstInputs(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const d = new Date(`${date}T${time}:00${IST_OFFSET}`)
  if (Number.isNaN(d.getTime())) return null
  // Date silently rolls 02-30 over to 03-02; reject anything that doesn't round-trip.
  return istDateKey(d) === date ? d.toISOString() : null
}
