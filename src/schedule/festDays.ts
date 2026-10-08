import { formatIstDay } from '../../shared/ist.ts'

// IST date key -> fest day label. Fill in the real fest dates, e.g. '2026-02-06': 'Day 1'.
export const FEST_DAYS: Record<string, string> = {}

export function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today'
  const day = formatIstDay(dateKey)
  const fest = FEST_DAYS[dateKey]
  return fest ? `${fest} · ${day}` : day
}
