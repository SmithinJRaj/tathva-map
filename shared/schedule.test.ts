import { expect, test } from 'vitest'
import { knownPlaces } from './places.ts'
import { delaySchema, eventInputSchema, eventPatchSchema, fieldErrors } from './schedule.ts'

const valid = {
  title: 'Robowars Finals', category: 'competition', placeId: 'elhc',
  startAt: '2027-02-06T14:00:00+05:30', endAt: '2027-02-06T16:00:00+05:30',
}

test('knownPlaces has generated and indoor places', () => {
  expect(knownPlaces.get('elhc')).toBeTruthy()
  expect(knownPlaces.get('elhc_301')).toBe('ELHC 301')
})

test('input normalises times to UTC and defaults optionals to null', () => {
  const out = eventInputSchema.parse(valid)
  expect(out.startAt).toBe('2027-02-06T08:30:00.000Z')
  expect(out.room).toBeNull()
  expect(out.description).toBeNull()
  expect(out.note).toBeNull()
})

test('rejects unknown venue, blank title, end before start, bad category', () => {
  const r = eventInputSchema.safeParse({ ...valid, placeId: 'nowhere', title: '  ', endAt: valid.startAt, category: 'party' })
  expect(r.success).toBe(false)
  expect(fieldErrors(r.error!)).toMatchObject({
    placeId: 'Unknown venue', title: 'Title is required', category: expect.any(String),
  })
  const r2 = eventInputSchema.safeParse({ ...valid, endAt: valid.startAt })
  expect(fieldErrors(r2.error!)).toEqual({ endAt: 'End must be after start' })
})

test('patch requires updatedAt and accepts a subset', () => {
  expect(eventPatchSchema.safeParse({ title: 'X' }).success).toBe(false)
  expect(eventPatchSchema.parse({ title: 'X', updatedAt: 'a', correction: true }).title).toBe('X')
})

test('delay minutes must be a non-zero integer within ±1440', () => {
  expect(delaySchema.safeParse({ minutes: 0 }).success).toBe(false)
  expect(delaySchema.safeParse({ minutes: 1.5 }).success).toBe(false)
  expect(delaySchema.safeParse({ minutes: 1441 }).success).toBe(false)
  expect(delaySchema.parse({ minutes: -30 }).minutes).toBe(-30)
})
