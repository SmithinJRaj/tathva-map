import { openDb } from './db.ts'
import { buildApp } from './app.ts'

const dbPath = process.env.DB_PATH
const secret = process.env.SESSION_SECRET
if (!dbPath) {
  console.error('DB_PATH is required (path to the SQLite file)')
  process.exit(1)
}
if (!secret || secret.length < 32) {
  console.error('SESSION_SECRET is required and must be at least 32 characters')
  process.exit(1)
}

const app = await buildApp({
  db: openDb(dbPath),
  cookieSecret: secret,
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  logger: true,
})

await app.listen({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
})
