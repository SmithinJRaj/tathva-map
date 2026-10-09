import { expect, test } from 'vitest'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { bulkChange, emptyBulkEdit, hasBulkEdit } from './bulk.ts'

// 09:00-18:00 IST on day 1: the placeholder window this feature exists to fix.
const event: ScheduleEvent = {
  id: 'e1',
  title: 'Robowars',
  description: null,
  category: 'competition',
  placeId: 'nit_football_ground',
  room: null,
  startAt: '2026-10-09T03:30:00.000Z',
  endAt: '2026-10-09T12:30:00.000Z',
  originalStartAt: null,
  status: 'scheduled',
  note: null,
  updatedAt: '2026-10-08T00:00:00.000Z',
  updatedBy: 'import',
}

const edit = (patch: Partial<typeof emptyBulkEdit>) => ({ ...emptyBulkEdit, ...patch })

test('a time change lands on the event\'s own day', () => {
  expect(bulkChange(event, edit({ startTime: '14:00', endTime: '16:00' }))).toEqual({
    kind: 'change',
    fields: { startAt: '2026-10-09T08:30:00.000Z', endAt: '2026-10-09T10:30:00.000Z' },
    correction: true,
  })
})

test('an unchanged value is a skip, not a write', () => {
  expect(bulkChange(event, edit({ startTime: '09:00', endTime: '18:00' }))).toEqual({ kind: 'skip' })
  expect(bulkChange(event, edit({ category: 'competition' }))).toEqual({ kind: 'skip' })
  expect(bulkChange(event, emptyBulkEdit)).toEqual({ kind: 'skip' })
})

test('only the fields that were filled in are touched', () => {
  expect(bulkChange(event, edit({ placeId: 'auditorium' }))).toEqual({
    kind: 'change',
    fields: { placeId: 'auditorium' },
    correction: false,
  })
})

test('a correction is only claimed when the start actually moved', () => {
  const out = bulkChange(event, edit({ endTime: '11:00', correction: true }))
  expect(out).toEqual({ kind: 'change', fields: { endAt: '2026-10-09T05:30:00.000Z' }, correction: false })
})

test('an end before the start is refused rather than rolled into the next day', () => {
  const out = bulkChange(event, edit({ startTime: '18:00', endTime: '01:00' }))
  expect(out).toEqual({ kind: 'invalid', reason: expect.stringContaining('on its own') })
})

test('a half-typed time is not a time', () => {
  expect(bulkChange(event, edit({ startTime: '1' }))).toEqual({
    kind: 'invalid',
    reason: expect.stringContaining('start time'),
  })
})

test('hasBulkEdit ignores the correction flag, which is not itself a change', () => {
  expect(hasBulkEdit(emptyBulkEdit)).toBe(false)
  expect(hasBulkEdit(edit({ correction: false }))).toBe(false)
  expect(hasBulkEdit(edit({ category: 'talk' }))).toBe(true)
})
