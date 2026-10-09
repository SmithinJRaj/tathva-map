import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { openDb } from '../db.ts'
import { createStore } from '../store.ts'
import { commitRows } from './commit.ts'
import { VENUE_ALIASES, VENUE_ROOMS } from './columns.ts'
import { parseScheduleCsv } from './parse.ts'
import { matchVenue } from './venues.ts'

const fixture = readFileSync(new URL('./fixtures/sample.csv', import.meta.url), 'utf8')
const match = (text: string) => matchVenue(text, knownPlaces, VENUE_ALIASES, VENUE_ROOMS)

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
  expect(commitRows(db, store, ok)).toEqual({ created: 3, updated: 0, preserved: 0 })
  expect(commitRows(db, store, ok)).toEqual({ created: 0, updated: 3, preserved: 0 })
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

test('the fuzzy pass refuses a name claiming a different kind of place', () => {
  // similarity("chanakya hall", "chanakya park") clears the 0.8 threshold while meaning
  // something else entirely. Checked against a synthetic map so that campus data gaining a
  // real "... Hall" cannot quietly turn this test into a no-op.
  const places = new Map([
    ['a_park', 'Chanakya Park'],
    ['b_other', 'Somewhere Else'],
  ])
  expect(matchVenue('Chanakya Hall', places, {})).toBeNull()
  // A typo with no competing type word is still forgiven.
  expect(matchVenue('Chanakya Par', places, {})).toEqual({ placeId: 'a_park', room: null })
})

test('a real venue that claims the wrong kind stays unresolved', () => {
  expect(match('Mechanical Park')).toBeNull()
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
    'Title,Description,Category,Venue,Date,Start,End,Note\nTalk,,talk,Mechanical Park,2027-02-06,10:00,11:00,\n'
  const { ok, errors } = parseScheduleCsv(csv)
  expect(ok).toEqual([])
  expect(errors[0].message).toBe('Unknown venue "Mechanical Park" — did you mean "Mechanical Lab"?')
})

test('re-importing does not undo a change made during the fest', () => {
  const db = openDb(':memory:')
  const store = createStore(db)
  const row = (start: string, end: string) => ({
    input: {
      title: 'Robowars', description: null, category: 'competition' as const,
      placeId: 'mechanical_lab', room: null,
      startAt: start, endAt: end, note: null,
    },
  })
  const sheet = row('2027-02-06T08:30:00.000Z', '2027-02-06T10:30:00.000Z')

  expect(commitRows(db, store, [sheet])).toMatchObject({ created: 1, updated: 0, preserved: 0 })
  const [created] = store.list()

  // The bridge delays it an hour and moves it, as a WhatsApp message would.
  store.edit(
    created.id,
    {
      startAt: '2027-02-06T09:30:00.000Z',
      endAt: '2027-02-06T11:30:00.000Z',
      placeId: 'elhc',
      note: 'Delayed one hour',
      updatedAt: created.updatedAt,
    },
    'whatsapp-bot',
  )

  // The sheet syncs again, still carrying the original time.
  expect(commitRows(db, store, [sheet])).toMatchObject({ created: 0, updated: 0, preserved: 1 })

  const [after] = store.list()
  expect(after.startAt).toBe('2027-02-06T09:30:00.000Z')   // the live time survives
  expect(after.placeId).toBe('elhc')                        // so does the live venue
  expect(after.originalStartAt).toBe('2027-02-06T08:30:00.000Z') // still shows as moved
  expect(after.note).toBe(null)                             // the sheet still owns the rest
  db.close()
})

test('re-importing still corrects an event nothing has touched', () => {
  const db = openDb(':memory:')
  const store = createStore(db)
  const make = (start: string) => ({
    input: {
      title: 'Quiz', description: null, category: 'talk' as const,
      placeId: 'nlhc', room: null,
      startAt: start, endAt: '2027-02-06T12:30:00.000Z', note: null,
    },
  })
  commitRows(db, store, [make('2027-02-06T10:30:00.000Z')])
  expect(commitRows(db, store, [make('2027-02-06T11:30:00.000Z')])).toMatchObject({ updated: 1, preserved: 0 })
  const [after] = store.list()
  expect(after.startAt).toBe('2027-02-06T11:30:00.000Z')
  expect(after.originalStartAt).toBeNull()  // a sheet fix is a correction, not a delay
  db.close()
})

test('the three halls are rooms in one building, which has no name of its own', () => {
  // OSM called the building "Aryabhatta Park"; it is a lecture-hall block holding Aryabhatta,
  // Bhaskara and Chanakya halls, and people enter the building and find the hall inside.
  expect(match('Aryabhatta Hall')).toEqual({ placeId: 'aryabhatta_park', room: 'Aryabhatta Hall' })
  expect(match('Bhaskara Hall')).toEqual({ placeId: 'aryabhatta_park', room: 'Bhaskara Hall' })
  expect(match('Chanakya Hall')).toEqual({ placeId: 'aryabhatta_park', room: 'Chanakya Hall' })
  // Which hall is unknown here, and all three share one entrance.
  expect(match('Aryabatta')).toEqual({ placeId: 'aryabhatta_park', room: null })
})

