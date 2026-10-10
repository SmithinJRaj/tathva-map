import { expect, test } from 'vitest'
import { searchPlaces } from '../lib/placeSearch'
import { places, placesById } from './campus'

const ECLHC = 'east_campus_lecture_hall_complex_eclhc'

test('searching for what a building is used for finds it', () => {
  // Nobody looking for a workshop knows it is held above the East Campus Lecture Hall Complex,
  // and ELHC — one letter away — is a different building, running the numbered competitions.
  expect(searchPlaces(places, 'workshops')[0]?.id).toBe(ECLHC)
  expect(searchPlaces(places, 'workshop')[0]?.id).toBe(ECLHC)
})

test('the workshops venue says where in the building they are', () => {
  expect(placesById.get(ECLHC)?.description).toMatch(/upstairs/i)
})

test('fest aliases are added to the map data\'s own, not substituted for them', () => {
  expect(placesById.get(ECLHC)?.aliases).toContain('workshops')
  // Every place the generated data gave aliases to still has them.
  const generated = places.filter((p) => (p.aliases?.length ?? 0) > 0)
  expect(generated.length).toBeGreaterThan(1)
})

test('ELHC no longer claims the workshops', () => {
  expect(placesById.get('elhc')?.description ?? '').not.toMatch(/workshop/i)
})
