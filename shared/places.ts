import campus from '../src/data/generated/campus.json' with { type: 'json' }
import { festVenues, indoorPlaces } from '../src/data/festContent.ts'

// Every place an event can be held at: place id -> display name.
export const knownPlaces: ReadonlyMap<string, string> = new Map([
  ...campus.places.map((p) => [p.id, p.name] as const),
  ...indoorPlaces.map((p) => [p.id, p.name] as const),
  ...festVenues.map((p) => [p.id, p.name] as const),
])
