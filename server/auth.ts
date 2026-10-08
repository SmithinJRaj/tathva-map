import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type Database from 'better-sqlite3'

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export type AdminInfo = { username: string; displayName: string }

export function hashPassword(pw: string): Promise<string> {
  return hash(pw)
}

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw)
  } catch {
    return false
  }
}

export async function upsertAdmin(
  db: Database.Database,
  username: string,
  displayName: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password)
  db.transaction(() => {
    db.prepare(
      `INSERT INTO admins (username, display_name, password_hash) VALUES (?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         display_name = excluded.display_name, password_hash = excluded.password_hash`,
    ).run(username, displayName, passwordHash)
    // A reset must lock out anyone holding the old credentials.
    db.prepare('DELETE FROM sessions WHERE username = ?').run(username)
  })()
}

export function removeAdmin(db: Database.Database, username: string): boolean {
  return db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE username = ?').run(username)
    return db.prepare('DELETE FROM admins WHERE username = ?').run(username).changes > 0
  })()
}

export async function checkLogin(
  db: Database.Database,
  username: string,
  password: string,
): Promise<AdminInfo | null> {
  const row = db
    .prepare('SELECT display_name, password_hash FROM admins WHERE username = ?')
    .get(username) as { display_name: string; password_hash: string } | undefined
  if (!row) return null
  if (!(await verifyPassword(row.password_hash, password))) return null
  return { username, displayName: row.display_name }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function createSession(db: Database.Database, username: string, now = new Date()): string {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  db.prepare('INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    username,
    expiresAt,
  )
  return token
}

export function getSessionAdmin(
  db: Database.Database,
  token: string,
  now = new Date(),
): AdminInfo | null {
  const row = db
    .prepare(
      `SELECT a.username, a.display_name FROM sessions s
       JOIN admins a ON a.username = s.username
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), now.toISOString()) as
    | { username: string; display_name: string }
    | undefined
  return row ? { username: row.username, displayName: row.display_name } : null
}

export function deleteSession(db: Database.Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}