test('labs resolve to their building with the lab as the room', () => {
  expect(match('SSL')).toEqual({ placeId: 'it_lab_complex', room: 'SSL' })
  expect(match('BDL')).toEqual({ placeId: 'central_computer_center', room: 'BDL' })
  // Three labs across two buildings had no single answer until the user picked one: send
  // people to the IT Lab Complex, where two of the three are.
  expect(match('SSL. NSL and BDL')).toEqual({ placeId: 'it_lab_complex', room: null })
})

test('a venue written as a direction resolves to its landmark', () => {
  // The sheet describes where a volunteer will stand. The landmark is the only part a map
  // can pin, and pinning it beats failing the row.
  expect(match('near audi')?.placeId).toBe('auditorium')
  expect(match('right side of audi')?.placeId).toBe('auditorium')
  expect(match('in front of pg block')?.placeId).toBe('pg_block')
  expect(match('Near Amphi')?.placeId).toBe('green_amphitheatre')
  // "dhwani" is a fest-week name for the ABC complex, so this one only works once the alias
  // is in; before it was, this was the example of a landmark no map could place.
  expect(match('near dhwani')?.placeId).toBe('abc_auditorium_complex')
})

test('a direction toward somewhere unknown is still unknown', () => {
  // Stripping the preposition must not make an unplaceable venue look placed.
  expect(match('near the blue tent')).toBeNull()
  expect(match('in')).toBeNull()
})

test('dhwani is the whole ABC complex, however it is written', () => {
  // Confirmed by the user, not inferred: no name in the campus data matched it under any
  // spelling, and "Grounds" is a type word rather than a room inside the complex.
  expect(match('dhwani')).toEqual({ placeId: 'abc_auditorium_complex', room: null })
  expect(match('Dhwani Grounds')).toEqual({ placeId: 'abc_auditorium_complex', room: null })
})

test('a confirmed multi-place venue resolves; an unconfirmed one still does not', () => {
  // The guard exists because guessing between two places is dangerous, not because a
  // mapping someone has checked is dangerous.
  expect(match('ELHC 301 + ELECTRONICS LAB')).toEqual({ placeId: 'elhc', room: '301' })
  expect(match('SSL,NSL AND BDL')).toEqual({ placeId: 'it_lab_complex', room: null })
  expect(match('ELHC+Electronics lab')).toBeNull()
})

test('kho kho ground and the volleyball court are one ground', () => {
  // The user's coordinate for it lands 4 m from the Volleyball Court, nothing else within 69.
  expect(match('Kho Kho Ground')?.placeId).toBe('volleyball_court')
  expect(match('Volley Ball Ground')?.placeId).toBe('volleyball_court')
})

test('reads the real sheet shape: title row, section headings, one Time column', () => {
  const sheet = readFileSync(new URL('./fixtures/sheet.csv', import.meta.url), 'utf8')
  const { ok, errors } = parseScheduleCsv(sheet, { defaultDate: '2026-10-09' })

  // "DAY 1" sits above the header, so the header is not line 1.
  expect(ok.map((r) => r.input.title)).toEqual(['Innovex', 'Chandrayaan'])

  // Category comes from the "EXPO:" / "Lecture:" headings, which are not events themselves.
  expect(ok[0].input.category).toBe('other')
  expect(ok[1].input.category).toBe('talk')

  // One Time column becomes a start and an end.
  expect(ok[0].input.startAt).toBe('2026-10-09T04:30:00.000Z')
  expect(ok[0].input.endAt).toBe('2026-10-09T11:30:00.000Z')

  // The hall resolves to its building, with the hall as the room.
  expect(ok[1].input.placeId).toBe('aryabhatta_park')
  expect(ok[1].input.room).toBe('Aryabhatta Hall')

  // The untimed row is reported for /admin rather than guessed at.
  expect(errors).toHaveLength(1)
  expect(errors[0].message).toMatch(/No usable time.*Add it in \/admin/)
})

test('the architecture department answers to all five of its spellings', () => {
  const dap = 'department_of_architecture_and_plannning'
  for (const spelling of ['Architecture department', 'Architechture dept', 'ARCHI DEPT', 'DAP', 'DAP NITC']) {
    expect(match(spelling)?.placeId).toBe(dap)
  }
  expect(match('DAP NITC FACULTY COURTYARD')).toEqual({ placeId: dap, room: 'FACULTY COURTYARD' })
})
