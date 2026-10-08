import { useEffect, useState } from 'react'
import { eventState, timeShift } from '../../shared/classify.ts'
import { formatIstTime } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { shareEvent, type ShareOutcome } from '../lib/shareEvent'
import { eventStatus } from '../schedule/eventStatus'

interface Props {
  event: ScheduleEvent
  now: Date
  showVenue: boolean
  /** Venue popups have room for the longer blurb; the sheet shows the note only. */
  showDescription?: boolean
  onSelect?: () => void
  /** Adds a share button beside the row; a shared link opens the map on this event. */
  shareable?: boolean
}

export function EventRow({ event, now, showVenue, showDescription, onSelect, shareable }: Props) {
  const cancelled = event.status === 'cancelled'
  const shifted = timeShift(event) && event.originalStartAt
  const badge = eventStatus(event, now)
  const venue = knownPlaces.get(event.placeId) ?? 'Unknown venue'

  const content = (
    <>
      <span className="event-time">
        {shifted && <s className="event-time-old">{formatIstTime(event.originalStartAt!)}</s>}
        {formatIstTime(event.startAt)}
      </span>
      <span className="event-main">
        {/* The status sits at the end of the title line so it never wraps on its own. */}
        <span className="event-head">
          <span className="event-title">{event.title}</span>
          {badge && (
            <span className="event-status" data-tone={badge.tone}>
              {badge.label}
            </span>
          )}
        </span>
        <span className="event-meta">
          <span className="event-chip" data-category={event.category}>
            {event.category}
          </span>
          {showVenue && (
            <span className="event-venue">
              {venue}
              {event.room && ` · ${event.room}`}
            </span>
          )}
        </span>
        {event.note && <span className="event-note">{event.note}</span>}
        {showDescription && event.description && <span className="event-desc">{event.description}</span>}
      </span>
    </>
  )

  const className = `event-row${cancelled ? ' is-cancelled' : ''}${shareable ? ' has-share' : ''}`
  const state = eventState(event, now)
  const row = onSelect ? (
    <button type="button" className={className} data-state={state} data-tone={badge?.tone} onClick={onSelect}>
      {content}
    </button>
  ) : (
    <div className={className} data-state={state} data-tone={badge?.tone}>
      {content}
    </div>
  )
  if (!shareable) return row
  // A sibling of the row, not inside it: a button can't hold another button.
  return (
    <div className="event-card">
      {row}
      <ShareButton event={event} />
    </div>
  )
}

const SHARE_LABELS: Record<ShareOutcome, string> = {
  shared: 'Shared',
  copied: 'Copied',
  cancelled: '',
  failed: "Can't share",
}

function ShareButton({ event }: { event: ScheduleEvent }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)

  useEffect(() => {
    if (!outcome) return
    const timer = window.setTimeout(() => setOutcome(null), 2000)
    return () => window.clearTimeout(timer)
  }, [outcome])

  const label = outcome ? SHARE_LABELS[outcome] : ''
  return (
    <button
      type="button"
      className="event-share"
      aria-label={`Share ${event.title}`}
      title="Share"
      onClick={async () => setOutcome(await shareEvent(event))}
    >
      {label ? (
        <span className="event-share-done" data-failed={outcome === 'failed' || undefined} role="status">
          {label}
        </span>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M11 1h4v4h-4zM1 6h4v4H1zM11 11h4v4h-4zM5 7h2V6h2V5h2v2H9v1H7v1H5zM5 7v2h2v1h2v1h2v2H9v-1H7v-1H5V9z" />
        </svg>
      )}
    </button>
  )
}
