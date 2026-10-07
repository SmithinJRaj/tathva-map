import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { CampusMap } from './components/CampusMap'
import { Legend } from './components/Legend'
import { MAP_ATTRIBUTION } from './config/mapConfig'
import { placesById, routablePlaces, type PlaceCategory } from './data/campus'
import { minutesFor } from './hooks/useRouting'
import type { RouteResult } from './lib/astar'
import type { TravelMode } from './lib/graph'
import { parseScannedNode, readStartNodeFromUrl, writeStartNodeToUrl } from './lib/startNode'

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

type ZoomControls = { zoomIn: () => void; zoomOut: () => void } | null

function App() {
  const [startId, setStartId] = useState<string | null>(readStartNodeFromUrl)
  const [goalId, setGoalId] = useState<string | null>(null)
  const [mode, setMode] = useState<TravelMode>('walk')
  const [hidden, setHidden] = useState<ReadonlySet<PlaceCategory>>(() => new Set())
  const [flyToken, setFlyToken] = useState(0)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [zoom, setZoom] = useState<ZoomControls>(null)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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
    setFlyToken((t) => t + 1)
    writeStartNodeToUrl(id)
    showToast(`You are at ${placesById.get(id)!.name}`)
  }, [])

  const handleRouteTo = useCallback((placeId: string) => {
    setGoalId(placeId)
    showToast(`Routing to ${placesById.get(placeId)!.name}`)
  }, [])

  const toggleCategory = useCallback((category: PlaceCategory) => {
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(category)) next.add(category)
      return next
    })
  }, [])

  const swap = () => {
    setStartId(goalId)
    setGoalId(startId)
  }

  const noRoute = startId && goalId && startId !== goalId && !route

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CampusMap
        startId={startId}
        goalId={goalId}
        mode={mode}
        hidden={hidden}
        flyToken={flyToken}
        onRoute={setRoute}
        onRouteTo={handleRouteTo}
        onZoomControls={setZoom}
      />

      {/* Sits over the map and under the chrome; never takes a click. */}
      <div className="space-haze pointer-events-none absolute inset-0 z-[500]" aria-hidden />

      {/* --- Trip planner ------------------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-2.5">
        <div className="slab pointer-events-auto mx-auto max-w-md p-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <PlaceField label="From" value={startId} onChange={setStartId} />
              <PlaceField label="To" value={goalId} onChange={setGoalId} />
            </div>
            <button
              type="button"
              className="btn h-9 w-9 shrink-0 p-0"
              onClick={swap}
              disabled={!startId && !goalId}
              aria-label="Swap start and destination"
              title="Swap"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M5 2h2v9h2l-3 3-3-3h2V2zM11 14H9V5H7l3-3 3 3h-2v9z" />
              </svg>
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="seg">
              <ModeButton current={mode} value="walk" onChange={setMode}>
                Walk
              </ModeButton>
              <ModeButton current={mode} value="drive" onChange={setMode}>
                Drive
              </ModeButton>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {route && (
                <p
                  className="pix whitespace-nowrap"
                  style={{ color: mode === 'walk' ? 'var(--amber)' : 'var(--cyan)' }}
                >
                  {Math.round(route.distance)}m · {minutesFor(route.distance, mode)}min
                </p>
              )}
              {(startId || goalId) && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setStartId(null)
                    setGoalId(null)
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {noRoute && (
            <p className="pix-sm mt-2" style={{ color: 'var(--red)' }}>
              {mode === 'drive' ? 'No road route — try walking' : 'No path between these points'}
            </p>
          )}
        </div>
      </div>

      {/* --- Legend ------------------------------------------------------------------- */}
      <Legend
        order={CATEGORY_ORDER}
        labels={CATEGORY_LABELS}
        hidden={hidden}
        onToggle={toggleCategory}
      />

      {/* --- Zoom + scan -------------------------------------------------------------- */}
      <div className="absolute right-3 bottom-5 z-[1000] flex flex-col items-end gap-2">
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

      {/* Required by the ODbL licence on the map data. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="pix-sm absolute bottom-0.5 left-1/2 z-[1000] -translate-x-1/2 px-1 whitespace-nowrap"
        style={{ color: 'var(--muted)', textTransform: 'none' }}
      >
        {MAP_ATTRIBUTION}
      </a>

      {toast && (
        <div
          className="toast slab pix-sm absolute bottom-24 left-1/2 z-[1000] px-3 py-2"
          style={{ color: 'var(--ink)' }}
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
}: {
  label: string
  value: string | null
  onChange: (id: string | null) => void
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
