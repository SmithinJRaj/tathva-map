import { expect, test } from 'vitest'
import { knownPlaces } from '../../shared/places.ts'
import { normaliseAnnouncement } from './announcement.ts'

const placeId = [...knownPlaces.keys()][0]

const payload = (draft: Record<string, unknown>, rest: Record<string, unknown> = {}) => ({
  ok: true,
  problems: [],
  draft,
  placeName: knownPlaces.get(placeId),
  confidence: 'HIGH',
  ...rest,
})

const complete = {
  title: 'Oppathinoppam',
  description: null,
  category: 'talk',
  placeId,
  room: 'Bhaskara Hall',
  startAt: '2026-10-09T12:00:00+05:30',
  endAt: '2026-10-09T13:00:00+05:30',
  note: null,
}

test('a complete draft comes through with times as UTC instants', () => {
  const out = normaliseAnnouncement(payload(complete))
  expect(out.ok).toBe(true)
  expect(out.problems).toEqual([])
  expect(out.draft).toEqual({
    title: 'Oppathinoppam',
    category: 'talk',
    placeId,
    room: 'Bhaskara Hall',
    startAt: '2026-10-09T06:30:00.000Z',
    endAt: '2026-10-09T07:30:00.000Z',
  })
  expect(out.confidence).toBe('HIGH')
})

test("the model's literal \"Null\" is an absent field, not a room called Null", () => {
  const out = normaliseAnnouncement(payload({ ...complete, room: 'Null', description: 'N/A', note: '  ' }))
  expect(out.draft.room).toBeUndefined()
  expect(out.draft.description).toBeUndefined()
  expect(out.draft.note).toBeUndefined()
  expect(out.ok).toBe(true)
})

test('a venue the map does not have is dropped and reported, not stored', () => {
  const out = normaliseAnnouncement(payload({ ...complete, placeId: 'dhwani_grounds' }))
  expect(out.draft.placeId).toBeUndefined()
  expect(out.ok).toBe(false)
  expect(out.problems.join(' ')).toContain('dhwani_grounds')
})

test("the schema's refusal member is a refusal, not a problem worth repeating", () => {
  const out = normaliseAnnouncement(payload({ ...complete, placeId: 'NOT_ON_MAP' }, { ok: false, problems: ['venue not recognised: Dhwani Grounds'] }))
  expect(out.draft.placeId).toBeUndefined()
  expect(out.problems).toEqual(['venue not recognised: Dhwani Grounds'])
})

test('an unknown category is dropped so the form can offer the real ones', () => {
  const out = normaliseAnnouncement(payload({ ...complete, category: 'gaming' }))
  expect(out.draft.category).toBeUndefined()
  expect(out.problems.join(' ')).toContain('gaming')
})

test('the rest of the draft survives an unreadable time', () => {
  const out = normaliseAnnouncement(payload({ ...complete, endAt: 'tomorrow evening' }))
  expect(out.draft.title).toBe('Oppathinoppam')
  expect(out.draft.startAt).toBe('2026-10-09T06:30:00.000Z')
  expect(out.draft.endAt).toBeUndefined()
  expect(out.ok).toBe(false)
})

test('an end before the start is reported rather than swapped', () => {
  const out = normaliseAnnouncement(
    payload({ ...complete, startAt: '2026-10-09T13:00:00+05:30', endAt: '2026-10-09T12:00:00+05:30' }),
  )
  expect(out.draft.startAt).toBeDefined()
  expect(out.draft.endAt).toBeDefined()
  expect(out.problems.join(' ')).toContain('not after the start')
})

test("the parser's own problems are kept and ok stays false", () => {
  const out = normaliseAnnouncement({ ok: false, problems: ['venue not recognised: Dhwani Grounds'], draft: null })
  expect(out.ok).toBe(false)
  expect(out.problems).toEqual(['venue not recognised: Dhwani Grounds', 'no title in the text'])
  expect(out.draft).toEqual({})
})

test('a payload in an unreadable shape is refused outright', () => {
  for (const junk of [null, 'ok', 42, { draft: 'Oppathinoppam' }]) {
    const out = normaliseAnnouncement(junk)
    expect(out.ok).toBe(false)
    expect(out.draft).toEqual({})
  }
})

test('an incomplete draft is never ok, even with nothing to complain about', () => {
  const out = normaliseAnnouncement(payload({ title: 'Robowars', category: 'competition' }))
  expect(out.problems).toEqual([])
  expect(out.ok).toBe(false)
})
