import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { fetchSchedule } from './api.ts'
import { loadCachedSchedule, saveCachedSchedule, type CachedSchedule } from './cache.ts'
import { useNow } from './useNow.ts'

const POLL_MS = 30_000
const STALE_MS = 2 * 60_000
const NO_EVENTS: ScheduleEvent[] = []

export function useSchedule(): { events: ScheduleEvent[]; fetchedAt: number | null; stale: boolean } {
  const [cached, setCached] = useState<CachedSchedule | null>(() => loadCachedSchedule())
  const etagRef = useRef<string | null>(cached?.etag ?? null)
  const now = useNow()

  const refresh = useCallback(async () => {
    try {
      const res = await fetchSchedule(etagRef.current)
      if (res.status === 'ok') {
        etagRef.current = res.etag
        const next = { data: res.data, etag: res.etag, fetchedAt: Date.now() }
        saveCachedSchedule(next)
        setCached(next)
      } else {
        setCached((prev) => (prev ? { ...prev, fetchedAt: Date.now() } : prev))
      }
    } catch {
      // keep showing the previous data
    }
  }, [])

  useEffect(() => {
    let timer: number | undefined
    const stop = () => {
      window.clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      stop()
      timer = window.setInterval(() => void refresh(), POLL_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === 'visible') {
      void refresh()
      start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  const fetchedAt = cached?.fetchedAt ?? null
  return {
    events: cached?.data.events ?? NO_EVENTS,
    fetchedAt,
    stale: fetchedAt === null || now.getTime() - fetchedAt > STALE_MS,
  }
}
