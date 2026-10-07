import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { hostPlaceId } from '../data/campus'
import { indexByVenue } from './venueIndex.ts'

const now = new Date('2026-02-06T10:00:00.000Z')

function ev(id: string, placeId: string, startAt: string, endAt: string): ScheduleEvent {
  return {
    id,
    title: id,
    description: null,
    category: 'workshop',
    placeId,
    room: null,
    startAt,
    endAt,
    originalStartAt: null,
    status: 'scheduled',
    note: null,
    updatedAt: startAt,
    updatedBy: 'admin',
  }
}

test('hostPlaceId maps an indoor room to its building and leaves other ids alone', () => {
  expect(hostPlaceId('elhc_301')).toBe('elhc')
  expect(hostPlaceId('elhc')).toBe('elhc')
})

test('a live event in an indoor room is grouped under, and lights up, its host building', () => {
  const room = ev('room', 'elhc_301', '2026-02-06T09:00:00.000Z', '2026-02-06T11:00:00.000Z')
  const { byPlace, liveVenueIds, eventVenueIds } = indexByVenue([room], now)
  expect(byPlace.get('elhc')).toEqual([room])
  expect(byPlace.has('elhc_301')).toBe(false)
  expect(liveVenueIds.has('elhc')).toBe(true)
  expect(eventVenueIds.has('elhc')).toBe(true)
})
