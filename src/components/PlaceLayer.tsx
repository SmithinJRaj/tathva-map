import type L from 'leaflet'
import { Pane, Polygon, Popup, useMap } from 'react-leaflet'
import { effectiveCategory, placesWithOutline, type PlaceCategory } from '../data/campus'
import { useScheduleData } from '../schedule/ScheduleContext'
import { registerPlaceLayer } from './layerRegistry'
import { PlacePopup } from './PlacePopup'

/** Above the map image (250), below the default overlay pane (400) where the route line lives. */
export const PLACES_PANE = 'places'

const CATEGORY_COLORS: Record<PlaceCategory, string> = {
  academic: '#41a6f6',
  food: '#ef7d57',
  event: '#ffcd75',
  amenity: '#a7f070',
  other: '#94b0c2',
}

// The art already draws and labels every building, so this layer is a category tint and a
// click target, not a second outline. Full weight is saved for hover and the open popup.
const baseStyle = (color: string, live = false): L.PathOptions => ({
  className: live ? 'place-live' : undefined,
  color,
  weight: 1.5,
  opacity: 0.55,
  fillColor: color,
  fillOpacity: 0.12,
  lineJoin: 'miter',
  lineCap: 'butt',
})

const activeStyle = (color: string, live = false): L.PathOptions => ({
  ...baseStyle(color, live),
  weight: 3,
  opacity: 1,
  fillOpacity: 0.38,
})

// Touch browsers emulate mouseover on tap but never send the matching mouseout, which
// would leave a polygon stuck highlighted. Only react to hover where hover really exists;
// on touch the popupopen/popupclose handlers give the highlight instead.
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches

/** About half the map's height, clamped, so long popups scroll instead of running off-screen. */
function popupMaxHeight(map: L.Map): number {
  return Math.min(360, Math.max(200, Math.round(map.getSize().y / 2)))
}

// Leaflet types event targets as `any`; narrow to the one thing we call on them.
const pathOf = (e: L.LeafletEvent) => e.target as L.Polygon

interface Props {
  /** False while the dev polygon tool is tracing, so clicks reach the map instead. */
  interactive: boolean
  /** Categories switched off in the legend. */
  hidden: ReadonlySet<PlaceCategory>
  onRouteTo: (placeId: string) => void
}

export function PlaceLayer({ interactive, hidden, onRouteTo }: Props) {
  const map = useMap()
  const { eventVenueIds, liveVenueIds } = useScheduleData()
  return (
    <Pane name={PLACES_PANE} style={{ zIndex: 350 }}>
      {placesWithOutline.filter((p) => !hidden.has(effectiveCategory(p, eventVenueIds))).map((place) => {
        const color = CATEGORY_COLORS[effectiveCategory(place, eventVenueIds)]
        const live = liveVenueIds.has(place.id)
        return (
          <Polygon
            ref={(polygon) => registerPlaceLayer(place.id, polygon)}
            // `interactive` is only read when Leaflet creates the path, so remount on change.
            key={`${place.id}-${interactive}`}
            positions={place.polygon!}
            pathOptions={baseStyle(color, live)}
            interactive={interactive}
            eventHandlers={{
              mouseover: (e) => {
                if (canHover) pathOf(e).setStyle(activeStyle(color, live))
              },
              mouseout: (e) => {
                const path = pathOf(e)
                if (canHover && !path.isPopupOpen()) path.setStyle(baseStyle(color, live))
              },
              popupopen: (e) => {
                pathOf(e).setStyle(activeStyle(color, live))
                // Read at open time so it follows rotation/resizes. react-leaflet re-runs the
                // popup layout after rendering its content, which picks this value up.
                e.popup.options.maxHeight = popupMaxHeight(map)
              },
              popupclose: (e) => pathOf(e).setStyle(baseStyle(color, live)),
            }}
          >
            {interactive && (
              <Popup
                // Without this, react-leaflet puts the popup in the enclosing <Pane> (z 350),
                // underneath the marker pane (600) and the route line (400).
                pane="popupPane"
                className="retro-popup"
                maxWidth={260}
                minWidth={200}
                // Keep the popup clear of the From/To panel at the top of the screen.
                autoPanPaddingTopLeft={[16, 170]}
                autoPanPaddingBottomRight={[16, 16]}
              >
                <PlacePopup place={place} onRouteTo={onRouteTo} />
              </Popup>
            )}
          </Polygon>
        )
      })}
    </Pane>
  )
}
