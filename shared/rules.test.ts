import { test, expect } from 'vitest'
import { applyDelay, applyEdit, RuleError } from './rules.ts'
import type { EventFields } from './schedule.ts'

const base: EventFields = {
  title: 'Robo Wars',
  description: null,
  category: 'competition',
  placeId: 'x',
  room: null,
  startAt: '2027-02-06T08:30:00.000Z',
  endAt: '2027-02-06T10:30:00.000Z',
  originalStartAt: null,
  status: 'scheduled',
  note: null,
}

test('delay shifts both times and records the original', () => {
  const d = applyDelay(base, 30)
  expect(d.startAt).toBe('2027-02-06T09:00:00.000Z')
  expect(d.endAt).toBe('2027-02-06T11:00:00.000Z')
  expect(d.originalStartAt).toBe('2027-02-06T08:30:00.000Z')
})
test('stacked delays keep the first original', () => {
  expect(applyDelay(applyDelay(base, 30), 15).originalStartAt).toBe('2027-02-06T08:30:00.000Z')
})
test('delay back to the original time clears the marker', () => {
  expect(applyDelay(applyDelay(base, 30), -30).originalStartAt).toBeNull()
})
test('negative delay records original (brought forward)', () => {
  expect(applyDelay(base, -15).originalStartAt).toBe(base.startAt)
})
test('editing only the end does not mark a delay', () => {
  expect(applyEdit(base, { endAt: '2027-02-06T11:30:00.000Z' }, false).originalStartAt).toBeNull()
})
test('editing the start records the original', () => {
  expect(applyEdit(base, { startAt: '2027-02-06T09:00:00.000Z' }, false).originalStartAt).toBe(base.startAt)
})
test('correction clears the original', () => {
  const delayed = applyDelay(base, 30)
  expect(applyEdit(delayed, { startAt: '2027-02-06T09:15:00.000Z' }, true).originalStartAt).toBeNull()
})
test('edit making end <= start throws RuleError on endAt', () => {
  expect(() => applyEdit(base, { endAt: base.startAt }, false)).toThrow(RuleError)
})
test('does not mutate its input', () => {
  const copy = { ...base }
  applyDelay(base, 30)
  applyEdit(base, { title: 'New' }, false)
  expect(base).toEqual(copy)
})
