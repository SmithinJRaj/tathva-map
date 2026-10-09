import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { adminApi, ApiError, type AuditEntry } from './api.ts'
import { changes, titleOf, when } from './auditDiff.ts'
import { applyRevert, revertPlan } from './revert.ts'

interface Props {
  onBack: () => void
  onUnauthorized: () => void
}

/** Enough to cover a day of a fest without pulling the whole log. */
const LIMIT = 300

/** The author the sheet importer writes under; 100-odd of these would drown the log. */
const IMPORT_AUTHOR = 'import'

export function AuditLog({ onBack, onUnauthorized }: Props) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [events, setEvents] = useState<Map<string, ScheduleEvent>>(new Map())
  const [hideImports, setHideImports] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized()
      if (err instanceof ApiError && err.status === 409) {
        return setMessage('Someone else changed that event just now — reloaded, try again')
      }
      if (err instanceof ApiError && err.status === 404) return setMessage('That event no longer exists')
      setMessage(err instanceof ApiError && err.status === 0 ? "Can't reach server" : fallback)
    },
    [onUnauthorized],
  )

  const load = useCallback(async () => {
    try {
      const [log, schedule] = await Promise.all([adminApi.audit(undefined, LIMIT), adminApi.schedule()])
      setEntries(log)
      setEvents(new Map(schedule.events.map((e) => [e.id, e])))
    } catch (err) {
      fail(err, "Couldn't load the history")
    }
  }, [fail])

  // Deferred by a tick for the same reason the schedule list defers its first fetch: the load
  // sets state, and doing that during the effect starts a second render for nothing.
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(first)
  }, [load])

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (entries ?? []).filter(
      (e) =>
        (!hideImports || e.admin !== IMPORT_AUTHOR) &&
        (!needle || titleOf(e).toLowerCase().includes(needle)),
    )
  }, [entries, hideImports, search])

  async function revert(entry: AuditEntry) {
    const plan = revertPlan(entry)
    if (plan.kind === 'blocked') return setMessage(plan.reason)
    const event = events.get(entry.eventId)
    if (!event) return setMessage('That event no longer exists, so there is nothing to put back')
    const fields = [...Object.keys(plan.fields), ...(plan.status ? ['status'] : [])].join(', ')
    if (!window.confirm(`Put ${fields} back as they were on "${titleOf(entry)}"?`)) return
    setBusy(entry.id)
    setMessage(null)
    try {
      await applyRevert(adminApi, event, plan)
      setMessage(`Reverted ${fields} on "${titleOf(entry)}"`)
    } catch (err) {
      fail(err, 'That revert was rejected')
    } finally {
      setBusy(null)
      await load()
    }
  }

  return (
    <div className="admin-list">
      <header className="slab admin-head">
        <h1 className="pix admin-title">History</h1>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
      </header>

      <div className="admin-filters">
        <label className="field">
          <span className="field-tag pix-sm">Find</span>
          <input
            className="term"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Event title"
          />
        </label>
        <label className="term form-check">
          <input type="checkbox" checked={hideImports} onChange={(e) => setHideImports(e.target.checked)} />
          Hide sheet imports
        </label>
      </div>

      {message && (
        <p className="term admin-note audit-message" role="status">
          {message}
        </p>
      )}

      {!entries && <p className="term admin-note">Loading…</p>}
      {entries && shown.length === 0 && <p className="term admin-note">Nothing to show.</p>}

      <ul className="history-list audit-log">
        {shown.map((entry) => {
          const diffs = changes(entry)
          const plan = revertPlan(entry)
          return (
            <li key={entry.id} className="slab history-item term">
              <div className="audit-head">
                <span>
                  {when(entry.at)} · {entry.admin} · {entry.action}
                </span>
                <strong>{titleOf(entry)}</strong>
              </div>
              {diffs.length > 0 && (
                <ul className="history-changes">
                  {diffs.map((c) => (
                    <li key={c.field}>
                      {c.field}: {c.before} → {c.after}
                    </li>
                  ))}
                </ul>
              )}
              {plan.kind === 'revert' ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void revert(entry)}
                  disabled={busy !== null}
                >
                  {busy === entry.id ? 'Reverting…' : 'Revert'}
                </button>
              ) : (
                <p className="admin-note">{plan.reason}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
