import L from 'leaflet'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ImageOverlay, MapContainer, Marker, Pane, Popup, useMap, useMapEvents } from 'react-leaflet'
import {
  CAMPUS_BOUNDS,
  FALLBACK_MIN_ZOOM,
  MAP_BOUNDS,
  MAP_IMAGE_PIXELATED,
  MAP_IMAGE_URL,
  MAX_BOUNDS_PAD,
  MAX_ZOOM,
} from '../config/mapConfig'
import { placesById, placesWithoutOutline, type PlaceCategory } from '../data/campus'
import { useRouting } from '../hooks/useRouting'
import type { RouteResult } from '../lib/astar'
import type { TravelMode } from '../lib/graph'
import { endpointIcon, placeIcon } from './markers'
import { PlaceLayer } from './PlaceLayer'
import { PlacePopup } from './PlacePopup'

const MAX_PAN_BOUNDS = L.latLngBounds(MAP_BOUNDS).pad(MAX_BOUNDS_PAD)

// `import.meta.env.DEV` is statically false in production builds, so this whole
// dynamic import (and the tool's chunk) is dropped from the bundle.
const PolygonTool = import.meta.env.DEV
  ? lazy(() => import('./dev/PolygonTool').then((m) => ({ default: m.PolygonTool })))
  : null

interface Props {
  startId: string | null
  goalId: string | null
  mode: TravelMode
  hidden: ReadonlySet<PlaceCategory>
  /** Bumped on every calibration so re-scanning the same QR still re-centres the map. */
  flyToken: number
  onRoute: (route: RouteResult | null) => void
  onRouteTo: (placeId: string) => void
  onZoomControls: (controls: { zoomIn: () => void; zoomOut: () => void } | null) => void
}

function FlyToPlace({ placeId, token }: { placeId: string | null; token: number }) {
  const map = useMap()
  useEffect(() => {
    const place = placeId ? placesById.get(placeId) : undefined
    if (place) map.flyTo(place.position, 18, { duration: 1.2 })
  }, [map, placeId, token])
  return null
}

/** Min zoom = the zoom at which the whole image just fits the container; recomputed on resize. */
function FitMinZoom() {
  const map = useMap()
  useEffect(() => {
    const update = () => map.setMinZoom(map.getBoundsZoom(MAP_BOUNDS))
    update()
    map.on('resize', update)
    return () => {
      map.off('resize', update)
    }
  }, [map])
  return null
}

/** Hands the HUD's +/- buttons a handle on the map, since Leaflet's own control is off. */
function ZoomBridge({ onZoomControls }: Pick<Props, 'onZoomControls'>) {
  const map = useMap()
  useEffect(() => {
    onZoomControls({ zoomIn: () => map.zoomIn(1), zoomOut: () => map.zoomOut(1) })
    return () => onZoomControls(null)
  }, [map, onZoomControls])
  return null
}

/**
 * Popup autoPan needs to move the view, but with viscosity-1 maxBounds Leaflet snaps it straight
 * back on moveend (at fit zoom the bounds allow no panning at all), leaving a popup near the top
 * hidden under the From/To panel. Lift the bounds while a popup is open; closing it glides back.
 */
function RelaxBoundsWhilePopupOpen() {
  const map = useMapEvents({
    popupopen: () => map.setMaxBounds(undefined),
    popupclose: () => map.setMaxBounds(MAX_PAN_BOUNDS),
  })
  return null
}

function RouteLayer({
  startId,
  goalId,
  mode,
  onRoute,
}: Pick<Props, 'startId' | 'goalId' | 'mode' | 'onRoute'>) {
  const route = useRouting(startId, goalId, mode)
  useEffect(() => onRoute(route), [route, onRoute])
  return null
}

/** The labelled YOU / GOAL flags, which sit above every other pin. */
function Endpoints({ startId, goalId }: Pick<Props, 'startId' | 'goalId'>) {
  const ends = [
    { kind: 'start' as const, place: startId ? placesById.get(startId) : undefined },
    { kind: 'goal' as const, place: goalId ? placesById.get(goalId) : undefined },
  ]
  return (
    <Pane name="endpoints" style={{ zIndex: 650 }}>
      {ends.map(({ kind, place }) =>
        place ? (
          <Marker
            key={kind}
            position={place.position}
            icon={endpointIcon(kind)}
            interactive={false}
          />
        ) : null,
      )}
    </Pane>
  )
}

export function CampusMap({
  startId,
  goalId,
  mode,
  hidden,
  flyToken,
  onRoute,
  onRouteTo,
  onZoomControls,
}: Props) {
  const [tracing, setTracing] = useState(false)

  return (
    <MapContainer
      // Opens framed on the campus; MAX_PAN_BOUNDS still allows panning out to the edges.
      bounds={CAMPUS_BOUNDS}
      zoomSnap={0.25}
      minZoom={FALLBACK_MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      maxBounds={MAX_PAN_BOUNDS}
      maxBoundsViscosity={1}
      // .space-bg paints the starfield; an inline `background` here would be a shorthand
      // and would silently blow away its background-image.
      className="space-bg h-full w-full"
      zoomControl={false}
      attributionControl={false}
    >
      {/* Below the place polygons (350) and the default overlay pane (400) holding the route line. */}
      <Pane name="mapImage" style={{ zIndex: 250 }}>
        <ImageOverlay
          url={MAP_IMAGE_URL}
          bounds={MAP_BOUNDS}
          className={MAP_IMAGE_PIXELATED ? 'pixel-art' : undefined}
        />
      </Pane>
      <PlaceLayer interactive={!tracing} hidden={hidden} onRouteTo={onRouteTo} />

      {/* A polygon already shows where a place is, so only pin the ones mapped as a point. */}
      {placesWithoutOutline
        .filter((place) => !hidden.has(place.category))
        .map((place) => (
          <Marker key={place.id} position={place.position} icon={placeIcon(place.category)}>
            <Popup pane="popupPane" className="retro-popup" maxWidth={260} minWidth={200}>
              <PlacePopup place={place} onRouteTo={onRouteTo} />
            </Popup>
          </Marker>
        ))}

      <Endpoints startId={startId} goalId={goalId} />
      <FitMinZoom />
      <ZoomBridge onZoomControls={onZoomControls} />
      <RelaxBoundsWhilePopupOpen />
      <FlyToPlace placeId={startId} token={flyToken} />
      <RouteLayer startId={startId} goalId={goalId} mode={mode} onRoute={onRoute} />
      {PolygonTool && (
        <Suspense fallback={null}>
          <PolygonTool active={tracing} onActiveChange={setTracing} />
        </Suspense>
      )}
    </MapContainer>
  )
}
