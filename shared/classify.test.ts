import { expect, test } from 'vitest'
import { classify, eventState, timeShift } from './classify.ts'
import { formatIstDay, formatIstTime, istDateKey } from './ist.ts'
import type { ScheduleEvent } from './schedule.ts'

// IST time on 2027-02-06 -> UTC ISO
const T = (hhmm: string) => new Date(`2027-02-06T${hhmm}:00+05:30`).toISOString()

let n = 0
function ev(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  n += 1
  return {
    id: `e${n}`,
    title: 'Event',
    description: null,
    category: 'workshop',
    placeId: 'p',
    room: null,
    startAt: T('14:00'),
    endAt: T('16:00'),
    originalStartAt: null,
    status: 'scheduled',
    note: null,
    updatedAt: T('09:00'),
    updatedBy: 'admin',
    ...overrides,
  }
}

const now = new Date('2027-02-06T09:00:00Z') // 14:30 IST

test('formats in IST', () => {
  expect(formatIstTime('2027-02-06T08:30:00.000Z')).toBe('14:00')
  expect(istDateKey('2027-02-06T19:00:00.000Z')).toBe('2027-02-07')
  expect(formatIstDay('2027-02-06')).toBe('Sat 6 Feb')
})

test('eventState', () => {
  const liveEv = ev({ startAt: T('14:00'), endAt: T('16:00') })
  const laterEv = ev({ startAt: T('16:00'), endAt: T('17:00') })
  const pastEv = ev({ startAt: T('10:00'), endAt: T('11:00') })
  expect(eventState(liveEv, now)).toBe('live')
  expect(eventState(laterEv, now)).toBe('upcoming')
  expect(eventState(pastEv, now)).toBe('ended')
  expect(eventState({ ...liveEv, status: 'cancelled' }, now)).toBe('cancelled')
  expect(eventState(ev({ startAt: now.toISOString() }), now)).toBe('live')
  expect(eventState(ev({ endAt: now.toISOString(), startAt: T('10:00') }), now)).toBe('ended')
})

test('event crossing IST midnight is grouped by start day and live after midnight', () => {
  const e = ev({ startAt: '2027-02-06T18:00:00.000Z', endAt: '2027-02-06T19:30:00.000Z' })
  expect(classify([e], new Date('2027-02-06T12:00:00Z')).upcomingByDay[0].dateKey).toBe('2027-02-06')
  expect(classify([e], new Date('2027-02-06T19:00:00Z')).live).toEqual([e])
})

test('upcoming grouped by day ascending, sorted by start; live sorted by end', () => {
  const d7 = ev({ startAt: '2027-02-07T04:30:00.000Z', endAt: '2027-02-07T05:30:00.000Z' }) // 7 Feb 10:00
  const a18 = ev({ startAt: T('18:00'), endAt: T('19:00') })
  const a16 = ev({ startAt: T('16:00'), endAt: T('17:00') })
  const liveLate = ev({ startAt: T('14:00'), endAt: T('15:30') })
  const liveEarly = ev({ startAt: T('14:10'), endAt: T('15:00') })
  const r = classify([d7, a18, a16, liveLate, liveEarly], now)
  expect(r.upcomingByDay.map((d) => d.dateKey)).toEqual(['2027-02-06', '2027-02-07'])
  expect(r.upcomingByDay[0].events).toEqual([a16, a18])
  expect(r.upcomingByDay[1].events).toEqual([d7])
  expect(r.live).toEqual([liveEarly, liveLate])
})

test('cancelled event: never live; listed under its day until its end; dropped after', () => {
  const c = ev({ startAt: T('14:00'), endAt: T('16:00'), status: 'cancelled' })
  const mid = classify([c], now)
  expect(mid.live).toEqual([])
  expect(mid.upcomingByDay).toEqual([{ dateKey: '2027-02-06', events: [c] }])
  const after = classify([c], new Date(T('16:30')))
  expect(after.live).toEqual([])
  expect(after.upcomingByDay).toEqual([])
})

test('timeShift', () => {
  expect(timeShift(ev({ originalStartAt: null }))).toBeNull()
  expect(timeShift(ev({ startAt: T('14:30'), originalStartAt: T('14:00') }))).toBe('delayed')
  expect(timeShift(ev({ startAt: T('13:45'), originalStartAt: T('14:00') }))).toBe('early')
})
