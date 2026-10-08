import { z } from 'zod'
import { knownPlaces } from './places.ts'

export const CATEGORIES = ['workshop', 'competition', 'talk', 'cultural', 'proshow', 'other'] as const
export type Category = (typeof CATEGORIES)[number]
export type EventStatus = 'scheduled' | 'cancelled'

export interface ScheduleEvent {
  id: string
  title: string
  description: string | null
  category: Category
  placeId: string
  room: string | null
  startAt: string
  endAt: string
  /** Set once an event has been moved, so the UI can show the original time. */
  originalStartAt: string | null
  status: EventStatus
  note: string | null
  updatedAt: string
  updatedBy: string
}

export interface ScheduleResponse {
  version: number
  generatedAt: string
  events: ScheduleEvent[]
}

export type EventFields = Omit<ScheduleEvent, 'id' | 'updatedAt' | 'updatedBy'>

const optionalText = (max: number) => z.string().max(max).nullish().transform((v) => v ?? null)
const utcTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString())

const eventFields = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: optionalText(1000),
  category: z.enum(CATEGORIES),
  placeId: z.string().refine((id) => knownPlaces.has(id), 'Unknown venue'),
  room: optionalText(80),
  startAt: utcTime,
  endAt: utcTime,
  note: optionalText(200),
})

export const eventInputSchema = eventFields.superRefine((v, ctx) => {
  if (v.endAt <= v.startAt) {
    ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start' })
  }
})
export type EventInput = z.output<typeof eventInputSchema>

// End-after-start for patches is checked after merging with the stored event.
export const eventPatchSchema = eventFields.partial().extend({
  updatedAt: z.string().min(1),
  correction: z.boolean().optional(),
})
export type EventPatch = z.output<typeof eventPatchSchema>

export const delaySchema = z.object({
  minutes: z.number().int().min(-1440).max(1440).refine((m) => m !== 0, 'Delay cannot be zero'),
  updatedAt: z.string().optional(),
})
export const cancelSchema = z.object({ note: z.string().max(200).optional(), updatedAt: z.string().optional() })
export const restoreSchema = z.object({ updatedAt: z.string().optional(), note: z.string().max(200).optional() })
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) })

export type FieldErrors = Record<string, string>

/** First message per top-level field, for showing next to form inputs. */
export function fieldErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
