import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { eventState } from '../../shared/classify.ts'
import { knownPlaces } from '../../shared/places.ts'
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
  const warned = useRef(new Set<string>())
  // A venue the map does not know can never be shown; say so once per id (spec §8).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    for (const e of events) {
      if (knownPlaces.has(e.placeId) || warned.current.has(e.placeId)) continue
      warned.current.add(e.placeId)
      console.warn(`schedule: event "${e.title}" uses unknown placeId "${e.placeId}"`)
    }
  }, [events])
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
