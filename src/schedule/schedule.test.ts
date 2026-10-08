import { afterEach, expect, test, vi } from 'vitest'
import { fetchSchedule } from './api.ts'
import { loadCachedSchedule } from './cache.ts'
import { dayLabel, FEST_DAYS } from './festDays.ts'

const body = { version: 3, generatedAt: '2026-02-06T00:00:00.000Z', events: [] }

afterEach(() => vi.unstubAllGlobals())

test('fetchSchedule sends If-None-Match and returns the ETag on 200', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { ETag: '"3"' } }))
  vi.stubGlobal('fetch', fetchMock)
  const res = await fetchSchedule('"2"')
  expect(res).toEqual({ status: 'ok', data: body, etag: '"3"' })
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
  expect(new Headers(init.headers).get('If-None-Match')).toBe('"2"')
})

test('fetchSchedule omits If-None-Match without an etag', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const res = await fetchSchedule(null)
  expect(res).toEqual({ status: 'ok', data: body, etag: null })
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
  expect(new Headers(init.headers).has('If-None-Match')).toBe(false)
})

test('fetchSchedule maps 304 to not-modified', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 304 })))
  expect(await fetchSchedule('"3"')).toEqual({ status: 'not-modified' })
})

test('fetchSchedule throws on 500', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
  await expect(fetchSchedule(null)).rejects.toThrow()
})

const fakeStorage = (value: string | null) =>
  ({ getItem: () => value, setItem: () => {} }) as unknown as Storage

test('loadCachedSchedule returns null for missing or corrupt data', () => {
  expect(loadCachedSchedule(fakeStorage(null))).toBeNull()
  expect(loadCachedSchedule(fakeStorage('{oops'))).toBeNull()
  expect(loadCachedSchedule(fakeStorage('{"data":{"events":"x"}}'))).toBeNull()
  const throwing = { getItem: () => { throw new Error('denied') } } as unknown as Storage
  expect(loadCachedSchedule(throwing)).toBeNull()
})

test('loadCachedSchedule returns a valid cache', () => {
  const cached = { data: body, etag: '"3"', fetchedAt: 123 }
  expect(loadCachedSchedule(fakeStorage(JSON.stringify(cached)))).toEqual(cached)
})

test('dayLabel gives today, listed and unlisted forms', () => {
  expect(dayLabel('2026-02-06', '2026-02-06')).toBe('Today')
  expect(dayLabel('2026-02-06', '2026-02-05')).toBe('Fri 6 Feb')
  FEST_DAYS['2026-02-06'] = 'Day 1'
  try {
    expect(dayLabel('2026-02-06', '2026-02-05')).toBe('Day 1 · Fri 6 Feb')
  } finally {
    delete FEST_DAYS['2026-02-06']
  }
})

test('the fest days are labelled', () => {
  expect(dayLabel('2026-10-09', '2026-10-11')).toMatch(/^Day 1/)
  expect(dayLabel('2026-10-11', '2026-10-11')).toBe('Today')
  expect(dayLabel('2026-12-25', '2026-10-11')).not.toMatch(/Day/)
})
