import { expect, test } from 'vitest'
import { detectLite, readLiteOverride, saveLiteOverride } from './liteMode.ts'

test('auto-detects low-end or data-saving phones and reduced motion', () => {
  expect(detectLite({ cores: 8, saveData: false, reducedMotion: false })).toBe(false)
  expect(detectLite({ cores: 4, saveData: false, reducedMotion: false })).toBe(true)
  expect(detectLite({ cores: 8, saveData: true, reducedMotion: false })).toBe(true)
  expect(detectLite({ cores: 8, saveData: false, reducedMotion: true })).toBe(true)
})

test('unknown core count is not treated as low-end', () => {
  expect(detectLite({ cores: undefined, saveData: undefined, reducedMotion: false })).toBe(false)
})

function memory(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

test('a saved choice round-trips; no choice reads as null', () => {
  const s = memory()
  expect(readLiteOverride(s)).toBeNull()
  saveLiteOverride(true, s)
  expect(readLiteOverride(s)).toBe(true)
  saveLiteOverride(false, s)
  expect(readLiteOverride(s)).toBe(false)
})

test('storage that throws is ignored', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  } as unknown as Storage
  expect(readLiteOverride(broken)).toBeNull()
  expect(() => saveLiteOverride(true, broken)).not.toThrow()
})
