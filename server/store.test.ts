import { beforeEach, expect, test } from 'vitest'
import { openDb } from './db.ts'
import { ConflictError, NotFoundError, createStore, type Store } from './store.ts'
import { RuleError } from '../shared/rules.ts'
import type { EventInput } from '../shared/schedule.ts'

const input: EventInput = {
  title: 'Robo Wars',
  description: null,
  category: 'competition',
  placeId: 'x',
  room: null,
  startAt: '2027-02-06T08:30:00.000Z',
  endAt: '2027-02-06T10:30:00.000Z',
  note: null,
}

let store: Store
beforeEach(() => {
  store = createStore(openDb(':memory:'))
})

test('create is listed, versioned and audited', () => {
  const e = store.create(input, 'ann')
  expect(store.list()).toEqual([e])
  expect(store.get(e.id)).toEqual(e)
  expect(store.version()).toBe(1)
  const log = store.audit()
  expect(log).toHaveLength(1)
  expect(log[0]).toMatchObject({ action: 'create', admin: 'ann', eventId: e.id, before: null, after: e })
})

test('edit with stale updatedAt conflicts with the current event', () => {
  const e = store.create(input, 'ann')
  try {
    store.edit(e.id, { title: 'X', updatedAt: '2000-01-01T00:00:00.000Z' }, 'ann')
    expect.unreachable()
  } catch (err) {
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).current).toEqual(e)
  }
})

test('edit applies with a matching updatedAt', () => {
  const e = store.create(input, 'ann')
  const out = store.edit(e.id, { title: 'New', updatedAt: e.updatedAt }, 'bob')
  expect(out.title).toBe('New')
  expect(out.updatedBy).toBe('bob')
})

test('delay without expectedUpdatedAt applies; stale one conflicts', () => {
  const e = store.create(input, 'ann')
  const d = store.delay(e.id, 30, 'ann')
  expect(d.startAt).toBe('2027-02-06T09:00:00.000Z')
  expect(d.originalStartAt).toBe(input.startAt)
  expect(() => store.delay(e.id, 30, 'ann', e.updatedAt)).toThrow(ConflictError)
})

test('consecutive writes give strictly increasing updatedAt', () => {
  const e = store.create(input, 'ann')
  const a = store.delay(e.id, 5, 'ann')
  const b = store.delay(e.id, 5, 'ann')
  expect(a.updatedAt).not.toBe(e.updatedAt)
  expect(b.updatedAt > a.updatedAt).toBe(true)
})

test('cancel then restore toggles status', () => {
  const e = store.create(input, 'ann')
  const c = store.cancel(e.id, 'rain', 'ann')
  expect(c).toMatchObject({ status: 'cancelled', note: 'rain' })
  expect(store.restore(e.id, undefined, 'ann').status).toBe('scheduled')
  expect(store.cancel(e.id, undefined, 'ann').note).toBeNull()
})

test('restore clears the note unless one is supplied', () => {
  const e = store.create(input, 'ann')
  store.cancel(e.id, 'Rain', 'ann')
  expect(store.restore(e.id, undefined, 'ann').note).toBeNull()
  store.cancel(e.id, 'Rain', 'ann')
  expect(store.restore(e.id, 'Back on', 'ann').note).toBe('Back on')
})

test('remove hides the event and keeps a delete audit row', () => {
  const e = store.create(input, 'ann')
  store.remove(e.id, 'ann')
  expect(store.list()).toEqual([])
  expect(store.get(e.id)).toBeNull()
  const del = store.audit(e.id)[0]
  expect(del).toMatchObject({ action: 'delete', before: e })
  expect(() => store.delay(e.id, 5, 'ann')).toThrow(NotFoundError)
})

test('unknown id throws NotFoundError', () => {
  expect(() => store.edit('nope', { updatedAt: 'x' }, 'a')).toThrow(NotFoundError)
  expect(() => store.cancel('nope', undefined, 'a')).toThrow(NotFoundError)
  expect(() => store.remove('nope', 'a')).toThrow(NotFoundError)
})

test('audit(eventId) is newest first and filtered', () => {
  const e = store.create(input, 'ann')
  store.create({ ...input, title: 'Other' }, 'ann')
  store.delay(e.id, 5, 'ann')
  const log = store.audit(e.id)
  expect(log.map((a) => a.action)).toEqual(['delay', 'create'])
  expect(store.audit()).toHaveLength(3)
})

test('edit violating end > start throws RuleError and keeps version', () => {
  const e = store.create(input, 'ann')
  expect(() => store.edit(e.id, { endAt: input.startAt, updatedAt: e.updatedAt }, 'ann')).toThrow(RuleError)
  expect(store.version()).toBe(1)
})

test('findByTitleAndDay matches exact title and IST day', () => {
  const e = store.create(input, 'ann')
  expect(store.findByTitleAndDay(' Robo Wars ', '2027-02-06')).toEqual(e)
  expect(store.findByTitleAndDay('robo wars', '2027-02-06')).toBeNull()
  expect(store.findByTitleAndDay('Robo Wars', '2027-02-07')).toBeNull()
})
