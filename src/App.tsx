import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CampusMap } from './components/CampusMap'
import { EventSheet } from './components/EventSheet'
import { Legend } from './components/Legend'
import { NavPanel } from './components/NavPanel'
import { placesById, routablePlaces, type PlaceCategory } from './data/campus'
import { MAP_MOVE, type MapMove } from './config/mapConfig'
import { useGeolocation } from './hooks/useGeolocation'
import { useNavigation } from './hooks/useNavigation'
import { minutesFor, MY_LOCATION } from './hooks/useRouting'
import { distance as metresBetween, FIX_PROBLEM_MESSAGE, fixProblem } from './lib/geo'
import { nodesById } from './lib/graph'
import { ARRIVE_RADIUS_M } from './lib/navigation'
import type { RouteResult } from './lib/astar'
import type { TravelMode } from './lib/graph'
import { readEventIdFromUrl, withoutEventParam } from './lib/eventLink'
import { useLiteMode } from './lib/liteMode'
import { parseScannedNode, readStartNodeFromUrl, writeStartNodeToUrl } from './lib/startNode'
import { useScheduleData } from './schedule/ScheduleContext'

// html5-qrcode is large; load it only when the scanner opens (still precached for offline).
const QrScannerOverlay = lazy(() =>
  import('./components/QrScannerOverlay').then((m) => ({ default: m.QrScannerOverlay })),
)

const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  event: 'Events',
  academic: 'Academic',
  food: 'Food',
  amenity: 'Services',
  other: 'Hostels',
}

const CATEGORY_ORDER: PlaceCategory[] = ['event', 'academic', 'food', 'amenity', 'other']

type FocusTarget = { placeId: string; token: number; openPopup: boolean; move: MapMove }

type ZoomControls = { zoomIn: () => void; zoomOut: () => void } | null

