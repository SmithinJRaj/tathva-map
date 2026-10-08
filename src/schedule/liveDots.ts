import type { LatLngTuple } from 'leaflet'
import { placesById } from '../data/campus'

export interface LiveDot {
  id: string
  position: LatLngTuple
}

/**
 * Where to draw a live beacon: one per venue with something on, sorted so the markers keep a
 * stable order between polls. `liveVenueIds` is already keyed by building, so a room's event
 * lands on its host; ids the map can't place are skipped.
 */
export function liveDotPlaces(liveVenueIds: ReadonlySet<string>): LiveDot[] {
  return [...liveVenueIds]
    .sort()
    .flatMap((id) => {
      const place = placesById.get(id)
      return place ? [{ id, position: place.position }] : []
    })
}
