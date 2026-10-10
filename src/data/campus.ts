import type { LatLngTuple } from 'leaflet'
import { imagePoint, imageShape } from '../config/mapConfig'
import generated from './generated/campus.json'
import { festContent, festVenues, indoorPlaces, type PlaceContent, type PlaceFood } from './festContent'

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
  /**
   * Set when this place is a name for somewhere else — a room inside a building, or a fest
   * venue held on a ground. It is the host's generated id. Anchored places are never drawn:
   * the thing they sit on already is.
   */
  anchoredTo?: string
  /** Part of the main-stage running order. */
  stage?: true
  /**
   * Something people come looking for by name. Anchored like any other fest venue, but pinned
   * and labelled in its own right: the whole point of it is to be found.
   */
  flagship?: true
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

/** Map-data aliases and fest-content aliases both count; neither should shadow the other. */
const mergedAliases = (
  fromMap: readonly string[] | undefined,
  fromContent: readonly string[] | undefined,
): readonly string[] | undefined => {
  const all = [...(fromMap ?? []), ...(fromContent ?? [])]
  return all.length > 0 ? [...new Set(all)] : undefined
}

const outdoor: Place[] = generated.places.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category as PlaceCategory,
  position: imagePoint(p.at[0], p.at[1]),
  polygon: p.outline ? imageShape(p.outline as [number, number][]) : null,
  nodeId: p.nodeId,
  driveNodeId: p.driveNodeId,
  floor: 0,
  ...withContent(festContent[p.id]),
  // After withContent, which does not know about the generated ones.
  aliases: mergedAliases(
    'aliases' in p ? (p.aliases as readonly string[]) : undefined,
    festContent[p.id]?.aliases,
  ),
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
      anchoredTo: room.inside,
      ...withContent(room.content),
    },
  ]
})

const fest: Place[] = festVenues.flatMap((venue) => {
  const host = byId.get(venue.at)
  if (!host) {
    console.warn(`festContent: venue "${venue.id}" is held at unknown place "${venue.at}"`)
    return []
  }
  return [
    {
      id: venue.id,
      name: venue.name,
      category: 'event' as PlaceCategory,
      position: host.position,
      polygon: null,
      // Routes exactly as the host does, in both modes: it is the same patch of ground.
      nodeId: host.nodeId,
      driveNodeId: host.driveNodeId,
      floor: 0,
      anchoredTo: host.id,
      ...(venue.stage ? { stage: true as const } : {}),
      ...(venue.flagship ? { flagship: true as const } : {}),
      ...withContent(venue.content),
    },
  ]
})

export const places: Place[] = [...outdoor, ...indoor, ...fest]
export const placesById: ReadonlyMap<string, Place> = new Map(places.map((p) => [p.id, p]))

/** Everything that can be routed to, sorted for the From/To pickers. */
export const routablePlaces: Place[] = places
  .filter((p) => p.nodeId)
  .sort((a, b) => a.name.localeCompare(b.name))

export const placesWithOutline: Place[] = places.filter((p) => p.polygon)
// Anchored places share their host's position, so pinning them would stack a second marker
// on something already drawn.
export const placesWithoutOutline: Place[] = places.filter(
  (p) => !p.polygon && p.floor === 0 && !p.anchoredTo,
)

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

/** Part of the main-stage running order, for the Stage tab. */
export const stagePlaces: Place[] = fest.filter((p) => p.stage)

/** Labelled by name on the map: the stages and the flagship events. */
export const flagshipPlaces: Place[] = fest.filter((p) => p.flagship)

const hostOf = new Map(places.flatMap((p) => (p.anchoredTo ? [[p.id, p.anchoredTo] as const] : [])))
const hasOwnMarker = new Set(flagshipPlaces.map((p) => p.id))

/** The shape a place is drawn as: its host if it is anchored to one, or the place itself. */
export function hostPlaceId(placeId: string): string {
  return hostOf.get(placeId) ?? placeId
}

/**
 * Which marker's popup an event at this place belongs in.
 *
 * Not the same question as `hostPlaceId`. A room has no pin of its own, so ELHC 301's events
 * belong on ELHC's. A stage does have one, so the Informals Stage's acts belong on the stage —
 * putting them on the ATM Circle, which is what happens when the two questions are conflated,
 * files the fest's biggest stage under a cash machine.
 */
export function markerPlaceId(placeId: string): string {
  return hasOwnMarker.has(placeId) ? placeId : hostPlaceId(placeId)
}
