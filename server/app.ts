import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import { RuleError } from '../shared/rules.ts'
import { fieldErrors } from '../shared/schedule.ts'
import { ConflictError, NotFoundError, createStore } from './store.ts'
import { publicRoutes } from './routes/public.ts'
import { adminRoutes } from './routes/admin.ts'

declare module 'fastify' {
  interface FastifyRequest {
    admin?: { username: string; displayName: string }
  }
}

export interface AppOptions {
  db: Database.Database
  cookieSecret: string
  cookieSecure: boolean
  logger?: boolean
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false })
  const store = createStore(opts.db)

  await app.register(cookie, { secret: opts.cookieSecret })
  await app.register(rateLimit, { global: false })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', fields: fieldErrors(err) })
    }
    if (err instanceof RuleError) {
      return reply.code(400).send({ error: 'validation', fields: { [err.field]: err.message } })
    }
    if (err instanceof NotFoundError) return reply.code(404).send({ error: 'not_found' })
    if (err instanceof ConflictError) return reply.code(409).send({ error: 'conflict', current: err.current })
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message })
    app.log.error(err)
    return reply.code(500).send({ error: 'internal' })
  })

  await app.register(publicRoutes, { store })
  await app.register(adminRoutes, { db: opts.db, store, cookieSecure: opts.cookieSecure })

  return app
}
