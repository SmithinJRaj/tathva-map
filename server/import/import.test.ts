import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { knownPlaces } from '../../shared/places.ts'
import { openDb } from '../db.ts'
import { createStore } from '../store.ts'
import { commitRows } from './commit.ts'
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

test('a repeated title and day is reported against the first line', () => {
  const dup = fixture + 'Robo Wars,,,ELHC,2027-02-06,18:00,19:00,\n'
  const { ok, errors } = parseScheduleCsv(dup)
  expect(ok).toHaveLength(3)
  expect(errors).toContainEqual({ line: 7, message: 'Duplicate of line 2 (same title and day)' })
})

test('importing the same rows twice updates instead of duplicating', () => {
  const db = openDb(':memory:')
  const store = createStore(db)
  const { ok } = parseScheduleCsv(fixture)
  expect(commitRows(db, store, ok)).toEqual({ created: 3, updated: 0 })
  expect(commitRows(db, store, ok)).toEqual({ created: 0, updated: 3 })
  expect(store.list()).toHaveLength(ok.length)
})

test('a failure part-way through writes nothing', () => {
  const db = openDb(':memory:')
  const store = createStore(db)
  const { ok } = parseScheduleCsv(fixture)
  let calls = 0
  const flaky = {
    ...store,
    create(...args: Parameters<typeof store.create>) {
      if (++calls === 2) throw new Error('boom')
      return store.create(...args)
    },
  }
  expect(() => commitRows(db, flaky, ok)).toThrow('boom')
  expect(store.list()).toHaveLength(0)
  expect(store.version()).toBe(0)
})
