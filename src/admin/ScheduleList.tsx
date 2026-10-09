import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { eventState, type EventState } from '../../shared/classify.ts'
import { istDateKey } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import { CATEGORIES, type Category, type ScheduleEvent } from '../../shared/schedule.ts'
import { EventRow } from '../components/EventRow.tsx'
import { dayLabel } from '../schedule/festDays.ts'
import { useNow } from '../schedule/useNow.ts'
import { adminApi, ApiError, type Admin } from './api.ts'
import { bulkChange, emptyBulkEdit, hasBulkEdit, type BulkEdit } from './bulk.ts'
import { filterEvents, type AdminFilters } from './filters.ts'

interface Props {
  admin: Admin
  onLogout: () => void
  onUnauthorized: () => void
  onAdd?: () => void
  onPaste?: () => void
  onHistory?: () => void
  onEdit?: (event: ScheduleEvent) => void
}

const allVenues = [...knownPlaces.entries()]
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name))

interface Toast {
  text: string
  action?: { label: string; run: () => void }
}

const POLL_MS = 30_000
const STATES: EventState[] = ['live', 'upcoming', 'ended', 'cancelled']

function parseMinutes(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw.trim())
  return Number.isInteger(n) && n !== 0 && Math.abs(n) <= 1440 ? n : null
}

