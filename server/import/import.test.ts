import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { istDateKey } from '../../shared/ist.ts'
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

test('re-importing a rescheduled row is a correction, not a delay', () => {
  const db = openDb(':memory:')
  const store = createStore(db)
  const { ok } = parseScheduleCsv(fixture)
  commitRows(db, store, ok)
  const shifted = ok.map((r, i) =>
    i === 0
      ? {
          input: {
            ...r.input,
            startAt: new Date(Date.parse(r.input.startAt) + 30 * 60_000).toISOString(),
            endAt: new Date(Date.parse(r.input.endAt) + 30 * 60_000).toISOString(),
          },
        }
      : r,
  )
  commitRows(db, store, shifted)
  const e = store.findByTitleAndDay(shifted[0].input.title, istDateKey(shifted[0].input.startAt))
  expect(e?.startAt).toBe(shifted[0].input.startAt)
  expect(e?.originalStartAt).toBeNull()
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

test('a row with no Date cell takes the date given for the file', () => {
  // The sheet keeps the date in the tab name, so exported rows carry none.
  const csv = 'Title,Description,Category,Venue,Date,Start,End,Note\nQuiz,,talk,NLHC,,10:00,11:00,\n'
  const { ok, errors } = parseScheduleCsv(csv, { defaultDate: '2027-02-07' })
  expect(errors).toEqual([])
  expect(ok).toHaveLength(1)
  expect(istDateKey(ok[0].input.startAt)).toBe('2027-02-07')
})

test('a Date cell wins over the date given for the file', () => {
  const csv = 'Title,Description,Category,Venue,Date,Start,End,Note\nQuiz,,talk,NLHC,2027-02-08,10:00,11:00,\n'
  const { ok } = parseScheduleCsv(csv, { defaultDate: '2027-02-07' })
  expect(istDateKey(ok[0].input.startAt)).toBe('2027-02-08')
})

test('a row with no date anywhere is an error, not a silent skip', () => {
  const csv = 'Title,Description,Category,Venue,Date,Start,End,Note\nQuiz,,talk,NLHC,,10:00,11:00,\n'
  const { ok, errors } = parseScheduleCsv(csv)
  expect(ok).toEqual([])
  expect(errors[0].message).toMatch(/No date/)
})

test('every-day rows fan out to one event per fest day, distinct by day', () => {
  const csv = 'Title,Description,Category,Venue,Date,Start,End,Note\nFood Stalls,,other,OAT,,12:00,20:00,\n'
  const days = ['2027-02-06', '2027-02-07', '2027-02-08']
  const { ok, errors } = parseScheduleCsv(csv, { everyDay: days })
  expect(errors).toEqual([])
  expect(ok.map((r) => istDateKey(r.input.startAt))).toEqual(days)
  // Same title across days is what keeps them three stable events, not one overwritten thrice.
  expect(new Set(ok.map((r) => r.input.title)).size).toBe(1)
})

test('every-day ignores a Date cell rather than silently honouring it', () => {
  const csv = 'Title,Description,Category,Venue,Date,Start,End,Note\nFood Stalls,,other,OAT,2027-01-01,12:00,20:00,\n'
  const { ok } = parseScheduleCsv(csv, { everyDay: ['2027-02-06', '2027-02-07'] })
  expect(ok.map((r) => istDateKey(r.input.startAt))).toEqual(['2027-02-06', '2027-02-07'])
})

test('a missing Category column still parses, as other', () => {
  const csv = 'Title,Description,Venue,Date,Start,End,Note\nQuiz,,NLHC,2027-02-06,10:00,11:00,\n'
  const { ok, errors } = parseScheduleCsv(csv)
  expect(errors).toEqual([])
  expect(ok[0].input.category).toBe('other')
})

// These venue strings are all from the real events sheet.

test('a type word is not fuzzed away: a Hall never resolves to a Park', () => {
  // similarity("aryabhatta hall", "aryabhatta park") is 0.87, comfortably over the
  // threshold, and they are opposite kinds of place.
  expect(match('Aryabhatta Hall')).toBeNull()
  expect(match('aryabhatta park')).toEqual({ placeId: 'aryabhatta_park', room: null })
})

test('a typo is still forgiven when neither name claims a different kind', () => {
  expect(match('Open Air Theatr')).toEqual({ placeId: 'open_air_theatre', room: null })
  expect(match('ECLC')).toEqual({
    placeId: 'east_campus_lecture_hall_complex_eclhc',
    room: null,
  })
})

test('a venue naming two places is unresolved, not truncated to the first', () => {
  expect(match('ELHC+Electronics lab')).toBeNull()
  expect(match('ELHC 302, ELHC 301')).toBeNull()
})

test('a list of rooms keeps the way it was written', () => {
  // Re-joining the words gave "101 102 103", which reads as one number.
  expect(match('ELHC 101,102,103')).toEqual({ placeId: 'elhc', room: '101,102,103' })
})

test('a lone type word is part of the name, not a room', () => {
  expect(match('Proshow Ground')).toEqual({ placeId: 'proshow', room: null })
  expect(match('ABC HALL')).toEqual({ placeId: 'abc_auditorium_complex', room: null })
})

test('a real location after the place is kept as the room', () => {
  expect(match('ABC ground floor')).toEqual({
    placeId: 'abc_auditorium_complex',
    room: 'ground floor',
  })
  expect(match('ELHC 305')).toEqual({ placeId: 'elhc', room: '305' })
})

test('an indoor room that is its own place still wins over place + room', () => {
  expect(match('ELHC 301')).toEqual({ placeId: 'elhc_301', room: null })
})

test('shorthand from the sheet resolves', () => {
  expect(match('Audi')?.placeId).toBe('auditorium')
  expect(match('ABC')?.placeId).toBe('abc_auditorium_complex')
  expect(match('Volley Ball Ground')?.placeId).toBe('volleyball_court')
})

test('an unknown venue suggests the nearest name rather than just failing', () => {
  const csv =
    'Title,Description,Category,Venue,Date,Start,End,Note\nLecture,,talk,Aryabhatta Hall,2027-02-06,10:00,11:00,\n'
  const { ok, errors } = parseScheduleCsv(csv)
  expect(ok).toEqual([])
  expect(errors[0].message).toBe('Unknown venue "Aryabhatta Hall" — did you mean "Aryabhatta Park"?')
})
