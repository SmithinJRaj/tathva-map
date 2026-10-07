import { expect, test } from 'vitest'
import { openDb } from './db.ts'
import {
  SESSION_TTL_MS,
  checkLogin,
  createSession,
  deleteSession,
  getSessionAdmin,
  removeAdmin,
  upsertAdmin,
} from './auth.ts'

test('checkLogin accepts the right password only', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'correct-horse-1')
  expect(await checkLogin(db, 'parthiv', 'correct-horse-1')).toEqual({
    username: 'parthiv',
    displayName: 'Parthiv',
  })
  expect(await checkLogin(db, 'parthiv', 'wrong-password')).toBeNull()
  expect(await checkLogin(db, 'nobody', 'correct-horse-1')).toBeNull()
})

test('upserting again resets the password', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'first-password-1')
  await upsertAdmin(db, 'parthiv', 'Parthiv R', 'second-password-2')
  expect(await checkLogin(db, 'parthiv', 'first-password-1')).toBeNull()
  expect(await checkLogin(db, 'parthiv', 'second-password-2')).toEqual({
    username: 'parthiv',
    displayName: 'Parthiv R',
  })
})

test('sessions expire after 12 hours', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'correct-horse-1')
  const now = new Date('2026-10-08T00:00:00Z')
  const token = createSession(db, 'parthiv', now)
  const before = new Date(now.getTime() + SESSION_TTL_MS - 1)
  const after = new Date(now.getTime() + SESSION_TTL_MS + 1)
  expect(getSessionAdmin(db, token, before)).toEqual({ username: 'parthiv', displayName: 'Parthiv' })
  expect(getSessionAdmin(db, token, after)).toBeNull()
  expect(getSessionAdmin(db, 'unknown-token', now)).toBeNull()
})

test('the raw token is not stored', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'correct-horse-1')
  const token = createSession(db, 'parthiv')
  const rows = db.prepare('SELECT * FROM sessions').all() as Record<string, unknown>[]
  expect(rows).toHaveLength(1)
  expect(Object.values(rows[0]).includes(token)).toBe(false)
})

test('deleteSession invalidates the token', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'correct-horse-1')
  const token = createSession(db, 'parthiv')
  expect(getSessionAdmin(db, token)).not.toBeNull()
  deleteSession(db, token)
  expect(getSessionAdmin(db, token)).toBeNull()
})

test('resetting a password revokes existing sessions', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'first-password-1')
  const token = createSession(db, 'parthiv')
  expect(getSessionAdmin(db, token)).not.toBeNull()
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'second-password-2')
  expect(getSessionAdmin(db, token)).toBeNull()
})

test('removeAdmin deletes the account and its sessions', async () => {
  const db = openDb(':memory:')
  await upsertAdmin(db, 'parthiv', 'Parthiv', 'correct-horse-1')
  const token = createSession(db, 'parthiv')
  expect(removeAdmin(db, 'parthiv')).toBe(true)
  expect(getSessionAdmin(db, token)).toBeNull()
  expect(await checkLogin(db, 'parthiv', 'correct-horse-1')).toBeNull()
  expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 })
  expect(removeAdmin(db, 'parthiv')).toBe(false)
})
