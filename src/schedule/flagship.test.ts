import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { flagshipVenueOf, isFlagshipEvent } from './flagship'
import { indexByVenue } from './venueIndex'

const ev = (title: string, placeId: string): ScheduleEvent => ({
  id: title,
  title,
  description: null,
  category: 'competition',
  placeId,
  room: null,
  startAt: '2026-10-09T09:00:00.000Z',
  endAt: '2026-10-09T11:00:00.000Z',
  originalStartAt: null,
  status: 'scheduled',
  note: null,
  updatedAt: '2026-10-09T00:00:00.000Z',
  updatedBy: 'import',
})

test('an event is claimed by the venue that carries its name', () => {
  expect(flagshipVenueOf(ev('Robowars', 'open_air_theatre'))).toBe('robowars')
  expect(flagshipVenueOf(ev('Tathack', 'it_lab_complex'))).toBe('tathack')
})

test('numbered sessions come along, because the match is on the start of the title', () => {
  expect(flagshipVenueOf(ev('Workshops (Session 1)', 'east_campus_lecture_hall_complex_eclhc'))).toBe('workshops')
  expect(flagshipVenueOf(ev('Workshops (Session 2)', 'east_campus_lecture_hall_complex_eclhc'))).toBe('workshops')
})

test('the host has to agree: the same name elsewhere is not this venue', () => {
  // Filing it anyway would put a pin on the wrong side of campus.
  expect(flagshipVenueOf(ev('Robowars', 'elhc'))).toBeNull()
  expect(flagshipVenueOf(ev('Dead End', 'open_air_theatre'))).toBeNull()
})

test('a flagship event is marked wherever it is listed', () => {
  expect(isFlagshipEvent(ev('Robowars', 'open_air_theatre'))).toBe(true)
  expect(isFlagshipEvent(ev('Flashmob', 'informals_stage'))).toBe(true)
  expect(isFlagshipEvent(ev('Dead End', 'elhc'))).toBe(false)
})

test('it lists on both pins: the one it is, and the one people look for', () => {
  const robowars = ev('Robowars', 'open_air_theatre')
  const { byPlace, eventVenueIds } = indexByVenue([robowars], new Date('2026-10-09T10:00:00.000Z'))
  expect(byPlace.get('robowars')).toEqual([robowars])
  expect(byPlace.get('open_air_theatre')).toEqual([robowars])
  expect(eventVenueIds.has('robowars')).toBe(true)
  expect(eventVenueIds.has('open_air_theatre')).toBe(true)
})

test('an ordinary event is listed once', () => {
  const quiz = ev('Dead End', 'elhc')
  const { byPlace } = indexByVenue([quiz], new Date('2026-10-09T10:00:00.000Z'))
  expect([...byPlace.keys()]).toEqual(['elhc'])
})
