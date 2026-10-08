import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { placesById } from '../data/campus'
import { liveDotPlaces } from './liveDots.ts'
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

test('one dot per live venue, at that venue, with an indoor room drawn on its building', () => {
  const { liveVenueIds } = indexByVenue(
    [
      ev('rust', 'elhc_301', '2026-02-06T09:30:00.000Z', '2026-02-06T11:00:00.000Z'),
      ev('robowars', 'open_air_theatre', '2026-02-06T09:00:00.000Z', '2026-02-06T10:30:00.000Z'),
      ev('second', 'open_air_theatre', '2026-02-06T09:45:00.000Z', '2026-02-06T10:15:00.000Z'),
      ev('later', 'nlhc', '2026-02-06T12:00:00.000Z', '2026-02-06T13:00:00.000Z'),
    ],
    now,
  )
  const dots = liveDotPlaces(liveVenueIds)
  expect(dots.map((d) => d.id)).toEqual(['elhc', 'open_air_theatre'])
  expect(dots[0].position).toEqual(placesById.get('elhc')!.position)
})

test('venues the map does not know get no dot', () => {
  expect(liveDotPlaces(new Set(['nowhere']))).toEqual([])
})
