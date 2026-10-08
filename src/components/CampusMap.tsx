import L from 'leaflet'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ImageOverlay, MapContainer, Marker, Pane, Popup, useMap, useMapEvents } from 'react-leaflet'
import {
  CAMPUS_BOUNDS,
  FALLBACK_MIN_ZOOM,
  MAP_BOUNDS,
  MAP_IMAGE_PIXELATED,
  MAP_IMAGE_URL,
  type MapMove,
  MAX_BOUNDS_PAD,
  MAX_ZOOM,
} from '../config/mapConfig'
import { effectiveCategory, hostPlaceId, placesById, placesWithoutOutline, type PlaceCategory } from '../data/campus'
import { useRouting } from '../hooks/useRouting'
import type { RouteResult } from '../lib/astar'
import type { TravelMode } from '../lib/graph'
import { useScheduleData } from '../schedule/ScheduleContext'
import { getPlaceLayer, registerPlaceLayer } from './layerRegistry'
import { endpointIcon, placeIcon } from './markers'
import { PlaceLayer } from './PlaceLayer'
import { PLANNER_CLEARANCE_PX, SHEET_PEEK_PX } from './sheetSnap'
import { PlacePopup } from './PlacePopup'

const MAX_PAN_BOUNDS = L.latLngBounds(MAP_BOUNDS).pad(MAX_BOUNDS_PAD)

// `import.meta.env.DEV` is statically false in production builds, so this whole
// dynamic import (and the tool's chunk) is dropped from the bundle. In dev it still waits for
// `?dev=1`, so testing the app on a phone isn't covered by the tracing panel.
const PolygonTool =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev')
  ? lazy(() => import('./dev/PolygonTool').then((m) => ({ default: m.PolygonTool })))
  : null

interface Props {
  startId: string | null
  goalId: string | null
  mode: TravelMode
  hidden: ReadonlySet<PlaceCategory>
  /** A new token (even for the same place) re-centres the map, so re-scanning a QR still works. */
  focus: { placeId: string; token: number; openPopup: boolean; move: MapMove } | null
  onRoute: (route: RouteResult | null) => void
  onRouteTo: (placeId: string) => void
  onZoomControls: (controls: { zoomIn: () => void; zoomOut: () => void } | null) => void
}

/** Moves to a place, then optionally opens its popup, and pulses its shape for a moment. */
function FocusPlace({ focus }: Pick<Props, 'focus'>) {
  const map = useMap()
  useEffect(() => {
    const hostId = focus ? hostPlaceId(focus.placeId) : undefined
    const place = hostId ? placesById.get(hostId) : undefined
    if (!focus || !hostId || !place) return
    let timer: number | undefined
    let pulsed: HTMLElement | undefined

    const arrive = () => {
      const layer = getPlaceLayer(hostId) as L.Marker | L.Polygon | undefined
      if (!layer) return
      if (focus.openPopup) layer.openPopup()
      const el = layer.getElement() as HTMLElement | undefined
      if (!el) return
      el.classList.add('place-pulse')
      pulsed = el
      timer = window.setTimeout(() => el.classList.remove('place-pulse'), 1800)
    }

    if (focus.move === 'fly') {
      map.once('moveend', arrive)
      map.flyTo(place.position, 18, { duration: 1.2 })
    } else {
      map.setView(place.position, 18)
      arrive()
    }
    return () => {
      map.off('moveend', arrive)
      window.clearTimeout(timer)
      pulsed?.classList.remove('place-pulse')
    }
  }, [map, focus])
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
  focus,
  onRoute,
  onRouteTo,
  onZoomControls,
}: Props) {
  const [tracing, setTracing] = useState(false)
  const { eventVenueIds, liveVenueIds } = useScheduleData()

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
        .filter((place) => !hidden.has(effectiveCategory(place, eventVenueIds)))
        .map((place) => (
          <Marker
            key={place.id}
            ref={(marker) => registerPlaceLayer(place.id, marker)}
            position={place.position}
            icon={placeIcon(effectiveCategory(place, eventVenueIds), liveVenueIds.has(place.id))}
          >
            <Popup
              pane="popupPane"
              className="retro-popup"
              maxWidth={260}
              minWidth={200}
              autoPanPaddingTopLeft={[16, PLANNER_CLEARANCE_PX]}
              autoPanPaddingBottomRight={[16, 16 + SHEET_PEEK_PX]}
            >
              <PlacePopup place={place} onRouteTo={onRouteTo} />
            </Popup>
          </Marker>
        ))}

      <Endpoints startId={startId} goalId={goalId} />
      <FitMinZoom />
      <ZoomBridge onZoomControls={onZoomControls} />
      <RelaxBoundsWhilePopupOpen />
      <FocusPlace focus={focus} />
      <RouteLayer startId={startId} goalId={goalId} mode={mode} onRoute={onRoute} />
      {PolygonTool && (
        <Suspense fallback={null}>
          <PolygonTool active={tracing} onActiveChange={setTracing} />
        </Suspense>
      )}
    </MapContainer>
  )
}
