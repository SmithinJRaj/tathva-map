import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  CATEGORIES,
  type Category,
  type EventInput,
  type EventPatch,
  type FieldErrors,
  type ScheduleEvent,
} from '../../shared/schedule.ts'
import { adminApi, ApiError } from './api.ts'
import { HistoryPanel } from './HistoryPanel.tsx'
import { fromIstInputs, toIstInputs } from './istInputs.ts'
import { VenuePicker } from './VenuePicker.tsx'

/** Everything the form holds as typed, so it survives a trip through the login screen. */
export interface EventDraft {
  title: string
  description: string
  category: Category
  placeId: string
  room: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  note: string
  correction: boolean
}

interface Props {
  event?: ScheduleEvent
  draft?: EventDraft
  onDraftChange?: (draft: EventDraft) => void
  onSaved: (event: ScheduleEvent) => void
  onCancel: () => void
  onUnauthorized?: () => void
}

function draftOf(event?: ScheduleEvent): EventDraft {
  const start = event ? toIstInputs(event.startAt) : { date: '', time: '' }
  const end = event ? toIstInputs(event.endAt) : { date: '', time: '' }
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    category: event?.category ?? 'other',
    placeId: event?.placeId ?? '',
    room: event?.room ?? '',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    note: event?.note ?? '',
    correction: false,
  }
}

const orNull = (s: string) => s.trim() || null

function Row({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <label className="field">
        <span className="field-tag pix-sm">{label}</span>
        {children}
      </label>
      {error && <p className="term admin-error" role="alert">{error}</p>}
    </div>
  )
}

export function EventForm({ event, draft, onDraftChange, onSaved, onCancel, onUnauthorized }: Props) {
  // The stored event the edit is measured against; a 409 "reload" replaces it.
  const [base, setBase] = useState(event)
  const [v, setV] = useState<EventDraft>(() => draft ?? draftOf(event))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ScheduleEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const onDraft = useRef(onDraftChange)
  useEffect(() => {
    onDraft.current = onDraftChange
  })
  useEffect(() => onDraft.current?.(v), [v])

  const set = (patch: Partial<EventDraft>) => setV((cur) => ({ ...cur, ...patch }))

  function fail(err: unknown) {
    if (!(err instanceof ApiError)) return setMessage('Something went wrong, try again')
    if (err.status === 401) return onUnauthorized?.()
    if (err.status === 400 && err.fields) {
      setErrors(err.fields)
      return setMessage('Fix the highlighted fields')
    }
    if (err.status === 409 && err.current) {
      const mins = Math.max(0, Math.round((Date.now() - Date.parse(err.current.updatedAt)) / 60_000))
      setConflict(err.current)
      return setMessage(`Changed by ${err.current.updatedBy} ${mins} min ago — reload?`)
    }
    if (err.status === 404) return setMessage('Event no longer exists')
    setMessage(err.status === 0 ? "Can't reach server" : 'Something went wrong, try again')
  }

  function reload() {
    if (!conflict) return
    setBase(conflict)
    setV(draftOf(conflict))
    setConflict(null)
    setMessage(null)
    setErrors({})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const startAt = fromIstInputs(v.startDate, v.startTime)
    const endAt = fromIstInputs(v.endDate, v.endTime)
    const local: FieldErrors = {}
    if (!startAt) local.startAt = 'Enter a valid start date and time'
    if (!endAt) local.endAt = 'Enter a valid end date and time'
    if (!startAt || !endAt) {
      setErrors(local)
      return setMessage('Fix the highlighted fields')
    }
    const next: EventInput = {
      title: v.title.trim(),
      description: orNull(v.description),
      category: v.category,
      placeId: v.placeId,
      room: orNull(v.room),
      startAt,
      endAt,
      note: orNull(v.note),
    }
    setBusy(true)
    setErrors({})
    setMessage(null)
    setConflict(null)
    try {
      if (base) {
        const patch: EventPatch = { updatedAt: base.updatedAt }
        const changed = Object.fromEntries(
          (Object.keys(next) as (keyof EventInput)[]).filter((k) => next[k] !== base[k]).map((k) => [k, next[k]]),
        )
        if (Object.keys(changed).length === 0 && !v.correction) {
          setMessage('Nothing changed')
          return
        }
        Object.assign(patch, changed)
        if (v.correction) patch.correction = true
        onSaved(await adminApi.patch(base.id, patch))
      } else {
        onSaved(await adminApi.create(next))
      }
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base) return
    if (!window.confirm(`Delete "${base.title}"? This removes it from the public schedule.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await adminApi.remove(base.id)
      onCancel()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="slab admin-form" onSubmit={submit} noValidate>
      <h1 className="pix admin-title">{base ? 'Edit event' : 'Add event'}</h1>

      <Row label="Title" error={errors.title}>
        <input className="term" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} required />
      </Row>
      <Row label="About" error={errors.description}>
        <textarea className="term" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />
      </Row>
      <Row label="Type" error={errors.category}>
        <select value={v.category} onChange={(e) => set({ category: e.target.value as Category })}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="field-caret">▾</span>
      </Row>

      <VenuePicker value={v.placeId || null} onChange={(id) => set({ placeId: id })} />
      {errors.placeId && <p className="term admin-error" role="alert">{errors.placeId}</p>}

      <Row label="Room" error={errors.room}>
        <input className="term" value={v.room} onChange={(e) => set({ room: e.target.value })} maxLength={80} />
      </Row>

      <div className="form-times">
        <Row label="Start">
          <input type="date" className="term" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} aria-label="Start date" required />
          <input type="time" className="term" value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} aria-label="Start time" required />
        </Row>
        {errors.startAt && <p className="term admin-error" role="alert">{errors.startAt}</p>}
        <Row label="End">
          <input type="date" className="term" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} aria-label="End date" required />
          <input type="time" className="term" value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} aria-label="End time" required />
        </Row>
        {errors.endAt && <p className="term admin-error" role="alert">{errors.endAt}</p>}
        <p className="term admin-note">Times are IST.</p>
      </div>

      <Row label="Note" error={errors.note}>
        <input className="term" value={v.note} onChange={(e) => set({ note: e.target.value })} maxLength={200} />
      </Row>

      {base && (
        <label className="term form-check">
          <input type="checkbox" checked={v.correction} onChange={(e) => set({ correction: e.target.checked })} />
          Correction — don't show as delayed
        </label>
      )}

      {message && (
        <p className="term admin-error" role="alert">
          {message}
          {conflict && (
            <>
              {' '}
              <button type="button" className="btn" onClick={reload}>Reload</button>
            </>
          )}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {base ? 'Save' : 'Create'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {base && (
          <>
            <button type="button" className="btn" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
              History
            </button>
            <button type="button" className="btn form-delete" onClick={remove} disabled={busy}>
              Delete
            </button>
          </>
        )}
      </div>

      {base && showHistory && <HistoryPanel eventId={base.id} onUnauthorized={onUnauthorized} />}
    </form>
  )
}
