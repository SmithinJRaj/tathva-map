/**
 * Reads what the WhatsApp bridge's announcement parser proposes and turns it into a draft the
 * admin form can be filled from.
 *
 * The bridge asks a language model to read a poster caption, so everything here arrives from
 * outside this service and none of it is trusted: a field that does not survive validation is
 * dropped and reported, never stored. Nothing on this path writes — the draft goes on screen
 * for a human to approve, which is the whole reason it is safe to let a model near it.
 *
 * Dropping one bad field rather than rejecting the whole payload is deliberate. A caption with
 * a readable title and an unreadable venue is still most of the work done; refusing it outright
 * would send the volunteer back to typing all of it.
 */

import { z } from 'zod'
import { knownPlaces } from '../../shared/places.ts'
import { CATEGORIES, type Category, type EventInput } from '../../shared/schedule.ts'

export interface AnnouncementDraft {
  /** True when nothing needed dropping and the draft is complete enough to save as-is. */
  ok: boolean
  /** What the parser could not work out, plus anything this validation threw away. */
  problems: string[]
  /** Only the fields that survived. The form supplies the rest. */
  draft: Partial<EventInput>
  placeName: string | null
  confidence: string | null
}

/** The shape the bridge promises. Anything beyond this is ignored rather than trusted. */
const payloadSchema = z.object({
  ok: z.boolean().nullish(),
  problems: z.array(z.string()).nullish(),
  draft: z.record(z.string(), z.unknown()).nullish(),
  placeName: z.string().nullish(),
  confidence: z.string().nullish(),
})

/**
 * The model answers in prose, so an absent optional field can come back as the four-letter
 * word "Null" — a truthy string that would store a room literally called Null. The bridge
 * normalises these itself; this repeats the guard because it is the last thing between a
 * model's text and a public map.
 */
const ABSENT = /^(?:null|none|nil|n\/a|na|undefined|unknown|tbd|tba|-+)$/i

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return !trimmed || ABSENT.test(trimmed) ? null : trimmed
}

/** An ISO instant with an offset, as the admin form's own times are. */
function instant(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const parsed = z.iso.datetime({ offset: true }).safeParse(raw)
  if (!parsed.success) return null
  return new Date(parsed.data).toISOString()
}

/** The member the bridge's schema carries so the model has a legal way to refuse a venue. */
const NOT_ON_MAP = 'NOT_ON_MAP'

export function normaliseAnnouncement(payload: unknown): AnnouncementDraft {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, problems: ['the parser answered in a shape this app cannot read'], draft: {}, placeName: null, confidence: null }
  }

  const problems = [...(parsed.data.problems ?? [])]
  const raw = parsed.data.draft ?? {}
  const draft: Partial<EventInput> = {}

  const title = text(raw.title)
  if (title) draft.title = title.slice(0, 120)
  else problems.push('no title in the text')

  for (const field of ['description', 'room', 'note'] as const) {
    const value = text(raw[field])
    if (value) draft[field] = value
  }

  const category = text(raw.category)?.toLowerCase()
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    draft.category = category as Category
  } else if (category) {
    problems.push(`"${category}" is not one of the event types, so pick one below`)
  }

  const placeId = text(raw.placeId)
  if (placeId && placeId !== NOT_ON_MAP && knownPlaces.has(placeId)) draft.placeId = placeId
  else if (placeId && placeId !== NOT_ON_MAP) problems.push(`the parser named a venue this map does not have ("${placeId}")`)

  const startAt = instant(raw.startAt)
  const endAt = instant(raw.endAt)
  if (startAt) draft.startAt = startAt
  else if (text(raw.startAt)) problems.push('could not read the start time')
  if (endAt) draft.endAt = endAt
  else if (text(raw.endAt)) problems.push('could not read the end time')
  // Both kept so the human can see which end is wrong; the form refuses to save it either way.
  if (startAt && endAt && endAt <= startAt) problems.push('the end time is not after the start time')

  const complete =
    draft.title !== undefined &&
    draft.placeId !== undefined &&
    draft.startAt !== undefined &&
    draft.endAt !== undefined
  return {
    ok: problems.length === 0 && complete,
    problems,
    draft,
    placeName: text(parsed.data.placeName),
    confidence: text(parsed.data.confidence),
  }
}
