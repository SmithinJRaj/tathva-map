import { expect, test } from 'vitest'
import { eventShareUrl, readEventIdFromUrl, withoutEventParam } from './eventLink.ts'

test('reads the event id from a query string', () => {
  expect(readEventIdFromUrl('?event=abc123')).toBe('abc123')
  expect(readEventIdFromUrl('?startNode=elhc&event=abc123')).toBe('abc123')
  expect(readEventIdFromUrl('?startNode=elhc')).toBeNull()
  expect(readEventIdFromUrl('?event=')).toBeNull()
})

test('builds a share link at the site root, without other parameters', () => {
  expect(eventShareUrl('abc123', 'https://map.tathva.org/?startNode=elhc')).toBe('https://map.tathva.org/?event=abc123')
})

test('removes only the event parameter', () => {
  expect(withoutEventParam('https://map.tathva.org/?startNode=elhc&event=abc123')).toBe(
    'https://map.tathva.org/?startNode=elhc',
  )
  expect(withoutEventParam('https://map.tathva.org/?event=abc123')).toBe('https://map.tathva.org/')
})
