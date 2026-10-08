import { eventState, timeShift } from '../../shared/classify.ts'
import { formatIstTime } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'

interface Props {
  event: ScheduleEvent
  now: Date
  showVenue: boolean
  /** Venue popups have room for the longer blurb; the sheet shows the note only. */
  showDescription?: boolean
  onSelect?: () => void
}

function status(event: ScheduleEvent, now: Date): { label: string; tone: string } | null {
  const state = eventState(event, now)
  if (state === 'cancelled') return { label: 'CANCELLED', tone: 'cancelled' }
  const shift = timeShift(event)
  if (shift === 'delayed') return { label: 'DELAYED', tone: 'delayed' }
  if (shift === 'early') return { label: 'EARLY', tone: 'early' }
  if (state === 'live') {
    const minutes = Math.ceil((Date.parse(event.endAt) - now.getTime()) / 60_000)
    return { label: `${minutes} min left`, tone: 'live' }
  }
  return null
}

export function EventRow({ event, now, showVenue, showDescription, onSelect }: Props) {
  const cancelled = event.status === 'cancelled'
  const shifted = timeShift(event) && event.originalStartAt
  const badge = status(event, now)
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

  const className = `event-row${cancelled ? ' is-cancelled' : ''}`
  const state = eventState(event, now)
  return onSelect ? (
    <button type="button" className={className} data-state={state} onClick={onSelect}>
      {content}
    </button>
  ) : (
    <div className={className} data-state={state}>
      {content}
    </div>
  )
}
