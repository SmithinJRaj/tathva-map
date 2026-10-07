import type { FastifyPluginAsync } from 'fastify'
import type { Store } from '../store.ts'
import type { ScheduleResponse } from '../../shared/schedule.ts'

export const publicRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/schedule', async (req, reply) => {
    const version = store.version()
    const etag = `"${version}"`
    reply.header('ETag', etag).header('Cache-Control', 'no-cache')
    if (req.headers['if-none-match'] === etag) return reply.code(304).send()
    const res: ScheduleResponse = { version, generatedAt: new Date().toISOString(), events: store.list() }
    return res
  })
}
