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
 *
 * One per *point*, not per id. A flagship venue sits on exactly the host's position — Robowars
 * on the Open Air Theatre — and both ids go into the live set so that both the pin and the
 * shape light up. Drawing a beacon for each would stack two on the same pixel.
 */
export function liveDotPlaces(liveVenueIds: ReadonlySet<string>): LiveDot[] {
  const seen = new Set<string>()
  return [...liveVenueIds]
    .sort()
    .flatMap((id) => {
      const place = placesById.get(id)
      if (!place) return []
      const at = `${place.position[0]},${place.position[1]}`
      if (seen.has(at)) return []
      seen.add(at)
      return [{ id, position: place.position }]
    })
}
