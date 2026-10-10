import L from 'leaflet'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react'
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
import {
  effectiveCategory,
  flagshipPlaces,
  markerPlaceId,
  placesById,
  placesWithoutOutline,
  type PlaceCategory,
} from '../data/campus'
import { useRouting } from '../hooks/useRouting'
import type { RouteResult } from '../lib/astar'
import type { TravelMode } from '../lib/graph'
import type { Fix } from '../hooks/useGeolocation'
import { liveDotPlaces } from '../schedule/liveDots'
import { useScheduleData } from '../schedule/ScheduleContext'
import { getPlaceLayer, registerPlaceLayer } from './layerRegistry'
import { LocationLayer } from './LocationLayer'
import { endpointIcon, flagshipIcon, liveDotIcon, placeIcon } from './markers'
import { PlaceLayer } from './PlaceLayer'
import { popupMaxHeight } from './popupSize'
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
  /** A new token (even for the same place) re-centres the map, so picking it twice still moves. */
  focus: { placeId: string; token: number; openPopup: boolean; move: MapMove } | null
  /** The live position, when the user has granted it. */
  fix: Fix | null
  /** Keep the map on the user, and stop re-framing the whole route on every recompute. */
  navigating: boolean
  onRoute: (route: RouteResult | null) => void
  onRouteTo: (placeId: string) => void
  onZoomControls: (controls: { zoomIn: () => void; zoomOut: () => void } | null) => void
}

/** Moves to a place, then optionally opens its popup, and pulses its shape for a moment. */
function FocusPlace({ focus }: Pick<Props, 'focus'>) {
  const map = useMap()
  useEffect(() => {
    // The marker, not the shape: focusing the Informals Stage should open the stage's popup,
    // not the popup of the junction it stands on.
    const hostId = focus ? markerPlaceId(focus.placeId) : undefined
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

/**
 * Frames the opening view so the campus fills the frame edge-to-edge, the way object-fit:
 * cover fills a box - cropping whichever axis runs long rather than Leaflet's own fitBounds,
 * which shows the whole of CAMPUS_BOUNDS and letterboxes the starfield into the gap on the
 * other axis. Runs as a layout effect so the correction lands before the first paint.
 */
function CoverCampusBounds() {
  const map = useMap()
  useLayoutEffect(() => {
    const bounds = L.latLngBounds(CAMPUS_BOUNDS)
    map.setView(bounds.getCenter(), map.getBoundsZoom(bounds, true), { animate: false })
  }, [map])
  return null
}

/**
 * Min zoom = the zoom at which the image just covers the container (no letterboxing, which
 * matters in the portrait frame); recomputed on resize. In the landscape frame the shapes match.
 */
function FitMinZoom() {
  const map = useMap()
  useEffect(() => {
    const update = () => map.setMinZoom(map.getBoundsZoom(MAP_BOUNDS, true))
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
 * Two things every popup needs, handled where the map itself is in scope.
 *
 * **Bounds.** Popup autoPan needs to move the view, but with viscosity-1 maxBounds Leaflet snaps
 * it straight back on moveend (at fit zoom the bounds allow no panning at all), leaving a popup
 * near the top hidden under the From/To panel. Lift the bounds while a popup is open; closing it
 * glides back.
 *
 * **Height.** A popup is otherwise as tall as its contents, with no way to scroll it: the
 * Informals Stage lists 21 acts, which ran 1858 px down an 813 px screen. Leaflet fires this on
 * the map before the source layer, and react-leaflet re-runs the popup layout after rendering
 * its content, so setting the option here is picked up. Read at open time so it follows a resize.
 */
function PopupBehaviour() {
  const map = useMapEvents({
    popupopen: (e) => {
      e.popup.options.maxHeight = popupMaxHeight(map)
      map.setMaxBounds(undefined)
    },
    popupclose: () => map.setMaxBounds(MAX_PAN_BOUNDS),
  })
  return null
}

function RouteLayer({
  startId,
  goalId,
  mode,
  fix,
  navigating,
  onRoute,
}: Pick<Props, 'startId' | 'goalId' | 'mode' | 'fix' | 'navigating' | 'onRoute'>) {
  const route = useRouting(startId, goalId, mode, fix, !navigating)
  useEffect(() => onRoute(route), [route, onRoute])
  return null
}

/**
 * A pulsing red beacon on every venue with an event on right now. Purely a signal: it takes no
 * clicks, so a tap on it still reaches the building or pin underneath and opens its popup.
 */
function LiveDots() {
  const { liveVenueIds } = useScheduleData()
  const dots = useMemo(() => liveDotPlaces(liveVenueIds), [liveVenueIds])
  return (
    <Pane name="liveDots" style={{ zIndex: 640, pointerEvents: 'none' }}>
      {dots.map((dot) => (
        <Marker key={dot.id} position={dot.position} icon={liveDotIcon()} interactive={false} />
      ))}
    </Pane>
  )
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
  fix,
  navigating,
  onRoute,
  onRouteTo,
  onZoomControls,
}: Props) {
  const [tracing, setTracing] = useState(false)
  const { eventVenueIds, liveVenueIds } = useScheduleData()

  return (
    <MapContainer
      // Starting view before CoverCampusBounds corrects it to fill the frame; MAX_PAN_BOUNDS
      // still allows panning out to the edges.
      bounds={CAMPUS_BOUNDS}
      zoomSnap={0.25}
      minZoom={FALLBACK_MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      maxBounds={MAX_PAN_BOUNDS}
      maxBoundsViscosity={1}
      // .map-void paints the hazard-stripe filler seen past the edge of the art; an inline
      // `background` here would be a shorthand and would silently blow away its background-image.
      className="map-void h-full w-full"
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
      {/* The flagship venues, labelled by name. Each sits on something already drawn — a
          junction, a ground, a lecture block — so an unlabelled pin there reads as that thing
          instead, which is exactly how the Informals Stage became unfindable. The events are
          known by their own name, not the building's: nobody is looking for the IT Lab Complex.
          Always shown; hiding these is not a thing anyone wants from the legend. */}
      {flagshipPlaces.map((place) => (
        <Marker
          key={place.id}
          ref={(marker) => registerPlaceLayer(place.id, marker)}
          position={place.position}
          icon={flagshipIcon(place.name, liveVenueIds.has(place.id))}
          zIndexOffset={1000}
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

      <LiveDots />
      <Endpoints startId={startId} goalId={goalId} />
      <LocationLayer fix={fix} follow={navigating} />
      <CoverCampusBounds />
      <FitMinZoom />
      <ZoomBridge onZoomControls={onZoomControls} />
      <PopupBehaviour />
      <FocusPlace focus={focus} />
      <RouteLayer
        startId={startId}
        goalId={goalId}
        mode={mode}
        fix={fix}
        navigating={navigating}
        onRoute={onRoute}
      />
      {PolygonTool && (
        <Suspense fallback={null}>
          <PolygonTool active={tracing} onActiveChange={setTracing} />
        </Suspense>
      )}
    </MapContainer>
  )
}
