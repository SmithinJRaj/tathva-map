import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { eventState } from '../../shared/classify.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { useNow } from './useNow.ts'
import { useSchedule } from './useSchedule.ts'

interface ScheduleData {
  events: ScheduleEvent[]
  now: Date
  stale: boolean
  fetchedAt: number | null
  byPlace: ReadonlyMap<string, ScheduleEvent[]>
  liveVenueIds: ReadonlySet<string>
  eventVenueIds: ReadonlySet<string>
}

const ScheduleContext = createContext<ScheduleData | null>(null)

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const { events, fetchedAt, stale } = useSchedule()
  const now = useNow()
  const value = useMemo<ScheduleData>(() => {
    const byPlace = new Map<string, ScheduleEvent[]>()
    const liveVenueIds = new Set<string>()
    const eventVenueIds = new Set<string>()
    for (const e of events) {
      const list = byPlace.get(e.placeId)
      if (list) list.push(e)
      else byPlace.set(e.placeId, [e])
      const state = eventState(e, now)
      if (state === 'live') {
        liveVenueIds.add(e.placeId)
        eventVenueIds.add(e.placeId)
      } else if (state === 'upcoming') {
        eventVenueIds.add(e.placeId)
      }
    }
    return { events, now, stale, fetchedAt, byPlace, liveVenueIds, eventVenueIds }
  }, [events, now, stale, fetchedAt])
  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useScheduleData(): ScheduleData {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useScheduleData must be used inside ScheduleProvider')
  return ctx
}
