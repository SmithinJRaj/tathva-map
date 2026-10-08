import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { matchesQuery } from './search.ts'

const event: ScheduleEvent = {
  id: 'e',
  title: 'Tech Quiz Prelims',
  description: 'Teams of two',
  category: 'competition',
  placeId: 'nlhc',
  room: 'Hall 2',
  startAt: '2026-02-06T10:00:00.000Z',
  endAt: '2026-02-06T11:00:00.000Z',
  originalStartAt: null,
  status: 'scheduled',
  note: 'Bring ID cards',
  updatedAt: '2026-02-06T09:00:00.000Z',
  updatedBy: 'admin',
}

test('an empty or blank query matches everything', () => {
  expect(matchesQuery(event, '')).toBe(true)
  expect(matchesQuery(event, '   ')).toBe(true)
})

test('matches title, venue name, room, category and note, ignoring case', () => {
  expect(matchesQuery(event, 'quiz')).toBe(true)
  expect(matchesQuery(event, 'NLHC')).toBe(true)
  expect(matchesQuery(event, 'hall 2')).toBe(true)
  expect(matchesQuery(event, 'competition')).toBe(true)
  expect(matchesQuery(event, 'id cards')).toBe(true)
})

test('every word must match somewhere, in any order and spacing', () => {
  expect(matchesQuery(event, '  prelims   nlhc ')).toBe(true)
  expect(matchesQuery(event, 'quiz robowars')).toBe(false)
})

test('does not search the description', () => {
  expect(matchesQuery(event, 'teams')).toBe(false)
})
