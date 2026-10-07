import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { openDb } from '../db.ts'
import { createStore } from '../store.ts'
import { VENUE_ALIASES } from './columns.ts'
import { parseScheduleCsv } from './parse.ts'
import { matchVenue } from './venues.ts'

const fixture = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8')
const match = (text: string) => matchVenue(text, knownPlaces, VENUE_ALIASES)

test('matchVenue splits a place from its room', () => {
  expect(match('ELHC 305')).toEqual({ placeId: 'elhc', room: '305' })
  expect(match('ELHC 301')).toEqual({ placeId: 'elhc_301', room: null })
  expect(match('Open Air Theatre')).toEqual({ placeId: 'open_air_theatre', room: null })
})

test('matchVenue resolves aliases', () => {
  expect(match('OAT')).toEqual({ placeId: 'open_air_theatre', room: null })
})

test('matchVenue tolerates a one-letter typo', () => {
  expect(match('Open Air Theatr')).toEqual({ placeId: 'open_air_theatre', room: null })
})

test('matchVenue returns null for unknown venues', () => {
  expect(match('Mars')).toBeNull()
})

test('parseScheduleCsv converts IST to UTC and reports bad rows with line numbers', () => {
  const { ok, errors } = parseScheduleCsv(fixture)
  expect(ok.map((r) => r.line)).toEqual([2, 3, 6])
  expect(ok[0].input.startAt).toBe('2027-02-06T08:30:00.000Z')
  expect(ok[0].input.category).toBe('competition')
  expect(ok[0].input.room).toBe('305')
  expect(ok[1].input.category).toBe('other')
  expect(ok[1].input.note).toBe('Gates open at 9')
  expect(errors).toEqual([
    { line: 4, message: 'Unknown venue "Mars"' },
    { line: 5, message: 'Bad time "25:00"' },
  ])
})

test('a BOM and trailing blank rows change nothing', () => {
  const plain = parseScheduleCsv(fixture)
  const noisy = parseScheduleCsv('﻿' + fixture + ',,,,,,,\n,,,,,,,\n')
  expect(noisy.ok).toEqual(plain.ok)
  expect(noisy.errors).toEqual(plain.errors)
})

test('importing the same rows twice updates instead of duplicating', () => {
  const store = createStore(openDb(':memory:'))
  const { ok } = parseScheduleCsv(fixture)
  const run = () => {
    for (const { input } of ok) {
      const existing = store.findByTitleAndDay(input.title, istDateKey(input.startAt))
      if (existing) store.edit(existing.id, { ...input, updatedAt: existing.updatedAt }, 'import', 'import')
      else store.create(input, 'import', 'import')
    }
  }
  run()
  run()
  expect(store.list()).toHaveLength(ok.length)
})
