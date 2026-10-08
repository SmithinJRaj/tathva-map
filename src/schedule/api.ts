import type { ScheduleResponse } from '../../shared/schedule.ts'

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export type FetchResult =
  | { status: 'ok'; data: ScheduleResponse; etag: string | null }
  | { status: 'not-modified' }

export async function fetchSchedule(etag: string | null): Promise<FetchResult> {
  const headers: Record<string, string> = {}
  if (etag) headers['If-None-Match'] = etag
  const res = await fetch(`${API_BASE}/schedule`, { headers })
  if (res.status === 304) return { status: 'not-modified' }
  if (!res.ok) throw new Error(`Schedule request failed: ${res.status}`)
  const data = (await res.json()) as ScheduleResponse
  return { status: 'ok', data, etag: res.headers.get('ETag') }
}
