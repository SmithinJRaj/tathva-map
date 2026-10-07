import { expect, test } from 'vitest'
import { fromIstInputs, toIstInputs } from './istInputs.ts'

test('toIstInputs splits a UTC instant into IST date and time', () => {
  expect(toIstInputs('2027-02-06T08:30:00.000Z')).toEqual({ date: '2027-02-06', time: '14:00' })
  expect(toIstInputs('2027-02-05T19:00:00.000Z')).toEqual({ date: '2027-02-06', time: '00:30' })
})

test('fromIstInputs converts IST inputs to UTC ISO', () => {
  expect(fromIstInputs('2027-02-06', '14:00')).toBe('2027-02-06T08:30:00.000Z')
  expect(fromIstInputs('2027-02-06', '00:30')).toBe('2027-02-05T19:00:00.000Z')
})

test('fromIstInputs rejects malformed input', () => {
  expect(fromIstInputs('', '14:00')).toBeNull()
  expect(fromIstInputs('2027-02-06', '')).toBeNull()
  expect(fromIstInputs('2027-2-6', '14:00')).toBeNull()
  expect(fromIstInputs('2027-02-30', '14:00')).toBeNull()
  expect(fromIstInputs('2027-02-06', '25:00')).toBeNull()
})
