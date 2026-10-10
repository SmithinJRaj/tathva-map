import { expect, test } from 'vitest'
import { searchPlaces } from '../lib/placeSearch'
import {
  flagshipPlaces,
  hostPlaceId,
  liveFlagshipPlaces,
  markerPlaceId,
  places,
  placesById,
  routablePlaces,
  venueIsOver,
} from './campus'

const ECLHC = 'east_campus_lecture_hall_complex_eclhc'

test('the five flagship venues are all there', () => {
  expect(flagshipPlaces.map((p) => p.id).sort()).toEqual([
    'informals_stage', 'proshow', 'robowars', 'tathack', 'workshops',
  ])
})

test('each one is searchable by its own name, which is what people know it as', () => {
  // Nobody is looking for the IT Lab Complex; they are looking for Tathack.
  for (const [query, id] of [
    ['workshops', 'workshops'],
    ['robowars', 'robowars'],
    ['tathack', 'tathack'],
    ['proshow', 'proshow'],
    ['informals', 'informals_stage'],
  ] as const) {
    expect(searchPlaces(places, query)[0]?.id, query).toBe(id)
  }
})

test('each one can be routed to, and routes to the place it is held at', () => {
  const routable = new Set(routablePlaces.map((p) => p.id))
  for (const place of flagshipPlaces) {
    expect(routable.has(place.id), place.id).toBe(true)
    expect(place.nodeId, place.id).toBe(placesById.get(place.anchoredTo!)?.nodeId)
  }
  expect(hostPlaceId('tathack')).toBe('it_lab_complex')
  expect(hostPlaceId('robowars')).toBe('open_air_theatre')
  expect(hostPlaceId('workshops')).toBe(ECLHC)
})

test('each one has its own pin, so its events do not land on the host', () => {
  for (const place of flagshipPlaces) expect(markerPlaceId(place.id)).toBe(place.id)
  // A room still has none: ELHC is drawn and labelled, so its events belong there.
  expect(markerPlaceId('elhc_301')).toBe('elhc')
})

test('the workshops venue says where in the building they are', () => {
  expect(placesById.get('workshops')?.description).toMatch(/upstairs/i)
  expect(placesById.get(ECLHC)?.description).toMatch(/upstairs/i)
})

test('ELHC no longer claims the workshops', () => {
  expect(placesById.get('elhc')?.description ?? '').not.toMatch(/workshop/i)
})

test("fest aliases are added to the map data's own, not substituted for them", () => {
  expect(placesById.get(ECLHC)?.aliases).toContain('eclc')
  expect(places.filter((p) => (p.aliases?.length ?? 0) > 0).length).toBeGreaterThan(1)
})

test('a venue with no end date never expires', () => {
  const proshow = placesById.get('proshow')!
  expect(proshow.until).toBeUndefined()
  expect(venueIsOver(proshow, new Date('2030-01-01T00:00:00Z'))).toBe(false)
})

test("Tathack's pin lets itself out at 6pm on day 2", () => {
  const tathack = placesById.get('tathack')!
  expect(tathack.until).toBe('2026-10-10T18:00:00+05:30')
  // 17:59 IST, then 18:01 IST. The clock ticks every 30 s, so it goes on its own.
  expect(venueIsOver(tathack, new Date('2026-10-10T12:29:00.000Z'))).toBe(false)
  expect(venueIsOver(tathack, new Date('2026-10-10T12:31:00.000Z'))).toBe(true)
})

test('an expired venue leaves the map and the pickers together', () => {
  const before = new Date('2026-10-10T12:29:00.000Z')
  const after = new Date('2026-10-10T12:31:00.000Z')
  expect(liveFlagshipPlaces(before).map((p) => p.id)).toContain('tathack')
  expect(liveFlagshipPlaces(after).map((p) => p.id)).not.toContain('tathack')
  // The same predicate the From/To list filters on, so the two can never disagree.
  expect(routablePlaces.filter((p) => !venueIsOver(p, after)).map((p) => p.id)).not.toContain('tathack')
  expect(liveFlagshipPlaces(after).length).toBe(flagshipPlaces.length - 1)
})