export function ScheduleList({ admin, onLogout, onUnauthorized, onAdd, onPaste, onHistory, onEdit }: Props) {
  const now = useNow()
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [filters, setFilters] = useState<AdminFilters>({ day: null, placeId: null, state: null, search: '' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [edit, setEdit] = useState<BulkEdit>(emptyBulkEdit)
  const [bulkBusy, setBulkBusy] = useState(false)
  /** Kept on screen rather than in a toast: a partial failure is the thing you must read. */
  const [bulkReport, setBulkReport] = useState<{ done: string; failures: string[] } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  /** A 401 sends the organiser back to login; a network failure raises the banner. */
  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      if (err instanceof ApiError && err.status === 0) setOffline(true)
    },
    [onUnauthorized],
  )

  const refetch = useCallback(async () => {
    try {
      const res = await adminApi.schedule()
      setEvents(res.events)
      setLoaded(true)
      setOffline(false)
    } catch (err) {
      handleError(err)
    }
  }, [handleError])

  useEffect(() => {
    const first = window.setTimeout(() => void refetch(), 0)
    const timer = window.setInterval(() => void refetch(), POLL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [refetch])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const showToast = useCallback((t: Toast | null) => {
    window.clearTimeout(toastTimer.current)
    setToast(t)
    if (t) toastTimer.current = window.setTimeout(() => setToast(null), 8000)
  }, [])

  /** Runs one quick action; the event's own updatedAt is the optimistic-lock token. */
  async function act(run: () => Promise<ScheduleEvent>, done: (updated: ScheduleEvent) => Toast) {
    try {
      const updated = await run()
      setOffline(false)
      showToast(done(updated))
      void refetch()
    } catch (err) {
      handleError(err)
      if (err instanceof ApiError && err.status === 409 && err.current) {
        const mins = Math.max(0, Math.round((Date.now() - Date.parse(err.current.updatedAt)) / 60_000))
        showToast({
          text: `Changed by ${err.current.updatedBy} ${mins} min ago — reload?`,
          action: { label: 'Reload', run: () => { showToast(null); void refetch() } },
        })
      } else if (err instanceof ApiError && err.status === 400) {
        showToast({ text: 'That change was rejected' })
      } else if (err instanceof ApiError && err.status === 404) {
        showToast({ text: 'Event no longer exists', action: { label: 'Reload', run: () => { showToast(null); void refetch() } } })
      } else if (!(err instanceof ApiError && (err.status === 401 || err.status === 0))) {
        showToast({ text: 'Something went wrong, try again' })
      }
    }
  }

  function delay(e: ScheduleEvent, minutes: number) {
    void act(
      () => adminApi.delay(e.id, minutes, e.updatedAt),
      (updated) => ({
        text: minutes > 0
          ? `"${e.title}" delayed ${minutes} min`
          : `"${e.title}" moved ${-minutes} min earlier`,
        action: {
          label: 'Undo',
          run: () => void act(
            () => adminApi.delay(e.id, -minutes, updated.updatedAt),
            () => ({ text: `"${e.title}" back to its previous time` }),
          ),
        },
      }),
    )
  }

  function cancel(e: ScheduleEvent) {
    void act(
      () => adminApi.cancel(e.id, e.updatedAt),
      (updated) => ({
        text: `"${e.title}" cancelled`,
        action: {
          label: 'Undo',
          run: () => void act(
            () => adminApi.restore(e.id, updated.updatedAt),
            () => ({ text: `"${e.title}" restored` }),
          ),
        },
      }),
    )
  }

  function restore(e: ScheduleEvent) {
    void act(
      () => adminApi.restore(e.id, e.updatedAt),
      (updated) => ({
        text: `"${e.title}" restored`,
        action: {
          label: 'Undo',
          run: () => void act(
            () => adminApi.cancel(e.id, updated.updatedAt),
            () => ({ text: `"${e.title}" cancelled` }),
          ),
        },
      }),
    )
  }

  function customDelay(e: ScheduleEvent) {
    const raw = window.prompt('Delay in minutes (negative to move earlier, max 1440)', '45')
    if (raw === null) return
    const minutes = parseMinutes(raw)
    if (minutes === null) {
      showToast({ text: 'Enter a whole number of minutes between -1440 and 1440, not 0' })
      return
    }
    delay(e, minutes)
  }

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  /**
   * Applies one change to every selected event, one request each.
   *
   * Sequential and tolerant on purpose. Each write carries that event's own `updatedAt`, so an
   * event the bridge moved while the selection sat open fails its own lock and the rest still
   * go through; aborting the lot on the first failure would leave a half-applied batch with no
   * record of which half. The selection is left holding exactly what failed, so the fix is to
   * read the reasons and press Apply again.
   */
  async function applyBulk() {
    if (!hasBulkEdit(edit)) {
      showToast({ text: 'Fill in a time, venue or type first' })
      return
    }
    setBulkBusy(true)
    setBulkReport(null)
    let fresh: ScheduleEvent[]
    try {
      // Re-read before writing: the list may be up to 30 s stale, and a stale updatedAt would
      // fail every lock at once.
      fresh = (await adminApi.schedule()).events
      setEvents(fresh)
      setOffline(false)
    } catch (err) {
      setBulkBusy(false)
      handleError(err)
      showToast({ text: "Couldn't re-read the schedule, so nothing was changed" })
      return
    }

    const byId = new Map(fresh.map((e) => [e.id, e]))
    const failures: string[] = []
    const stillSelected = new Set<string>()
    let changed = 0
    let unchanged = 0

    for (const id of selected) {
      const event = byId.get(id)
      if (!event) {
        failures.push('one event no longer exists')
        continue
      }
      const change = bulkChange(event, edit)
      if (change.kind === 'skip') {
        unchanged++
        continue
      }
      if (change.kind === 'invalid') {
        failures.push(`${event.title}: ${change.reason}`)
        stillSelected.add(id)
        continue
      }
      try {
        await adminApi.patch(event.id, {
          ...change.fields,
          updatedAt: event.updatedAt,
          ...(change.correction ? { correction: true } : {}),
        })
        changed++
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setBulkBusy(false)
          onUnauthorized()
          return
        }
        failures.push(
          `${event.title}: ${
            err instanceof ApiError && err.status === 409
              ? `changed by ${err.current?.updatedBy ?? 'someone else'} meanwhile`
              : 'the server rejected it'
          }`,
        )
        stillSelected.add(id)
      }
    }

    setBulkBusy(false)
    setSelected(stillSelected)
    if (failures.length === 0) setEdit(emptyBulkEdit)
    const parts = [`${changed} updated`]
    if (unchanged > 0) parts.push(`${unchanged} already as asked`)
    if (failures.length > 0) parts.push(`${failures.length} not changed`)
    setBulkReport({ done: parts.join(', '), failures })
    void refetch()
  }

  const days = useMemo(
    () => [...new Set(events.map((e) => istDateKey(e.startAt)))].sort(),
    [events],
  )
  const venues = useMemo(
    () => [...new Set(events.map((e) => e.placeId))].sort((a, b) =>
      (knownPlaces.get(a) ?? a).localeCompare(knownPlaces.get(b) ?? b)),
    [events],
  )

  const groups = useMemo(() => {
    const shown = filterEvents(events, filters, now).sort(
      (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
    )
    const byDay = new Map<string, ScheduleEvent[]>()
    for (const e of shown) {
      const key = istDateKey(e.startAt)
      const list = byDay.get(key)
      if (list) list.push(e)
      else byDay.set(key, [e])
    }
    return [...byDay.entries()]
  }, [events, filters, now])

  const today = istDateKey(now)
  const set = (patch: Partial<AdminFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const setEditField = (patch: Partial<BulkEdit>) => setEdit((e) => ({ ...e, ...patch }))
  const shownIds = useMemo(() => groups.flatMap(([, list]) => list.map((e) => e.id)), [groups])
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id))

  return (
    <div className="admin-list">
      {offline && (
        <div className="admin-banner term" role="alert">
          Can't reach server
        </div>
      )}
      <header className="slab admin-head">
        <h1 className="pix admin-title">Schedule</h1>
        <span className="term">{admin.displayName}</span>
        <button type="button" className="btn btn-ghost" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div className="admin-filters">
        <label className="field">
          <span className="field-tag pix-sm">Day</span>
          <select value={filters.day ?? ''} onChange={(e) => set({ day: e.target.value || null })}>
            <option value="">All</option>
            {days.map((d) => (
              <option key={d} value={d}>{dayLabel(d, today)}</option>
            ))}
          </select>
          <span className="field-caret">▾</span>
        </label>
        <label className="field">
          <span className="field-tag pix-sm">Venue</span>
          <select value={filters.placeId ?? ''} onChange={(e) => set({ placeId: e.target.value || null })}>
            <option value="">All</option>
            {venues.map((id) => (
              <option key={id} value={id}>{knownPlaces.get(id) ?? id}</option>
            ))}
          </select>
          <span className="field-caret">▾</span>
        </label>
        <label className="field">
          <span className="field-tag pix-sm">State</span>
          <select
            value={filters.state ?? ''}
            onChange={(e) => set({ state: (e.target.value || null) as EventState | null })}
          >
            <option value="">All</option>
            {STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="field-caret">▾</span>
        </label>
        <label className="field">
          <span className="field-tag pix-sm">Find</span>
          <input
            className="term"
            type="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Title"
          />
        </label>
      </div>

      <div className="admin-tools">
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          Add event
        </button>
        <button type="button" className="btn" onClick={onPaste}>
          Add from text
        </button>
        <button type="button" className="btn btn-ghost" onClick={onHistory}>
          History
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSelected(allShownSelected ? new Set() : new Set(shownIds))}
          disabled={shownIds.length === 0}
        >
          {allShownSelected ? 'Clear selection' : `Select all ${shownIds.length}`}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="slab admin-bulk">
          <h2 className="pix-sm admin-bulk-title">
            Change {selected.size} event{selected.size === 1 ? '' : 's'}
          </h2>
          <p className="term admin-note">Anything left blank stays as it is. Times are IST, on each event's own day.</p>
          <div className="admin-bulk-fields">
            <label className="field">
              <span className="field-tag pix-sm">Start</span>
              <input
                type="time"
                className="term"
                value={edit.startTime}
                onChange={(e) => setEditField({ startTime: e.target.value })}
                aria-label="New start time"
              />
            </label>
            <label className="field">
              <span className="field-tag pix-sm">End</span>
              <input
                type="time"
                className="term"
                value={edit.endTime}
                onChange={(e) => setEditField({ endTime: e.target.value })}
                aria-label="New end time"
              />
            </label>
            <label className="field">
              <span className="field-tag pix-sm">Venue</span>
              <select value={edit.placeId} onChange={(e) => setEditField({ placeId: e.target.value })}>
                <option value="">Leave as is</option>
                {allVenues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <span className="field-caret">▾</span>
            </label>
            <label className="field">
              <span className="field-tag pix-sm">Type</span>
              <select value={edit.category} onChange={(e) => setEditField({ category: e.target.value as Category | '' })}>
                <option value="">Leave as is</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="field-caret">▾</span>
            </label>
          </div>
          <label className="term form-check">
            <input
              type="checkbox"
              checked={edit.correction}
              onChange={(e) => setEditField({ correction: e.target.checked })}
            />
            Correction — don't show these as delayed
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => void applyBulk()} disabled={bulkBusy}>
              {bulkBusy ? 'Applying…' : 'Apply'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Deselect all
            </button>
          </div>
        </div>
      )}

      {bulkReport && (
        <div className="slab admin-bulk-report term" role="status">
          <div className="audit-head">
            <span>{bulkReport.done}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setBulkReport(null)}>
              Dismiss
            </button>
          </div>
          {bulkReport.failures.length > 0 && (
            <ul>
              {bulkReport.failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loaded && !offline && <p className="term admin-note">Loading…</p>}
      {loaded && groups.length === 0 && <p className="term admin-note">No events match.</p>}

      {groups.map(([dateKey, list]) => (
        <section key={dateKey} className="slab admin-day">
          <h2 className="pix admin-day-title">{dayLabel(dateKey, today)}</h2>
          <ul className="admin-rows">
            {list.map((e) => {
              const state = eventState(e, now)
              return (
                <li key={e.id} className="admin-item">
                  <div className="admin-item-body">
                    <input
                      type="checkbox"
                      className="admin-pick"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      aria-label={`Select ${e.title}`}
                    />
                    <EventRow event={e} now={now} showVenue />
                    <span className="chip admin-state" data-state={state}>{state}</span>
                  </div>
                  <div className="admin-actions">
                    <button type="button" className="btn" onClick={() => delay(e, 15)}>+15</button>
                    <button type="button" className="btn" onClick={() => delay(e, 30)}>+30</button>
                    <button type="button" className="btn" onClick={() => customDelay(e)}>Delay…</button>
                    {e.status === 'cancelled' ? (
                      <button type="button" className="btn" onClick={() => restore(e)}>Restore</button>
                    ) : (
                      <button type="button" className="btn" onClick={() => cancel(e)}>Cancel</button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={() => onEdit?.(e)}>Edit</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {toast && (
        <div className="slab admin-toast term" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className="btn" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
