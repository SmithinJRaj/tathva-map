import type L from 'leaflet'
import { useEffect } from 'react'
import { Pane, Polygon, Popup, useMap } from 'react-leaflet'
import { effectiveCategory, placesWithOutline, type PlaceCategory } from '../data/campus'
import { useScheduleData } from '../schedule/ScheduleContext'
import { getPlaceLayer, registerPlaceLayer } from './layerRegistry'
import { PlacePopup } from './PlacePopup'
import { popupMaxHeight } from './popupSize'
import { PLANNER_CLEARANCE_PX, SHEET_PEEK_PX } from './sheetSnap'

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
const baseStyle = (color: string): L.PathOptions => ({
  color,
  weight: 1.5,
  opacity: 0.55,
  fillColor: color,
  fillOpacity: 0.12,
  lineJoin: 'miter',
  lineCap: 'butt',
})

// react-leaflet calls setStyle whenever pathOptions changes identity, which would reset a
// highlighted polygon on every render. One object per colour keeps identity stable.
const baseStyles = new Map<string, L.PathOptions>()
const stableBase = (color: string): L.PathOptions => {
  let style = baseStyles.get(color)
  if (!style) baseStyles.set(color, (style = baseStyle(color)))
  return style
}

const activeStyle = (color: string): L.PathOptions => ({
  ...baseStyle(color),
  weight: 3,
  opacity: 1,
  fillOpacity: 0.38,
})

// Touch browsers emulate mouseover on tap but never send the matching mouseout, which
// would leave a polygon stuck highlighted. Only react to hover where hover really exists;
// on touch the popupopen/popupclose handlers give the highlight instead.
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches

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

  // Leaflet reads className only when it creates a path and setStyle never updates it, so
  // toggle the class on the element directly. Remounting would close an open popup. Runs
  // after children mount, and again when polygons remount (interactive) or reappear (hidden).
  useEffect(() => {
    for (const place of placesWithOutline) {
      const path = getPlaceLayer(place.id) as L.Polygon | undefined
      path?.getElement()?.classList.toggle('place-live', liveVenueIds.has(place.id))
    }
  }, [liveVenueIds, interactive, hidden, eventVenueIds])
  return (
    <Pane name={PLACES_PANE} style={{ zIndex: 350 }}>
      {placesWithOutline.filter((p) => !hidden.has(effectiveCategory(p, eventVenueIds))).map((place) => {
        const color = CATEGORY_COLORS[effectiveCategory(place, eventVenueIds)]
        return (
          <Polygon
            ref={(polygon) => {
              registerPlaceLayer(place.id, polygon)
              // The effect above can run before the pane has mounted any polygon.
              polygon?.getElement()?.classList.toggle('place-live', liveVenueIds.has(place.id))
            }}
            // `interactive` is only read when Leaflet creates the path, so remount on change.
            key={`${place.id}-${interactive}`}
            positions={place.polygon!}
            pathOptions={stableBase(color)}
            interactive={interactive}
            eventHandlers={{
              add: (e) =>
                pathOf(e).getElement()?.classList.toggle('place-live', liveVenueIds.has(place.id)),
              mouseover: (e) => {
                if (canHover) pathOf(e).setStyle(activeStyle(color))
              },
              mouseout: (e) => {
                const path = pathOf(e)
                if (canHover && !path.isPopupOpen()) path.setStyle(stableBase(color))
              },
              popupopen: (e) => {
                pathOf(e).setStyle(activeStyle(color))
                // Read at open time so it follows rotation/resizes. react-leaflet re-runs the
                // popup layout after rendering its content, which picks this value up.
                e.popup.options.maxHeight = popupMaxHeight(map)
              },
              popupclose: (e) => pathOf(e).setStyle(stableBase(color)),
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
                autoPanPaddingTopLeft={[16, PLANNER_CLEARANCE_PX]}
                autoPanPaddingBottomRight={[16, 16 + SHEET_PEEK_PX]}
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
