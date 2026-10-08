import type { LatLngTuple } from 'leaflet'
import { imagePoint, imageShape } from '../config/mapConfig'
import generated from './generated/campus.json'
import { festContent, indoorPlaces, type PlaceContent, type PlaceFood } from './festContent'

export type { PlaceFood }

export type PlaceCategory = 'academic' | 'food' | 'event' | 'amenity' | 'other'

export interface Place {
  id: string
  name: string
  category: PlaceCategory
  /** Label point: an area's centroid, or the point itself. */
  position: LatLngTuple
  /** Footprint, for the places OpenStreetMap maps as an area. */
  polygon: LatLngTuple[] | null
  /** Where a walking route to this place starts and ends. */
  nodeId: string | null
  /** The same for driving: the nearest node a car can actually reach. */
  driveNodeId: string | null
  /** Ground level unless this is an indoor place. */
  floor: number
  /** Extra words that should find this place when searching; never displayed. */
  aliases?: readonly string[]
  description?: string
  food: PlaceFood[]
  amenities: string[]
}

const withContent = (content: PlaceContent | undefined) => ({
  description: content?.description,
  food: content?.food ?? [],
  amenities: content?.amenities ?? [],
})

const outdoor: Place[] = generated.places.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category as PlaceCategory,
  position: imagePoint(p.at[0], p.at[1]),
  polygon: p.outline ? imageShape(p.outline as [number, number][]) : null,
  nodeId: p.nodeId,
  driveNodeId: p.driveNodeId,
  floor: 0,
  ...('aliases' in p ? { aliases: p.aliases as readonly string[] } : {}),
  ...withContent(festContent[p.id]),
}))

const byId = new Map(outdoor.map((p) => [p.id, p]))

const indoor: Place[] = indoorPlaces.flatMap((room) => {
  const host = byId.get(room.inside)
  if (!host) {
    console.warn(`festContent: indoor place "${room.id}" sits in unknown place "${room.inside}"`)
    return []
  }
  return [
    {
      id: room.id,
      name: room.name,
      category: host.category,
      position: host.position,
      polygon: null,
      // Its own routing node, linked to the host's by lib/graph.ts. Cars stop at the host.
      nodeId: room.id,
      driveNodeId: host.driveNodeId,
      floor: room.floor,
      ...withContent(room.content),
    },
  ]
})

export const places: Place[] = [...outdoor, ...indoor]
export const placesById: ReadonlyMap<string, Place> = new Map(places.map((p) => [p.id, p]))

/** Everything that can be routed to, sorted for the From/To pickers. */
export const routablePlaces: Place[] = places
  .filter((p) => p.nodeId)
  .sort((a, b) => a.name.localeCompare(b.name))

export const placesWithOutline: Place[] = places.filter((p) => p.polygon)
export const placesWithoutOutline: Place[] = places.filter((p) => !p.polygon && p.floor === 0)

// A key that matches nothing means a building was renamed upstream and its schedule is now
// invisible. Say so in development rather than letting it disappear.
if (import.meta.env.DEV) {
  const orphans = Object.keys(festContent).filter((id) => !byId.has(id))
  if (orphans.length > 0) {
    console.warn(`festContent: no place matches ${orphans.map((o) => `"${o}"`).join(', ')}`)
  }
}

/** Places hosting a live or upcoming event show as event venues, whatever OpenStreetMap calls them. */
export function effectiveCategory(place: Place, eventVenueIds: ReadonlySet<string>): PlaceCategory {
  return eventVenueIds.has(place.id) ? 'event' : place.category
}

const hostOf = new Map(indoorPlaces.map((room) => [room.id, room.inside]))

/** The building a place is drawn as: an indoor room's host, or the place itself. */
export function hostPlaceId(placeId: string): string {
  return hostOf.get(placeId) ?? placeId
}
