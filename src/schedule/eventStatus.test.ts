import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { eventStatus, SOON_MINUTES } from './eventStatus.ts'

// 2026-02-06 15:30 IST
const now = new Date('2026-02-06T10:00:00.000Z')
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()

function ev(over: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 'e',
    title: 'Robowars',
    description: null,
    category: 'competition',
    placeId: 'open_air_theatre',
    room: null,
    startAt: at(30),
    endAt: at(90),
    originalStartAt: null,
    status: 'scheduled',
    note: null,
    updatedAt: at(-60),
    updatedBy: 'admin',
    ...over,
  }
}

test('starting soon is the next 15 minutes, inclusive', () => {
  expect(SOON_MINUTES).toBe(15)
  expect(eventStatus(ev({ startAt: at(15) }), now)).toEqual({ label: 'in 15 min', tone: 'soon' })
  expect(eventStatus(ev({ startAt: at(14.5) }), now)).toEqual({ label: 'in 15 min', tone: 'soon' })
  expect(eventStatus(ev({ startAt: at(16) }), now)).toBeNull()
})

test('starting this minute still reads as soon, not live', () => {
  expect(eventStatus(ev({ startAt: at(0.5) }), now)).toEqual({ label: 'in 1 min', tone: 'soon' })
})

test('soon wins over delayed; the struck-through time still shows the delay', () => {
  expect(eventStatus(ev({ startAt: at(10), originalStartAt: at(-5) }), now)?.tone).toBe('soon')
  expect(eventStatus(ev({ startAt: at(40), originalStartAt: at(10) }), now)?.tone).toBe('delayed')
})

test('a cancelled event is never soon', () => {
  expect(eventStatus(ev({ startAt: at(5), status: 'cancelled' }), now)).toEqual({ label: 'CANCELLED', tone: 'cancelled' })
})

test('live events show the time left', () => {
  expect(eventStatus(ev({ startAt: at(-10), endAt: at(20) }), now)).toEqual({ label: '20 min left', tone: 'live' })
})
