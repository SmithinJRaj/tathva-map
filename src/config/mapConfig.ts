import type L from 'leaflet'
import type { LatLngTuple } from 'leaflet'
// The campus art and the data traced onto it are generated together by
// scripts/build-campus-map.mjs, so the image corners below are exact rather than estimated.
import mapImageUrl from '../assets/map/nitc-campus.webp'
import campus from '../data/generated/campus.json'

export const MAP_IMAGE_URL: string = mapImageUrl

/** Native pixel size of the art. Places and path nodes are stored against this grid. */
export const MAP_IMAGE_SIZE = campus.image

/**
 * Geographic corners of the art as [[southLat, westLng], [northLat, eastLng]].
 * Whole OpenStreetMap tile edges at z18, so these are exact by construction.
 */
export const MAP_BOUNDS: L.LatLngBoundsLiteral = [
  [campus.bounds.south, campus.bounds.west],
  [campus.bounds.north, campus.bounds.east],
]

// --- Image pixels <-> coordinates ------------------------------------------------------

const { south: SOUTH, west: WEST, north: NORTH, east: EAST } = campus.bounds

// Leaflet's ImageOverlay stretches the art linearly in *projected* space, not in latitude,
// so the inverse has to go through Mercator too — the same maths the build script used.
const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const unmercator = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI

const MERC_NORTH = mercator(NORTH)
const MERC_SOUTH = mercator(SOUTH)

/**
 * Where the campus sits inside the art. The opening view frames this rather than the whole
 * image, which runs out into Kattangal and would start the user uselessly far out.
 */
export const CAMPUS_BOUNDS: L.LatLngBoundsLiteral = [
  imagePoint(campus.campusBox.minX, campus.campusBox.maxY),
  imagePoint(campus.campusBox.maxX, campus.campusBox.minY),
]

/** Required by the ODbL licence on the map data and tiles. Shown in the map corner. */
export const MAP_ATTRIBUTION = `${campus.attribution} · ${campus.generatedAt}`

// --- Swapping the art ------------------------------------------------------------------
//
// To re-render from OpenStreetMap (new extent, newer data, different zoom), edit BBOX/ZOOM
// in scripts/build-campus-map.mjs and run it: the image, the bounds, the places and the
// routing graph are all rebuilt together and stay consistent.
//
// To drop in hand-drawn art instead:
//   1. Put the file in src/assets/map/ and point the import above at it.
//   2. Replace MAP_IMAGE_SIZE and MAP_BOUNDS with its pixel size and true corners.
//   3. Re-trace anything whose position no longer matches, with the dev Polygon tool
//      (`npm run dev`, "Trace mode"), which emits image-pixel coordinates.
//
// Everything on the map is stored in image pixels and projected by `imagePoint` below, so
// steps 1-2 alone keep the app working: the campus moves with the picture.

// Behind and around the art: the `.space-bg` starfield in styles/retro.css, which owns both
// the colour and the stars. Do not set a `background` shorthand on the map container.

/**
 * Deliberately loose floor so the initial fit-to-image view is never clamped. The real min
 * zoom is computed at runtime so the whole image just fits (see FitMinZoom in CampusMap).
 */
export const FALLBACK_MIN_ZOOM = 10

/** Past the art's native resolution, which is where the campus labels read best. */
export const MAX_ZOOM = 20

/**
 * Nearest-neighbour upscaling. Off for the rendered basemap, whose labels and road casings
 * blur more kindly than they pixelate; turn it on for true pixel art.
 */
export const MAP_IMAGE_PIXELATED = false

/** How far past the image edges the user may pan, as a fraction of the bounds' size. */
export const MAX_BOUNDS_PAD = 0.1

/**
 * Projects a point on the art — x right, y down, in the pixels of MAP_IMAGE_SIZE — onto the
 * map. This is the single hinge between the picture and the world: move MAP_BOUNDS and every
 * place, path node and route follows the image.
 */
export function imagePoint(x: number, y: number): LatLngTuple {
  const lng = WEST + ((EAST - WEST) * x) / MAP_IMAGE_SIZE.width
  const lat = unmercator(MERC_NORTH + ((MERC_SOUTH - MERC_NORTH) * y) / MAP_IMAGE_SIZE.height)
  return [lat, lng]
}

/** The inverse of `imagePoint`, used by the dev Polygon tool to report traced pixels. */
export function imagePointOf(latlng: { lat: number; lng: number }): [number, number] {
  const x = ((latlng.lng - WEST) / (EAST - WEST)) * MAP_IMAGE_SIZE.width
  const y =
    ((mercator(latlng.lat) - MERC_NORTH) / (MERC_SOUTH - MERC_NORTH)) * MAP_IMAGE_SIZE.height
  return [x, y]
}

/** Projects a traced outline, e.g. `imageShape([[10, 20], [30, 20], [30, 40]])`. */
export function imageShape(points: readonly (readonly [number, number])[]): LatLngTuple[] {
  return points.map(([x, y]) => imagePoint(x, y))
}

export type MapMove = 'fly' | 'jump'

/**
 * How the map moves to a venue picked from the schedule: animated flight or instant jump.
 * Lite mode always jumps; this is the choice for everyone else.
 */
export const MAP_MOVE: MapMove = 'fly'
