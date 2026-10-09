import { expect, test } from 'vitest'
import { parseTimeRange } from './times.ts'

const ranges = (text: string) => {
  const r = parseTimeRange(text)
  return r.kind === 'ranges' ? r.ranges : r.reason
}

// Every string here is from the real events sheet.

test('reads the ordinary ranges, however they are punctuated', () => {
  expect(ranges('9am - 8pm')).toEqual([{ start: '09:00', end: '20:00' }])
  expect(ranges('9am to 6pm')).toEqual([{ start: '09:00', end: '18:00' }])
  expect(ranges('2PM to 4PM')).toEqual([{ start: '14:00', end: '16:00' }])
  expect(ranges('10am - 5pm')).toEqual([{ start: '10:00', end: '17:00' }])
  expect(ranges('11:30am to 1:45pm')).toEqual([{ start: '11:30', end: '13:45' }])
})

test('reads 24-hour times and spaced meridiems', () => {
  expect(ranges('09:00 to 18:00')).toEqual([{ start: '09:00', end: '18:00' }])
  expect(ranges('5 P M to 7 P M')).toEqual([{ start: '17:00', end: '19:00' }])
})

test('midnight and noon are not off by twelve hours', () => {
  expect(ranges('12am to 1am')).toEqual([{ start: '00:00', end: '01:00' }])
  expect(ranges('12pm to 1pm')).toEqual([{ start: '12:00', end: '13:00' }])
})

test('drops a parenthetical qualifier', () => {
  expect(ranges('8 am to 9 am (tentative)')).toEqual([{ start: '08:00', end: '09:00' }])
})

test('splits a two-session cell into two ranges', () => {
  expect(ranges('9am to 12pm and 2pm to 5pm')).toEqual([
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '17:00' },
  ])
})

test('passes an impossible range through for validation to reject', () => {
  // Three lectures read "11:00PM to 12:30PM" and mean 11:00 AM. Deciding that here would be
  // a twelve-hour guess; the schema refuses it instead and a human fixes the sheet.
  expect(ranges('11:00PM to 12:30PM')).toEqual([{ start: '23:00', end: '12:30' }])
})

test('refuses a start with no end', () => {
  expect(ranges('5 P M')).toMatch(/only a start time/)
  expect(ranges('18:00')).toMatch(/only a start time/)
})

test('refuses prose and empty cells', () => {
  expect(ranges('Oct 10 Qualifiers & Finale')).toMatch(/names a date/)
  expect(ranges('')).toMatch(/no time given/)
  expect(ranges('   ')).toMatch(/no time given/)
})

test('refuses a cell that carries its own date', () => {
  // The tab name is where the date lives; a cell naming one is two sources disagreeing.
  expect(ranges('Oct 9th 3pm to 11:30pm')).toMatch(/names a date/)
  expect(ranges('oct 9th 9am to oct 10th 6pm')).toMatch(/names a date/)
})

test('refuses nonsense rather than reading part of it', () => {
  expect(ranges('whenever')).toMatch(/could not read/)
  expect(ranges('25:00 to 26:00')).toMatch(/could not read/)
  expect(ranges('9am to')).toMatch(/could not read|only a start/)
})

test('refuses a bare hour next to one that names am or pm', () => {
  // "2 to 4pm" means 14:00. Read as 02:00 it is still a valid range, so nothing downstream
  // would catch the twelve-hour error — it has to be refused here or not at all.
  expect(ranges('2 to 4pm')).toMatch(/only one end/)
  expect(ranges('10-5pm')).toMatch(/only one end/)
  expect(ranges('2pm to 4')).toMatch(/only one end/)
  // Even when a bare hour would happen to be right, it is still a guess.
  expect(ranges('9 to 6pm')).toMatch(/only one end/)
})

test('still reads a range where both ends agree', () => {
  expect(ranges('9am to 6pm')).toEqual([{ start: '09:00', end: '18:00' }])
  expect(ranges('09:00 to 18:00')).toEqual([{ start: '09:00', end: '18:00' }])
})
