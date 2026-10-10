import { expect, test } from 'vitest'
import { searchPlaces } from '../lib/placeSearch'
import { flagshipPlaces, hostPlaceId, markerPlaceId, places, placesById, routablePlaces } from './campus'

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
