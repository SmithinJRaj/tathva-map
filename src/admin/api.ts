import type {
  EventInput,
  EventPatch,
  FieldErrors,
  ScheduleEvent,
  ScheduleResponse,
} from '../../shared/schedule.ts'
import { API_BASE } from '../schedule/api.ts'

export class ApiError extends Error {
  status: number
  fields?: FieldErrors
  current?: ScheduleEvent

  constructor(status: number, message: string, extra: { fields?: FieldErrors; current?: ScheduleEvent } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = extra.fields
    this.current = extra.current
  }
}

export interface Admin {
  username: string
  displayName: string
}

/**
 * What the announcement parser proposes, after the server has thrown out anything that did not
 * validate. `draft` holds only the fields that survived, so the form fills what it can and
 * leaves the rest to the person reading it; `problems` is what to tell them.
 */
export interface ParsedAnnouncement {
  ok: boolean
  problems: string[]
  draft: Partial<EventInput>
  placeName: string | null
  confidence: string | null
}

export interface AuditEntry {
  id: number
  at: string
  admin: string
  action: 'create' | 'edit' | 'delay' | 'cancel' | 'restore' | 'delete' | 'import'
  eventId: string
  before: ScheduleEvent | null
  after: ScheduleEvent | null
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Can't reach server")
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: { error?: string; fields?: FieldErrors; current?: ScheduleEvent } | null = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // non-JSON body (e.g. a proxy error page) falls through to the status check
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed: ${res.status}`, {
      fields: data?.fields,
      current: data?.current,
    })
  }
  return data as T
}

const enc = encodeURIComponent
const ev = (id: string) => `/admin/events/${enc(id)}`

export const adminApi = {
  me: () => request<Admin>('GET', '/admin/me'),
  login: (username: string, password: string) =>
    request<Admin>('POST', '/admin/login', { username, password }),
  logout: () => request<void>('POST', '/admin/logout'),
  schedule: () => request<ScheduleResponse>('GET', '/schedule'),
  create: (input: EventInput) => request<ScheduleEvent>('POST', '/admin/events', input),
  patch: (id: string, patch: EventPatch) => request<ScheduleEvent>('PATCH', ev(id), patch),
  delay: (id: string, minutes: number, updatedAt: string) =>
    request<ScheduleEvent>('POST', `${ev(id)}/delay`, { minutes, updatedAt }),
  cancel: (id: string, updatedAt: string, note?: string) =>
    request<ScheduleEvent>('POST', `${ev(id)}/cancel`, { updatedAt, note }),
  restore: (id: string, updatedAt: string) =>
    request<ScheduleEvent>('POST', `${ev(id)}/restore`, { updatedAt }),
  remove: (id: string) => request<void>('DELETE', ev(id)),
  audit: (id?: string, limit?: number) => {
    const q = new URLSearchParams()
    if (id) q.set('event', id)
    if (limit) q.set('limit', String(limit))
    return request<AuditEntry[]>('GET', `/admin/audit${q.size ? `?${q}` : ''}`)
  },
  // Reads text and proposes a draft. It writes nothing, so a bad parse costs a glance.
  parse: (text: string) => request<ParsedAnnouncement>('POST', '/admin/parse', { text }),
}
