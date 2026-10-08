import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type Database from 'better-sqlite3'
import {
  SESSION_TTL_MS,
  checkLogin,
  createSession,
  deleteSession,
  getSessionAdmin,
} from '../auth.ts'
import type { Store } from '../store.ts'
import {
  cancelSchema,
  delaySchema,
  eventInputSchema,
  eventPatchSchema,
  loginSchema,
  restoreSchema,
} from '../../shared/schedule.ts'

const SESSION_COOKIE = 'tm_session'

interface Deps {
  db: Database.Database
  store: Store
  cookieSecure: boolean
}

export const adminRoutes: FastifyPluginAsync<Deps> = async (app, { db, store, cookieSecure }) => {
  /** The raw session token from the signed cookie, or null if absent or tampered with. */
  function sessionToken(req: FastifyRequest): string | null {
    const raw = req.cookies[SESSION_COOKIE]
    if (!raw) return null
    const un = req.unsignCookie(raw)
    return un.valid ? un.value : null
  }

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
    const token = sessionToken(req)
    const admin = token ? getSessionAdmin(db, token) : null
    if (!admin) return reply.code(401).send({ error: 'unauthorized' })
    req.admin = admin
  }

  app.post(
    '/api/admin/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { username, password } = loginSchema.parse(req.body)
      const admin = await checkLogin(db, username, password)
      if (!admin) return reply.code(401).send({ error: 'invalid_credentials' })
      const token = createSession(db, admin.username)
      reply.setCookie(SESSION_COOKIE, token, {
        signed: true,
        httpOnly: true,
        sameSite: 'strict',
        secure: cookieSecure,
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
      })
      return admin
    },
  )

  app.post('/api/admin/logout', async (req, reply) => {
    const token = sessionToken(req)
    if (token) deleteSession(db, token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.code(204).send()
  })


  await app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin)

    const who = (req: FastifyRequest) => req.admin!.username
    type IdParams = { Params: { id: string } }

    admin.get('/api/admin/me', async (req) => req.admin)

    admin.post('/api/admin/events', async (req, reply) => {
      const event = store.create(eventInputSchema.parse(req.body), who(req))
      return reply.code(201).send(event)
    })

    admin.patch<IdParams>('/api/admin/events/:id', async (req) =>
      store.edit(req.params.id, eventPatchSchema.parse(req.body), who(req)),
    )

    admin.post<IdParams>('/api/admin/events/:id/delay', async (req) => {
      const { minutes, updatedAt } = delaySchema.parse(req.body)
      return store.delay(req.params.id, minutes, who(req), updatedAt)
    })

    admin.post<IdParams>('/api/admin/events/:id/cancel', async (req) => {
      const { note, updatedAt } = cancelSchema.parse(req.body ?? {})
      return store.cancel(req.params.id, note, who(req), updatedAt)
    })

    admin.post<IdParams>('/api/admin/events/:id/restore', async (req) => {
      const { note, updatedAt } = restoreSchema.parse(req.body ?? {})
      return store.restore(req.params.id, note, who(req), updatedAt)
    })

    admin.delete<IdParams>('/api/admin/events/:id', async (req, reply) => {
      store.remove(req.params.id, who(req))
      return reply.code(204).send()
    })

    admin.get<{ Querystring: { event?: string } }>('/api/admin/audit', async (req) =>
      store.audit(req.query.event),
    )
  })
}
