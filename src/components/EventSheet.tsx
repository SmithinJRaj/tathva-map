import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import { classify } from '../../shared/classify.ts'
import { istDateKey } from '../../shared/ist.ts'
import { MAP_ATTRIBUTION } from '../config/mapConfig'
import { placesById } from '../data/campus'
import { dayLabel } from '../schedule/festDays'
import { useScheduleData } from '../schedule/ScheduleContext'
import { matchesQuery } from '../schedule/search'
import { stageDays, stageRemaining } from '../schedule/stage'
import { EventRow } from './EventRow'
import { nearestSnap, SHEET_PEEK_PX, sheetHeight, type SheetSnap } from './sheetSnap'

interface Props {
  onLocate: (placeId: string) => void
}

type Tab = 'live' | 'upcoming' | 'stage'

/** Pointer movement under this many pixels counts as a tap on the handle, not a drag. */
const TAP_SLOP_PX = 4

export function EventSheet({ onLocate }: Props) {
  const { events, now, stale, fetchedAt } = useScheduleData()
  const [snap, setSnap] = useState<SheetSnap>('peek')
  const [tab, setTab] = useState<Tab>('live')
  const [query, setQuery] = useState('')
  const [viewport, setViewport] = useState(() => window.innerHeight)
  const [drag, setDrag] = useState<{
    startY: number
    startHeight: number
    height: number
  } | null>(null)

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { live, upcomingByDay } = useMemo(
    () => classify(events.filter((e) => matchesQuery(e, query)), now),
    [events, now, query],
  )
  // The stage order is built from the unfiltered list on purpose: the search box filters what
  // is on, and a running order with acts missing out of the middle is worse than none.
  const stage = useMemo(() => stageDays(events, now), [events, now])
  const stageLeft = useMemo(() => stageRemaining(stage, now), [stage, now])
  const searching = query.trim() !== ''
  const upcomingCount = upcomingByDay.reduce((n, day) => n + day.events.length, 0)
  const todayKey = istDateKey(now)

  const height = drag ? drag.height : sheetHeight(snap, viewport)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ startY: e.clientY, startHeight: height, height })
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const raw = drag.startHeight + (drag.startY - e.clientY)
    const next = Math.min(sheetHeight('full', viewport), Math.max(SHEET_PEEK_PX, raw))
    setDrag({ ...drag, height: next })
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    if (Math.abs(drag.startY - e.clientY) < TAP_SLOP_PX) {
      setSnap(snap === 'peek' ? 'half' : 'peek')
    } else {
      setSnap(nearestSnap(drag.height, viewport))
    }
    setDrag(null)
  }

  // An event at a venue the map does not know still lists, just without tap-to-locate.
  const locatable = (placeId: string) =>
    placesById.has(placeId)
      ? () => {
          setSnap('peek')
          onLocate(placeId)
        }
      : undefined

  const offline =
    stale && fetchedAt !== null
      ? `Offline · ${Math.max(0, Math.round((now.getTime() - fetchedAt) / 60_000))} min ago`
      : null

  return (
    <section
      className="event-sheet slab slab-solid"
      style={{ height }}
      data-dragging={drag ? 'true' : undefined}
      aria-label="Live and upcoming events"
    >
      <div className="sheet-strip">
        <div
          className="sheet-handle"
          role="button"
          tabIndex={0}
          aria-expanded={snap !== 'peek'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setSnap(snap === 'peek' ? 'half' : 'peek')
            }
          }}
        >
          <span className="sheet-grip" aria-hidden />
          <p className="pix-sm sheet-summary">
            <span className="sheet-live" data-on={live.length > 0 ? 'true' : undefined}>
              <span className="live-dot" aria-hidden />
              Live {live.length}
            </span>
            <span className="sheet-next">Up next {upcomingCount}</span>
            {offline && <span className="sheet-offline">{offline}</span>}
            <span className="sheet-caret" aria-hidden>
              {snap === 'peek' ? '▲' : '▼'}
            </span>
          </p>
        </div>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pix-sm sheet-attribution"
        >
          {MAP_ATTRIBUTION}
        </a>
      </div>

      <div className="sheet-body">
        <div className="sheet-controls">
          <label className="field sheet-search">
            <span className="field-tag pix-sm" aria-hidden>
              Find
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Event, venue or type"
              aria-label="Search events"
              enterKeyHint="search"
            />
            {searching && (
              <button
                type="button"
                className="sheet-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </label>
          <div className="seg seg-full sheet-tabs">
            <button
              type="button"
              className="seg-item"
              aria-pressed={tab === 'live'}
              onClick={() => setTab('live')}
            >
              Live · {live.length}
            </button>
            <button
              type="button"
              className="seg-item"
              aria-pressed={tab === 'upcoming'}
              onClick={() => setTab('upcoming')}
            >
              Up next · {upcomingCount}
            </button>
            {stage.length > 0 && (
              <button
                type="button"
                className="seg-item"
                aria-pressed={tab === 'stage'}
                onClick={() => setTab('stage')}
              >
                Stage · {stageLeft}
              </button>
            )}
          </div>
        </div>

        {tab === 'live' &&
          (live.length === 0 ? (
            <p className="pix-sm sheet-empty">
              {searching ? `Nothing live matches "${query.trim()}"` : 'Nothing live right now'}
              <span>
                {upcomingCount > 0
                  ? "Check Up next for what's coming"
                  : searching
                    ? 'Try a shorter search'
                    : 'Nothing else is scheduled yet'}
              </span>
            </p>
          ) : (
            live.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                now={now}
                showVenue
                onSelect={locatable(event.placeId)}
                shareable
              />
            ))
          ))}

        {tab === 'upcoming' &&
          (upcomingByDay.length === 0 ? (
            <p className="pix-sm sheet-empty">
              {searching ? `Nothing coming up matches "${query.trim()}"` : 'Nothing else scheduled'}
              <span>{searching ? 'Try a shorter search' : "New events show up here as they're added"}</span>
            </p>
          ) : (
            upcomingByDay.map((day) => (
              <div key={day.dateKey}>
                <h3 className="pix-sm sheet-day">{dayLabel(day.dateKey, todayKey)}</h3>
                {day.events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    now={now}
                    showVenue
                    onSelect={locatable(event.placeId)}
                    shareable
                  />
                ))}
              </div>
            ))
          ))}
        {tab === 'stage' &&
          stage.map((day) => (
            <div key={day.dateKey}>
              <h3 className="pix-sm sheet-day">{dayLabel(day.dateKey, todayKey)}</h3>
              {day.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  now={now}
                  showVenue
                  onSelect={locatable(event.placeId)}
                  shareable
                />
              ))}
            </div>
          ))}
      </div>
    </section>
  )
}
