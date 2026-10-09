import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { openDb } from './db.ts'
import { upsertAdmin } from './auth.ts'
import { buildApp } from './app.ts'
import { knownPlaces } from '../shared/places.ts'
import type { ScheduleEvent, ScheduleResponse } from '../shared/schedule.ts'

const placeId = [...knownPlaces.keys()][0]
const body = {
  title: 'Robo Race',
  category: 'competition',
  placeId,
  startAt: '2026-10-10T04:00:00.000Z',
  endAt: '2026-10-10T06:00:00.000Z',
}

let app: FastifyInstance

async function makeApp() {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'asha', 'Asha', 'correct-horse')
  return buildApp({ db, cookieSecret: 'x'.repeat(32), cookieSecure: false })
}

async function login(a: FastifyInstance, password = 'correct-horse') {
  return a.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'asha', password } })
}

async function cookieFor(a: FastifyInstance) {
  const res = await login(a)
  return `${res.cookies[0].name}=${res.cookies[0].value}`
}

async function createEvent(cookie: string): Promise<ScheduleEvent> {
  const res = await app.inject({ method: 'POST', url: '/api/admin/events', headers: { cookie }, payload: body })
  expect(res.statusCode).toBe(201)
  return res.json()
}

async function schedule() {
  return app.inject({ method: 'GET', url: '/api/schedule' })
}

beforeEach(async () => {
  app = await makeApp()
})

test('health is public', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  expect(res.json()).toEqual({ ok: true })
})

test('schedule is public with ETag and 304 on match; ETag changes after a write', async () => {
  const res = await schedule()
  expect(res.statusCode).toBe(200)
  expect(res.headers.etag).toBe('"0"')
  expect(res.headers['cache-control']).toBe('no-cache')
  expect((res.json() as ScheduleResponse).events).toEqual([])

  const cached = await app.inject({ method: 'GET', url: '/api/schedule', headers: { 'if-none-match': '"0"' } })
  expect(cached.statusCode).toBe(304)
  const weak = await app.inject({ method: 'GET', url: '/api/schedule', headers: { 'if-none-match': 'W/"0"' } })
  expect(weak.statusCode).toBe(304)
  const list = await app.inject({ method: 'GET', url: '/api/schedule', headers: { 'if-none-match': '"7", "0"' } })
  expect(list.statusCode).toBe(304)
  expect(cached.body).toBe('')

  await createEvent(await cookieFor(app))
  const after = await schedule()
  expect(after.headers.etag).toBe('"1"')
  const stale = await app.inject({ method: 'GET', url: '/api/schedule', headers: { 'if-none-match': '"0"' } })
  expect(stale.statusCode).toBe(200)
})

test('admin routes require a session', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/me' })
  expect(res.statusCode).toBe(401)
  expect(res.json()).toEqual({ error: 'unauthorized' })
  const post = await app.inject({ method: 'POST', url: '/api/admin/events', payload: body })
  expect(post.statusCode).toBe(401)
})

test('login rejects wrong password, sets a hardened cookie on success; logout ends the session', async () => {
  const bad = await login(app, 'nope')
  expect(bad.statusCode).toBe(401)
  expect(bad.json()).toEqual({ error: 'invalid_credentials' })

  const ok = await login(app)
  expect(ok.statusCode).toBe(200)
  expect(ok.json()).toEqual({ username: 'asha', displayName: 'Asha' })
  const setCookie = String(ok.headers['set-cookie'])
  expect(setCookie).toContain('tm_session=')
  expect(setCookie).toContain('HttpOnly')
  expect(setCookie).toContain('SameSite=Strict')

  const cookie = `${ok.cookies[0].name}=${ok.cookies[0].value}`
  const me = await app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })
  expect(me.json()).toEqual({ username: 'asha', displayName: 'Asha' })

  const out = await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } })
  expect(out.statusCode).toBe(204)
  const again = await app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })
  expect(again.statusCode).toBe(401)
})

test('a tampered cookie is rejected', async () => {
  const cookie = await cookieFor(app)
  const res = await app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie: cookie + 'x' } })
  expect(res.statusCode).toBe(401)
})

