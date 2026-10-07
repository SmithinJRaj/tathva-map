import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { dayLabel } from './festDays.ts'
import { venueSections } from './venueSections.ts'

// 2026-02-06 15:30 IST
const now = new Date('2026-02-06T10:00:00.000Z')

function ev(id: string, startAt: string, endAt: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id,
    title: id,
    description: null,
    category: 'workshop',
    placeId: 'elhc',
    room: null,
    startAt,
    endAt,
    originalStartAt: null,
    status: 'scheduled',
    note: null,
    updatedAt: startAt,
    updatedBy: 'admin',
    ...over,
  }
}

test('groups into live, later today and later days; drops ended; keeps unknown venues', () => {
  const events = [
    ev('ended', '2026-02-06T04:00:00.000Z', '2026-02-06T05:00:00.000Z'),
    ev('tomorrow-b', '2026-02-07T09:00:00.000Z', '2026-02-07T10:00:00.000Z'),
    ev('live', '2026-02-06T09:30:00.000Z', '2026-02-06T11:00:00.000Z'),
    ev('later', '2026-02-06T12:00:00.000Z', '2026-02-06T13:00:00.000Z', { placeId: 'nowhere' }),
    ev('tomorrow-a', '2026-02-07T05:00:00.000Z', '2026-02-07T06:00:00.000Z'),
  ]
  const sections = venueSections(events, now)
  expect(sections.map((s) => s.title)).toEqual(['Live now', 'Later today', dayLabel('2026-02-07', '2026-02-06')])
  expect(sections[0].events.map((e) => e.id)).toEqual(['live'])
  expect(sections[1].events.map((e) => e.id)).toEqual(['later'])
  expect(sections[2].events.map((e) => e.id)).toEqual(['tomorrow-a', 'tomorrow-b'])
})

test('omits empty sections', () => {
  expect(venueSections([], now)).toEqual([])
})
