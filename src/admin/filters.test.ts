import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { filterEvents, type AdminFilters } from './filters.ts'

const base: ScheduleEvent = {
  id: 'x', title: 'X', description: null, category: 'talk', placeId: 'elhc', room: null,
  startAt: '2027-02-06T08:00:00.000Z', endAt: '2027-02-06T09:00:00.000Z', originalStartAt: null,
  status: 'scheduled', note: null, updatedAt: '2027-02-01T00:00:00.000Z', updatedBy: 'a',
}
const ev = (o: Partial<ScheduleEvent>): ScheduleEvent => ({ ...base, ...o })

const ended = ev({ id: 'ended', title: 'Opening Ceremony' })
const live = ev({ id: 'live', title: 'Robowars Finals', startAt: '2027-02-06T11:00:00.000Z', endAt: '2027-02-06T13:00:00.000Z', placeId: 'nac' })
const next = ev({ id: 'next', title: 'Hack Night', startAt: '2027-02-07T11:00:00.000Z', endAt: '2027-02-07T13:00:00.000Z' })
const cancelled = ev({ id: 'cx', title: 'Quiz', status: 'cancelled', startAt: '2027-02-07T14:00:00.000Z', endAt: '2027-02-07T15:00:00.000Z' })
const all = [ended, live, next, cancelled]
const now = new Date('2027-02-06T12:00:00.000Z')
const none: AdminFilters = { day: null, placeId: null, state: null, search: '' }
const ids = (f: Partial<AdminFilters>) => filterEvents(all, { ...none, ...f }, now).map((e) => e.id)

test('no filters keeps everything, ended events included', () => {
  expect(ids({})).toEqual(['ended', 'live', 'next', 'cx'])
})

test('each filter alone', () => {
  expect(ids({ day: '2027-02-07' })).toEqual(['next', 'cx'])
  expect(ids({ placeId: 'nac' })).toEqual(['live'])
  expect(ids({ state: 'ended' })).toEqual(['ended'])
  expect(ids({ state: 'live' })).toEqual(['live'])
  expect(ids({ state: 'cancelled' })).toEqual(['cx'])
  expect(ids({ search: 'hack' })).toEqual(['next'])
})

test('search is case-insensitive and trims', () => {
  expect(ids({ search: '  ROBOWARS ' })).toEqual(['live'])
})

test('filters combine', () => {
  expect(ids({ day: '2027-02-07', state: 'upcoming' })).toEqual(['next'])
  expect(ids({ day: '2027-02-06', placeId: 'elhc' })).toEqual(['ended'])
  expect(ids({ day: '2027-02-07', search: 'ro' })).toEqual([])
})
