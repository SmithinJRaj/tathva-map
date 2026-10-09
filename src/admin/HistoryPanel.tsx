import { useEffect, useRef, useState } from 'react'
import { adminApi, ApiError, type AuditEntry } from './api.ts'
import { changes, when } from './auditDiff.ts'

interface Props {
  eventId: string
  onUnauthorized?: () => void
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