test('create with an unknown venue is a 400 with a field message', async () => {
  const cookie = await cookieFor(app)
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/events',
    headers: { cookie },
    payload: { ...body, placeId: 'nowhere' },
  })
  expect(res.statusCode).toBe(400)
  const json = res.json()
  expect(json.error).toBe('validation')
  expect(json.fields.placeId).toBe('Unknown venue')
})

test('delay shifts times and keeps the original start', async () => {
  const cookie = await cookieFor(app)
  const ev = await createEvent(cookie)
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/events/${ev.id}/delay`,
    headers: { cookie },
    payload: { minutes: 30, updatedAt: ev.updatedAt },
  })
  expect(res.statusCode).toBe(200)
  const listed = ((await schedule()).json() as ScheduleResponse).events[0]
  expect(listed.startAt).toBe('2026-10-10T04:30:00.000Z')
  expect(listed.originalStartAt).toBe(body.startAt)
})

test('double-tap: second delay with the same updatedAt gets 409 with the current event', async () => {
  const cookie = await cookieFor(app)
  const ev = await createEvent(cookie)
  const send = () =>
    app.inject({
      method: 'POST',
      url: `/api/admin/events/${ev.id}/delay`,
      headers: { cookie },
      payload: { minutes: 30, updatedAt: ev.updatedAt },
    })
  expect((await send()).statusCode).toBe(200)
  const second = await send()
  expect(second.statusCode).toBe(409)
  const json = second.json()
  expect(json.error).toBe('conflict')
  expect(json.current.startAt).toBe('2026-10-10T04:30:00.000Z')
})

test('patch with a stale updatedAt is a 409; cancel and restore work', async () => {
  const cookie = await cookieFor(app)
  const ev = await createEvent(cookie)
  const stale = await app.inject({
    method: 'PATCH',
    url: `/api/admin/events/${ev.id}`,
    headers: { cookie },
    payload: { title: 'New', updatedAt: '2000-01-01T00:00:00.000Z' },
  })
  expect(stale.statusCode).toBe(409)

  const ok = await app.inject({
    method: 'PATCH',
    url: `/api/admin/events/${ev.id}`,
    headers: { cookie },
    payload: { title: 'New', updatedAt: ev.updatedAt },
  })
  expect(ok.statusCode).toBe(200)
  expect(ok.json().title).toBe('New')

  const cancelled = await app.inject({
    method: 'POST',
    url: `/api/admin/events/${ev.id}/cancel`,
    headers: { cookie },
    payload: { note: 'Rain' },
  })
  expect(cancelled.json()).toMatchObject({ status: 'cancelled', note: 'Rain' })
  const restored = await app.inject({
    method: 'POST',
    url: `/api/admin/events/${ev.id}/restore`,
    headers: { cookie },
    payload: {},
  })
  expect(restored.json().status).toBe('scheduled')
})

test('delete returns 204, removes the event, and later patches are 404', async () => {
  const cookie = await cookieFor(app)
  const ev = await createEvent(cookie)
  const del = await app.inject({ method: 'DELETE', url: `/api/admin/events/${ev.id}`, headers: { cookie } })
  expect(del.statusCode).toBe(204)
  expect(((await schedule()).json() as ScheduleResponse).events).toEqual([])
  const patch = await app.inject({
    method: 'PATCH',
    url: `/api/admin/events/${ev.id}`,
    headers: { cookie },
    payload: { title: 'x', updatedAt: ev.updatedAt },
  })
  expect(patch.statusCode).toBe(404)
  expect(patch.json()).toEqual({ error: 'not_found' })
})

test('audit lists actions newest first', async () => {
  const cookie = await cookieFor(app)
  const ev = await createEvent(cookie)
  await app.inject({
    method: 'POST',
    url: `/api/admin/events/${ev.id}/delay`,
    headers: { cookie },
    payload: { minutes: 15 },
  })
  const res = await app.inject({ method: 'GET', url: `/api/admin/audit?event=${ev.id}`, headers: { cookie } })
  expect(res.json().map((a: { action: string }) => a.action)).toEqual(['delay', 'create'])
})

test('the 11th login attempt within the window is rate limited', async () => {
  for (let i = 0; i < 10; i++) expect((await login(app, 'nope')).statusCode).toBe(401)
  expect((await login(app, 'nope')).statusCode).toBe(429)
})

async function floodFrom(a: FastifyInstance, ip: string, n: number) {
  const codes: number[] = []
  for (let i = 0; i < n; i++) {
    const res = await a.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: { 'x-forwarded-for': ip },
      payload: { username: 'asha', password: 'nope' },
    })
    codes.push(res.statusCode)
  }
  return codes
}

test('with trustProxy, each X-Forwarded-For client gets its own rate-limit bucket', async () => {
  const db = openDb(':memory:')
  const proxied = await buildApp({ db, cookieSecret: 'x'.repeat(32), cookieSecure: false, trustProxy: (_addr, hop) => hop < 1 })
  expect((await floodFrom(proxied, '10.0.0.1', 11)).at(-1)).toBe(429)
  expect((await floodFrom(proxied, '10.0.0.2', 1))[0]).toBe(401)
})

test('without trustProxy, X-Forwarded-For is ignored by the rate limiter', async () => {
  expect((await floodFrom(app, '10.0.0.1', 10)).at(-1)).toBe(401)
  expect((await floodFrom(app, '10.0.0.2', 1))[0]).toBe(429)
})

test('logout works without a session', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/admin/logout' })
  expect(res.statusCode).toBe(204)
})

const PARSER_URL = 'http://parser.test/api/parse-announcement'

async function appWithParser() {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'asha', 'Asha', 'correct-horse')
  return buildApp({ db, cookieSecret: 'x'.repeat(32), cookieSecure: false, announcementUrl: PARSER_URL })
}

async function parse(a: FastifyInstance, cookie: string | undefined, text: string) {
  return a.inject({
    method: 'POST',
    url: '/api/admin/parse',
    headers: cookie ? { cookie } : {},
    payload: { text },
  })
}

afterEach(() => vi.unstubAllGlobals())

test('parsing an announcement needs a session', async () => {
  const res = await parse(app, undefined, 'Robo Race at 2pm')
  expect(res.statusCode).toBe(401)
})

test('a parsed announcement comes back as a draft, and nothing is written', async () => {
  const parser = await appWithParser()
  const cookie = await cookieFor(parser)
  const calls: unknown[] = []
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    calls.push([url, JSON.parse(init.body)])
    return new Response(
      JSON.stringify({
        ok: true,
        problems: [],
        draft: { title: 'Robo Race', category: 'competition', placeId, room: 'Null', startAt: '2026-10-10T09:30:00+05:30', endAt: '2026-10-10T11:30:00+05:30' },
        placeName: knownPlaces.get(placeId),
        confidence: 'HIGH',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  })
  const res = await parse(parser, cookie, 'Robo Race, 9:30 to 11:30 am')
  expect(res.statusCode).toBe(200)
  expect(res.json()).toMatchObject({
    ok: true,
    problems: [],
    draft: { title: 'Robo Race', startAt: '2026-10-10T04:00:00.000Z' },
  })
  expect(res.json().draft.room).toBeUndefined()
  expect(calls).toEqual([[PARSER_URL, { text: 'Robo Race, 9:30 to 11:30 am' }]])
  const list = await parser.inject({ method: 'GET', url: '/api/schedule' })
  expect((list.json() as ScheduleResponse).events).toEqual([])
})

test('an unreachable parser is a 502, not a crash', async () => {
  const parser = await appWithParser()
  const cookie = await cookieFor(parser)
  vi.stubGlobal('fetch', async () => {
    throw new Error('ECONNREFUSED')
  })
  const res = await parse(parser, cookie, 'Robo Race at 2pm')
  expect(res.statusCode).toBe(502)
  expect(res.json()).toEqual({ error: 'parser_unavailable' })
})

test('a parser error response is a 502 too', async () => {
  const parser = await appWithParser()
  const cookie = await cookieFor(parser)
  vi.stubGlobal('fetch', async () => new Response('upstream exploded', { status: 500 }))
  expect((await parse(parser, cookie, 'Robo Race')).statusCode).toBe(502)
})

test('empty text never reaches the parser', async () => {
  const cookie = await cookieFor(app)
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  const res = await parse(app, cookie, '   ')
  expect(res.statusCode).toBe(400)
  expect(fetchSpy).not.toHaveBeenCalled()
})
