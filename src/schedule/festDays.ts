import { formatIstDay } from '../../shared/ist.ts'

// IST date key -> fest day label. Confirmed by the user and corroborated by the dates
// embedded in the events sheet ("Oct 9th 3pm to 11:30pm").
export const FEST_DAYS: Record<string, string> = {
  '2026-10-09': 'Day 1',
  '2026-10-10': 'Day 2',
  '2026-10-11': 'Day 3',
}

export function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today'
  const day = formatIstDay(dateKey)
  const fest = FEST_DAYS[dateKey]
  return fest ? `${fest} · ${day}` : day
}
