import { expect, test } from 'vitest'
import type { EventInput, ScheduleEvent } from '../../shared/schedule.ts'
import type { AuditEntry } from './api.ts'
import { applyRevert, revertPlan, type RevertApi } from './revert.ts'

const base: ScheduleEvent = {
  id: 'e1',
  title: 'Robowars',
  description: null,
  category: 'competition',
  placeId: 'nit_football_ground',
  room: null,
  startAt: '2026-10-09T08:30:00.000Z',
  endAt: '2026-10-09T10:30:00.000Z',
  originalStartAt: null,
  status: 'scheduled',
  note: null,
  updatedAt: '2026-10-09T05:00:00.000Z',
  updatedBy: 'asha',
}

const entry = (before: ScheduleEvent | null, after: ScheduleEvent | null): AuditEntry => ({
  id: 1,
  at: '2026-10-09T06:00:00.000Z',
  admin: 'ravi',
  action: 'edit',
  eventId: 'e1',
  before,
  after,
})

test('a field change plans a write of the old values only', () => {
  const after = { ...base, placeId: 'auditorium', room: 'ELHC 301', updatedBy: 'ravi' }
  expect(revertPlan(entry(base, after))).toEqual({
    kind: 'revert',
    fields: { placeId: 'nit_football_ground', room: null },
    status: null,
    correction: false,
  })
})

test('updatedBy is never written back, so a revert cannot pass itself off as the import', () => {
  const after = { ...base, title: 'Robo Wars', updatedBy: 'import' }
  const plan = revertPlan(entry({ ...base, updatedBy: 'import' }, after))
  expect(plan.kind === 'revert' && Object.keys(plan.fields)).toEqual(['title'])
})

test('reverting a delay clears the moved-from marker it set', () => {
  const after = { ...base, startAt: '2026-10-09T09:00:00.000Z', originalStartAt: base.startAt }
  const plan = revertPlan(entry(base, after))
  expect(plan).toMatchObject({ fields: { startAt: base.startAt }, correction: true })
})

test('an event that was already marked as moved stays marked', () => {
  const moved = { ...base, originalStartAt: '2026-10-09T08:00:00.000Z' }
  const after = { ...moved, startAt: '2026-10-09T09:00:00.000Z' }
  expect(revertPlan(entry(moved, after))).toMatchObject({ correction: false })
})

test('a cancellation is a status flip, not a field', () => {
  const after = { ...base, status: 'cancelled' as const, note: 'Rain' }
  expect(revertPlan(entry(base, after))).toEqual({
    kind: 'revert',
    fields: { note: null },
    status: 'scheduled',
    correction: false,
  })
})

test('a create and a delete are both blocked, with a reason', () => {
  expect(revertPlan(entry(null, base))).toEqual({ kind: 'blocked', reason: expect.stringContaining('deleting it') })
  expect(revertPlan(entry(base, null))).toEqual({ kind: 'blocked', reason: expect.stringContaining('added again') })
})

test('an entry that changed nothing visible has nothing to revert', () => {
  expect(revertPlan(entry(base, { ...base, updatedAt: 'later', updatedBy: 'ravi' }))).toEqual({
    kind: 'blocked',
    reason: 'nothing changed in this entry',
  })
})

function fakeApi() {
  const calls: string[] = []
  let current = base
  const api: RevertApi = {
    async cancel(id, updatedAt, note) {
      calls.push(`cancel ${id} @${updatedAt} note=${note ?? '-'}`)
      current = { ...current, status: 'cancelled', note: note ?? null, updatedAt: `${updatedAt}+1` }
      return current
    },
    async restore(id, updatedAt) {
      calls.push(`restore ${id} @${updatedAt}`)
      current = { ...current, status: 'scheduled', note: null, updatedAt: `${updatedAt}+1` }
      return current
    },
    async patch(id, patch) {
      calls.push(`patch ${id} @${patch.updatedAt} ${JSON.stringify({ ...patch, updatedAt: undefined })}`)
      current = { ...current, ...(patch as Partial<EventInput>), updatedAt: `${patch.updatedAt}+1` }
      return current
    },
  }
  return { api, calls }
}

test('a status flip runs first and hands its updatedAt to the field write', async () => {
  const { api, calls } = fakeApi()
  const after = { ...base, status: 'cancelled' as const, note: 'Rain' }
  const plan = revertPlan(entry(base, after))
  if (plan.kind !== 'revert') throw new Error('expected a revert')
  await applyRevert(api, { ...base, status: 'cancelled', note: 'Rain' }, plan)
  expect(calls).toEqual([
    'restore e1 @2026-10-09T05:00:00.000Z',
    'patch e1 @2026-10-09T05:00:00.000Z+1 {"note":null}',
  ])
})

test('a fields-only revert makes one call, with correction when the time moved', async () => {
  const { api, calls } = fakeApi()
  const after = { ...base, startAt: '2026-10-09T09:00:00.000Z', originalStartAt: base.startAt }
  const plan = revertPlan(entry(base, after))
  if (plan.kind !== 'revert') throw new Error('expected a revert')
  await applyRevert(api, after, plan)
  expect(calls).toEqual([
    `patch e1 @${base.updatedAt} {"startAt":"${base.startAt}","correction":true}`,
  ])
})
