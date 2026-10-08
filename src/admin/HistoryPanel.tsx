import { useEffect, useRef, useState } from 'react'
import { formatIstDay, formatIstTime, istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { adminApi, ApiError, type AuditEntry } from './api.ts'

interface Props {
  eventId: string
  onUnauthorized?: () => void
}

const FIELDS = [
  'title', 'description', 'category', 'placeId', 'room', 'startAt', 'endAt',
  'originalStartAt', 'status', 'note',
] as const satisfies readonly (keyof ScheduleEvent)[]

const TIME_FIELDS: ReadonlySet<string> = new Set(['startAt', 'endAt', 'originalStartAt'])

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (TIME_FIELDS.has(field)) {
    const iso = String(v)
    return `${formatIstDay(istDateKey(iso))} ${formatIstTime(iso)}`
  }
  if (field === 'placeId') return knownPlaces.get(String(v)) ?? String(v)
  return String(v)
}

function changes(entry: AuditEntry): { field: string; before: string; after: string }[] {
  if (!entry.before || !entry.after) return []
  return FIELDS.filter((f) => entry.before![f] !== entry.after![f]).map((field) => ({
    field,
    before: show(field, entry.before![field]),
    after: show(field, entry.after![field]),
  }))
}

function when(iso: string): string {
  return `${formatIstDay(istDateKey(iso))} ${formatIstTime(iso)}`
}

export function HistoryPanel({ eventId, onUnauthorized }: Props) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A ref, so a re-created callback from the parent doesn't refetch the history.
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => {
    unauthorized.current = onUnauthorized
  })

  useEffect(() => {
    let live = true
    adminApi
      .audit(eventId)
      .then((list) => live && setEntries([...list].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))))
      .catch((err) => {
        if (!live) return
        if (err instanceof ApiError && err.status === 401) unauthorized.current?.()
        else setError("Couldn't load history")
      })
    return () => {
      live = false
    }
  }, [eventId])

  if (error) return <p className="term admin-error" role="alert">{error}</p>
  if (!entries) return <p className="term admin-note">Loading…</p>
  if (entries.length === 0) return <p className="term admin-note">No history yet.</p>

  return (
    <ul className="history-list">
      {entries.map((entry) => (
        <li key={entry.id} className="history-item term">
          <div>
            {when(entry.at)} · {entry.admin} · {entry.action}
          </div>
          <ul className="history-changes">
            {changes(entry).map((c) => (
              <li key={c.field}>
                {c.field}: {c.before} → {c.after}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
