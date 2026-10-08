import { describe, expect, it } from 'vitest'
import { searchPlaces, type SearchablePlace } from './placeSearch'

const place = (name: string, category = 'other'): SearchablePlace => ({
  id: name.toLowerCase().replace(/\W+/g, '_'),
  name,
  category,
})

// Roughly the shape of the real list: lots of shared words, acronyms, and punctuation.
const places = [
  place('A Hostel'),
  place('ABC Auditorium Complex', 'event'),
  place('B Hostel'),
  place('Chaitanya Auditorium', 'event'),
  place('ECED (Block.I)', 'academic'),
  place('ECED (Block.II)', 'academic'),
  place('ELHC', 'academic'),
  place('Maitri', 'food'),
  place('NITC Football Ground', 'event'),
  place('Open Air Theatre (OAT)', 'event'),
  place('PG I Hostel'),
  place('Swadhishtam Canteen', 'food'),
]

const names = (query: string, limit?: number) =>
  searchPlaces(places, query, limit).map((p) => p.name)

describe('searchPlaces', () => {
  it('returns everything for an empty query, in the given order', () => {
    expect(names('')).toEqual(places.map((p) => p.name))
    expect(names('   ')).toHaveLength(places.length)
  })

  it('puts an exact name first', () => {
    expect(names('elhc')[0]).toBe('ELHC')
  })

  it('prefers a name that starts with the query over one that merely contains it', () => {
    // "A Hostel" starts with it; "ABC Auditorium Complex" and "Chaitanya" only contain it.
    expect(names('a hos')[0]).toBe('A Hostel')
  })

  it('ranks a word beginning with the query above a mid-word match', () => {
    const result = names('hostel')
    expect(result.slice(0, 3)).toEqual(['A Hostel', 'B Hostel', 'PG I Hostel'])
  })

  it('breaks ties on the shorter, more specific name', () => {
    const result = names('auditorium')
    expect(result[0]).toBe('Chaitanya Auditorium')
    expect(result).toContain('ABC Auditorium Complex')
  })

  it('matches across punctuation, so an acronym in brackets is findable', () => {
    expect(names('oat')).toContain('Open Air Theatre (OAT)')
    expect(names('block.ii')).toContain('ECED (Block.II)')
    expect(names('blockii')).toEqual([])
  })

  it('accepts the words in any order', () => {
    expect(names('hostel pg')).toEqual(['PG I Hostel'])
  })

  it('searches the category, so a kind of place is findable by name', () => {
    expect(names('food').sort()).toEqual(['Maitri', 'Swadhishtam Canteen'])
  })

  it('ignores case and extra whitespace', () => {
    expect(names('  SWADHISHTAM  ')).toEqual(['Swadhishtam Canteen'])
  })

  it('returns nothing when nothing matches', () => {
    expect(names('helipad')).toEqual([])
  })

  it('honours the limit', () => {
    expect(names('hostel', 2)).toHaveLength(2)
  })
})

describe('searchPlaces: aliases', () => {
  const withAlias = [
    place('Open Air Theatre', 'event'),
    place('Oatmeal Cafe', 'food'),
    ...places,
  ]
  withAlias[0] = { ...withAlias[0], aliases: ['OAT'] }

  it('finds a place by an abbreviation that is not in its name', () => {
    expect(searchPlaces(withAlias, 'oat').map((p) => p.name)[0]).toBe('Open Air Theatre')
  })

  it('ranks an exact alias above a name that merely starts with the same letters', () => {
    const result = searchPlaces(withAlias, 'oat').map((p) => p.name)
    expect(result.indexOf('Open Air Theatre')).toBeLessThan(result.indexOf('Oatmeal Cafe'))
  })

  it('leaves places without aliases unaffected', () => {
    expect(searchPlaces(withAlias, 'elhc').map((p) => p.name)[0]).toBe('ELHC')
  })
})
