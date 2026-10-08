import { expect, test } from 'vitest'
import { nearestSnap, sheetHeight } from './sheetSnap'

test('sheetHeight gives the pixel height of each snap point', () => {
  expect(sheetHeight('peek', 800)).toBe(56)
  expect(sheetHeight('half', 800)).toBe(400)
  expect(sheetHeight('full', 800)).toBe(600)
})

test('nearestSnap picks the closest snap point', () => {
  expect(nearestSnap(70, 800)).toBe('peek')
  expect(nearestSnap(450, 800)).toBe('half')
  expect(nearestSnap(650, 800)).toBe('full')
})
