import type { ScheduleResponse } from '../../shared/schedule.ts'

const KEY = 'tathva-map:schedule'

export interface CachedSchedule {
  data: ScheduleResponse
  etag: string | null
  fetchedAt: number
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadCachedSchedule(storage: Storage | null = defaultStorage()): CachedSchedule | null {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedSchedule> | null
    const data = parsed?.data
    if (!data || typeof data.version !== 'number' || !Array.isArray(data.events)) return null
    if (typeof parsed.fetchedAt !== 'number') return null
    return { data, etag: typeof parsed.etag === 'string' ? parsed.etag : null, fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}

export function saveCachedSchedule(c: CachedSchedule, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(c))
  } catch {
    // storage full or unavailable: the cache is only an offline nicety
  }
}
