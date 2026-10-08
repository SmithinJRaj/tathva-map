// Small-area geometry: bearings, projection onto a path, and snapping a GPS fix to the
// campus network. No React, no Leaflet.
//
// Everything here works in a local flat frame rather than on the sphere. Over a campus —
// under two kilometres — treating a degree of latitude and longitude as constant metres is
// accurate to a few millimetres, and it turns projection onto a segment into ordinary
// two-dimensional algebra.

import { MAP_BOUNDS } from '../config/mapConfig'
import { graph, allowsMode, type GraphEdge, type TravelMode } from './graph'

export interface LatLng {
  lat: number
  lng: number
}

const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LNG_AT_EQUATOR = 111_320

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Metres per degree of longitude, which shrinks as you leave the equator. */
const lngScale = (lat: number) => M_PER_DEG_LNG_AT_EQUATOR * Math.cos(toRad(lat))

/** Flat local coordinates in metres, relative to `origin`. */
function toLocal(origin: LatLng, p: LatLng): { x: number; y: number } {
  return {
    x: (p.lng - origin.lng) * lngScale(origin.lat),
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  }
}

function fromLocal(origin: LatLng, x: number, y: number): LatLng {
  return {
    lat: origin.lat + y / M_PER_DEG_LAT,
    lng: origin.lng + x / lngScale(origin.lat),
  }
}

/** Straight-line distance in metres. */
export function distance(a: LatLng, b: LatLng): number {
  const { x, y } = toLocal(a, b)
  return Math.hypot(x, y)
}

/** Compass bearing from `a` to `b`, in degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng): number {
  const { x, y } = toLocal(a, b)
  return (toDeg(Math.atan2(x, y)) + 360) % 360
}

/** Signed turn from one bearing to another: negative is left, positive is right. */
export function turnAngle(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

export interface Projection {
  /** The closest point on the segment. */
  point: LatLng
  /** Where it fell, 0 at `a` and 1 at `b`. */
  t: number
  /** Distance from the query point to `point`, in metres. */
  distance: number
}

/** The closest point on segment a-b to p. */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): Projection {
  const pa = toLocal(a, p)
  const ba = toLocal(a, b)
  const lengthSquared = ba.x * ba.x + ba.y * ba.y
  // A zero-length segment is its own closest point.
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (pa.x * ba.x + pa.y * ba.y) / lengthSquared))
  const point = fromLocal(a, ba.x * t, ba.y * t)
  return { point, t, distance: distance(p, point) }
}

export interface Snap {
  /** The point on the network nearest the fix. */
  point: LatLng
  /** How far the fix was from the network, in metres. */
  distance: number
  /** The edge it landed on. */
  edge: GraphEdge
  /** The endpoint to route from: whichever end of that edge is nearer. */
  nodeId: string
}

/**
 * Puts a GPS fix onto the path network. A raw fix drifts off the path by more than the paths
 * are far apart, so routing straight from it would start the journey in the middle of a
 * building; snapping to the nearest edge keeps the start somewhere a person could stand.
 *
 * `mode` matters: a driver must not be snapped onto a footpath.
 */
export function snapToNetwork(fix: LatLng, mode: TravelMode): Snap | null {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  let best: Snap | null = null
  for (const edge of graph.edges) {
    if (!allowsMode(edge, mode)) continue
    const a = nodes.get(edge.from)
    const b = nodes.get(edge.to)
    if (!a || !b) continue
    const projection = projectOnSegment(fix, a, b)
    if (!best || projection.distance < best.distance) {
      best = {
        point: projection.point,
        distance: projection.distance,
        edge,
        nodeId: projection.t < 0.5 ? edge.from : edge.to,
      }
    }
  }
  return best
}

export interface PathProgress {
  /** Closest point on the path. */
  point: LatLng
  /** Index of the segment it fell on. */
  segment: number
  /** How far the fix is from the path, in metres. */
  offPath: number
  /** Distance from the path's start to `point`, in metres. */
  travelled: number
  /** Distance from `point` to the path's end, in metres. */
  remaining: number
}

/** Where a position sits along a path, and how far it has strayed from it. */
export function locateOnPath(path: readonly LatLng[], fix: LatLng): PathProgress | null {
  if (path.length < 2) return null

  // Cumulative length to the start of each segment, so `travelled` is one lookup.
  const cumulative: number[] = [0]
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(path[i - 1], path[i]))
  }
  const total = cumulative[cumulative.length - 1]

  let best: PathProgress | null = null
  for (let i = 0; i < path.length - 1; i++) {
    const projection = projectOnSegment(fix, path[i], path[i + 1])
    if (best && projection.distance >= best.offPath) continue
    const segmentLength = cumulative[i + 1] - cumulative[i]
    const travelled = cumulative[i] + segmentLength * projection.t
    best = {
      point: projection.point,
      segment: i,
      offPath: projection.distance,
      travelled,
      remaining: Math.max(0, total - travelled),
    }
  }
  return best
}

// --- Is this fix worth believing? --------------------------------------------------------

/**
 * Why a fix cannot be used, or null when it can.
 *
 * `off-map`    the device thinks it is somewhere else entirely. Indoors, with no satellites
 *              and no known wifi, a phone falls back to locating by IP address, which lands
 *              on the network's exchange - often a different district. Google Maps shows the
 *              same thing. Snapping that onto the campus network would put the user at
 *              whichever corner of the map lies toward it and send every route outbound,
 *              which is worse than admitting we do not know.
 * `too-coarse` the position may be right but the circle is wider than the campus is
 *              interesting, so it cannot say which building you are at.
 */
export type FixProblem = 'off-map' | 'too-coarse' | null

/**
 * Fixes further outside the mapped area than this are refused. A quarter of the map's own
 * span is wide enough to keep someone walking in from the main road, and far too tight to
 * admit the next district.
 */
const OFF_MAP_PAD = 0.25

/**
 * Beyond this the fix cannot pick a building out of the campus, so it is not worth drawing.
 * Deliberately loose: a genuine satellite fix beside a building can be 50-100 m, and that is
 * still useful, while an IP-derived one is usually thousands.
 */
const MAX_USEFUL_ACCURACY_M = 250

const [[SOUTH, WEST], [NORTH, EAST]] = MAP_BOUNDS
const LAT_PAD = (NORTH - SOUTH) * OFF_MAP_PAD
const LNG_PAD = (EAST - WEST) * OFF_MAP_PAD

export function fixProblem(fix: LatLng & { accuracy: number }): FixProblem {
  if (
    fix.lat < SOUTH - LAT_PAD ||
    fix.lat > NORTH + LAT_PAD ||
    fix.lng < WEST - LNG_PAD ||
    fix.lng > EAST + LNG_PAD
  ) {
    return 'off-map'
  }
  if (fix.accuracy > MAX_USEFUL_ACCURACY_M) return 'too-coarse'
  return null
}

/** What to tell the user about an unusable fix. */
export const FIX_PROBLEM_MESSAGE: Record<Exclude<FixProblem, null>, string> = {
  'off-map': 'Location unavailable — your device places you off campus',
  'too-coarse': 'Location unavailable — signal too weak to place you',
}