function App() {
  const [lite, setLite] = useLiteMode()
  const move: MapMove = lite ? 'jump' : MAP_MOVE
  const [startId, setStartId] = useState<string | null>(readStartNodeFromUrl)
  const [goalId, setGoalId] = useState<string | null>(null)
  const [mode, setMode] = useState<TravelMode>('walk')
  const [hidden, setHidden] = useState<ReadonlySet<PlaceCategory>>(() => new Set())
  const [focus, setFocus] = useState<FocusTarget | null>(() =>
    startId ? { placeId: startId, token: 0, openPopup: false, move: 'jump' } : null,
  )
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [zoom, setZoom] = useState<ZoomControls>(null)
  const [scanning, setScanning] = useState(false)
  const [navigationRequested, setNavigationRequested] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const location = useGeolocation()

  /**
   * A fix the app refuses to act on, and why. Indoors a phone with no satellites and no
   * known wifi locates by IP address, which can land a district away - the same wrong answer
   * every map app gives. Snapping that to the campus network would put the user at the
   * nearest corner of the map and point every route outbound, so an unusable fix is treated
   * as no fix at all rather than quietly believed.
   */
  const problem = location.fix ? fixProblem(location.fix) : null
  const fix = problem ? null : location.fix

  /**
   * Once a fix is in, "From" means here unless the user has said otherwise — the same
   * default a phone map gives you. Derived rather than written into state, so it follows the
   * fix appearing or being cleared without an effect to keep the two in step.
   */
  const originId = startId ?? (fix ? MY_LOCATION : null)

  // There is nothing to navigate without a destination, so clearing one drops out of
  // navigation on its own rather than needing an effect to tidy up after it.
  const navigating = navigationRequested && goalId !== null
  const nav = useNavigation(route, fix, navigating)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  const handleScan = useCallback((text: string) => {
    setScanning(false)
    const id = parseScannedNode(text)
    if (!id) {
      showToast('Unrecognised QR code')
      return
    }
    setStartId(id)
    setFocus((f) => ({ placeId: id, token: (f?.token ?? 0) + 1, openPopup: false, move }))
    writeStartNodeToUrl(id)
    showToast(`You are at ${placesById.get(id)!.name}`)
  }, [move])

  const handleLocate = useCallback(
    (placeId: string) => {
      setFocus((f) => ({ placeId, token: (f?.token ?? 0) + 1, openPopup: true, move }))
    },
    [move],
  )

  // --- Opened from a shared event link ---------------------------------------------------
  // The cached schedule may predate the event, so "not found" waits for a fetch made since
  // the page loaded before saying so.
  const { events, fetchedAt } = useScheduleData()
  const sharedEventId = useRef(readEventIdFromUrl())
  const [openedAt] = useState(Date.now)
  useEffect(() => {
    const id = sharedEventId.current
    if (!id) return
    const event = events.find((e) => e.id === id)
    const settled = event || (fetchedAt !== null && fetchedAt >= openedAt)
    if (!settled) return
    sharedEventId.current = null
    window.history.replaceState(null, '', withoutEventParam())
    if (event && placesById.has(event.placeId)) handleLocate(event.placeId)
    else showToast('That event is no longer listed')
  }, [events, fetchedAt, openedAt, handleLocate])

  const handleRouteTo = useCallback((placeId: string) => {
    setGoalId(placeId)
    showToast(`Routing to ${placesById.get(placeId)!.name}`)
  }, [])

  // The first tap is also the permission prompt, which browsers only honour on a gesture.
  const handleLocateMe = useCallback(() => {
    if (location.status === 'idle' || location.status === 'error') location.start()
    setStartId(MY_LOCATION)
  }, [location])

  const startNavigation = useCallback(() => {
    if (location.status === 'idle') location.start()
    setStartId(MY_LOCATION)
    setNavigationRequested(true)
  }, [location])

  const stopNavigation = useCallback(() => setNavigationRequested(false), [])

  const toggleCategory = useCallback((category: PlaceCategory) => {
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(category)) next.add(category)
      return next
    })
  }, [])

  const swap = () => {
    setStartId(goalId)
    setGoalId(originId)
  }

  const noRoute = originId && goalId && originId !== goalId && !route
  const locating = location.status === 'locating'
  const hasFix = fix !== null
  const canNavigate = Boolean(route) && goalId !== null && location.status !== 'unsupported'
  const goalPlace = goalId ? placesById.get(goalId) : undefined
  const destination = goalPlace?.name ?? 'your destination'

  // Standing on the destination makes start and goal snap to the same node, which leaves no
  // route to follow. Measure the last few metres directly so arrival is announced rather
  // than the whole card just disappearing.
  //
  // Measured to where the route ends, not to the building's centre: a route can only reach
  // the path outside, and on a big building that is tens of metres from the middle of it
  // (56 m at the worst one here). Using the centre would mean never quite arriving.
  const goalNodeId = goalPlace ? (mode === 'drive' ? goalPlace.driveNodeId : goalPlace.nodeId) : null
  const goalNode = goalNodeId ? nodesById.get(goalNodeId) : undefined
  const atGoal =
    navigating && fix !== null && goalNode !== undefined
      ? metresBetween(fix, goalNode) <= ARRIVE_RADIUS_M
      : false

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CampusMap
        startId={originId}
        goalId={goalId}
        mode={mode}
        hidden={hidden}
        focus={focus}
        fix={fix}
        navigating={navigating}
        onRoute={setRoute}
        onRouteTo={handleRouteTo}
        onZoomControls={setZoom}
      />

      {/* Sits over the map and under the chrome; never takes a click. */}
      <div className="space-haze pointer-events-none absolute inset-0 z-[500]" aria-hidden />

      {/* --- Trip planner, or the navigation card that replaces it -------------------- */}
      {!navigating && (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-2.5">
        <div className="slab slab-solid pointer-events-auto mx-auto max-w-md p-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <PlaceField
                label="From"
                value={originId}
                onChange={setStartId}
                allowMyLocation={location.status !== 'unsupported'}
              />
              <PlaceField label="To" value={goalId} onChange={setGoalId} />
            </div>
            {/* One icon per field row, so nothing in the planner can outgrow a phone screen. */}
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                className={`btn icon-btn ${originId === MY_LOCATION && hasFix ? 'is-live' : ''}`}
                onClick={handleLocateMe}
                disabled={location.status === 'denied'}
                aria-label="Start from my location"
                title={
                  location.status === 'denied'
                    ? 'Location permission denied'
                    : 'Start from my location'
                }
              >
                {locating ? (
                  <span className="locate-spinner" aria-hidden />
                ) : (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M7 0h2v2.1a6 6 0 014.9 4.9H16v2h-2.1A6 6 0 019 13.9V16H7v-2.1A6 6 0 012.1 9H0V7h2.1A6 6 0 017 2.1V0zm1 4a4 4 0 100 8 4 4 0 000-8zm0 2.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="btn icon-btn"
                onClick={swap}
                disabled={!originId && !goalId}
                aria-label="Swap start and destination"
                title="Swap"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M5 2h2v9h2l-3 3-3-3h2V2zM11 14H9V5H7l3-3 3 3h-2v9z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="seg seg-full mt-2">
            <ModeButton current={mode} value="walk" onChange={setMode}>
              Walk
            </ModeButton>
            <ModeButton current={mode} value="drive" onChange={setMode}>
              Drive
            </ModeButton>
          </div>

          {route && (
            <p className="route-summary pix mt-2" data-mode={mode}>
              <span aria-hidden>&gt;</span> {Math.round(route.distance)} m · {minutesFor(route.distance, mode)} min{' '}
              {mode === 'walk' ? 'on foot' : 'by car'}
            </p>
          )}

          {(originId || goalId) && (
            <div className="mt-2 flex items-center gap-2">
              {canNavigate && !navigating && (
                <button type="button" className="btn btn-primary flex-1" onClick={startNavigation}>
                  Go
                </button>
              )}
              <button
                type="button"
                className={`btn btn-ghost icon-btn ${canNavigate && !navigating ? '' : 'ml-auto'}`}
                onClick={() => {
                  setStartId(null)
                  setGoalId(null)
                  setNavigationRequested(false)
                }}
                aria-label="Clear start and destination"
                title="Clear"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                  <path d="M2 2h3v3H2zM5 5h3v3H5zM8 8h3v3H8zM11 11h3v3h-3zM11 2h3v3h-3zM8 5h3v3H8zM5 8h3v3H5zM2 11h3v3H2z" />
                </svg>
              </button>
            </div>
          )}

          {noRoute && (
            <p className="pix-sm mt-2" style={{ color: 'var(--red)' }}>
              {mode === 'drive' ? 'No road route — try walking' : 'No path between these points'}
            </p>
          )}

          {problem && (
            <p className="pix-sm mt-2" style={{ color: 'var(--red)' }}>
              {FIX_PROBLEM_MESSAGE[problem]}
            </p>
          )}

          {!problem && originId === MY_LOCATION && location.message && (
            <p
              className="pix-sm mt-2"
              style={{ color: location.status === 'denied' ? 'var(--red)' : 'var(--muted)' }}
            >
              {location.message}
            </p>
          )}

          {/* GPS beside a building can be tens of metres out; say so rather than imply precision. */}
          {originId === MY_LOCATION && fix && fix.accuracy > 35 && (
            <p className="pix-sm mt-2" style={{ color: 'var(--muted)' }}>
              Weak signal — accurate to about {Math.round(fix.accuracy)}m
            </p>
          )}
        </div>
      </div>
      )}

      {navigating && (nav.state || atGoal) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1001] p-2.5">
          <NavPanel
            nav={nav.state}
            arrived={atGoal || Boolean(nav.state?.arrived)}
            mode={mode}
            destination={destination}
            recalculating={nav.recalculating}
            onStop={stopNavigation}
          />
        </div>
      )}

      {/* --- Legend ------------------------------------------------------------------- */}
      <Legend
        order={CATEGORY_ORDER}
        labels={CATEGORY_LABELS}
        hidden={hidden}
        onToggle={toggleCategory}
        lite={lite}
        onLiteChange={setLite}
      />

      {/* --- Zoom + scan -------------------------------------------------------------- */}
      <div
        className="absolute right-3 z-[1000] flex flex-col items-end gap-2"
        style={{ bottom: 'calc(56px + 20px)' }}
      >
        {zoom && (
          <div className="flex flex-col">
            <button type="button" className="btn px-3" onClick={zoom.zoomIn} aria-label="Zoom in">
              +
            </button>
            <button
              type="button"
              className="btn mt-1 px-3"
              onClick={zoom.zoomOut}
              aria-label="Zoom out"
            >
              −
            </button>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={() => setScanning(true)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3M7 12h10" />
          </svg>
          Scan QR
        </button>
      </div>

      <EventSheet onLocate={handleLocate} />

      {toast && (
        <div
          className="toast slab pix-sm absolute left-1/2 z-[1000] px-3 py-2"
          style={{ color: 'var(--ink)', bottom: 'calc(56px + 96px)' }}
        >
          {toast}
        </div>
      )}

      {scanning && (
        <Suspense fallback={null}>
          <QrScannerOverlay onScan={handleScan} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  )
}

function ModeButton({
  current,
  value,
  onChange,
  children,
}: {
  current: TravelMode
  value: TravelMode
  onChange: (mode: TravelMode) => void
  children: string
}) {
  return (
    <button
      type="button"
      className="seg-item"
      onClick={() => onChange(value)}
      aria-pressed={current === value}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
        {value === 'walk' ? (
          <path d="M8 0h2v2H8V0zM7 3h4v2h2v2h-2v2h1l1 5h-2l-1-4-1 1v3H8v-4l1-1V7H7l-2 3-2-1 3-5V3z" />
        ) : (
          <path d="M2 10V7l2-4h8l2 4v3h-1v2h-2v-2H5v2H3v-2H2zm2-3h8l-1-2H5L4 7zm0 1.5h2V10H4V8.5zm6 0h2V10h-2V8.5z" />
        )}
      </svg>
      {children}
    </button>
  )
}

function PlaceField({
  label,
  value,
  onChange,
  allowMyLocation = false,
}: {
  label: string
  value: string | null
  onChange: (id: string | null) => void
  allowMyLocation?: boolean
}) {
  // Over ninety places read as a wall of names; grouping them makes the list scannable.
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        places: routablePlaces.filter((p) => p.category === category),
      })).filter((g) => g.places.length > 0),
    [],
  )

  return (
    <label className="field">
      <span className="field-tag pix-sm" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Select location…</option>
        {allowMyLocation && <option value={MY_LOCATION}>My location</option>}
        {groups.map((group) => (
          <optgroup key={group.category} label={CATEGORY_LABELS[group.category]}>
            {group.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.floor > 0 ? ` (floor ${p.floor})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="field-caret" aria-hidden>
        <svg viewBox="0 0 10 6" className="h-2 w-3" fill="currentColor">
          <path d="M0 0h10L5 6z" />
        </svg>
      </span>
    </label>
  )
}

export default App
