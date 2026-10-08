#!/usr/bin/env node
/**
 * Builds the campus map data, and recolours the campus art, from OpenStreetMap.
 *
 *   node scripts/build-campus-map.mjs            # use the cached Overpass response
 *   node scripts/build-campus-map.mjs --refresh  # re-query Overpass first
 *   node scripts/build-campus-map.mjs --no-art   # data only, leave the image alone
 *
 * Inputs:
 *   real_map.jpeg                      the campus art (see ART below)
 *   scripts/cache/basemap-bounds.json  where that art sits on the globe
 *
 * Outputs:
 *   src/assets/map/nitc-campus.png   the art, recoloured to the violet night palette
 *   src/data/generated/campus.json   bounds, places and the walk/drive graph, in image pixels
 *
 * The art is a rendering of OpenStreetMap data, so its buildings are the same shapes in the
 * same projection as the ones Overpass returns. scripts/calibrate-basemap.py exploits that
 * to register the two and work out the art's corners; run it whenever the art changes:
 *
 *   python3 scripts/calibrate-basemap.py real_map.jpeg
 *
 * Requires python3 (numpy, Pillow) for the recolour.
 *
 * Map data: (c) OpenStreetMap contributors, ODbL.
 */

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', 'cache', 'osm-raw.json')
const IMAGE_OUT = join(ROOT, 'src', 'assets', 'map', 'nitc-campus.png')
const DATA_OUT = join(ROOT, 'src', 'data', 'generated', 'campus.json')

/** The campus art, and the calibration that says where it sits. */
const ART = join(ROOT, 'real_map.jpeg')
const ART_BOUNDS = join(ROOT, 'scripts', 'cache', 'basemap-bounds.json')
const STYLE_SCRIPT = join(ROOT, 'scripts', 'style-basemap.py')
const SUPPLEMENT = join(ROOT, 'scripts', 'place-supplement.json')

const USER_AGENT = 'tathva-campus-map/1.0 (one-off campus basemap build)'

/**
 * The area the Overpass query covers. It should contain the art's extent with room to
 * spare: a way or a building only has to clip the edge to be returned, and a tight box
 * drops it silently rather than complaining.
 */
const BBOX = { south: 11.3155, west: 75.9275, north: 11.3270, east: 75.9425 }

/**
 * The image deliberately runs out past the campus into Kattangal, which is useful context.
 * Places are kept to the campus itself, though: past this radius the data turns into the
 * town's textile shops and barbers, which would only clutter the map. There is a clean gap
 * in the data at roughly 570-600 m, so the exact figure is not delicate.
 */
const CAMPUS_CENTRE = { lat: 11.32158, lon: 75.934214 }
const CAMPUS_RADIUS_M = 580

const args = new Set(process.argv.slice(2))

// --- Projection ------------------------------------------------------------------------

const calibration = JSON.parse(readFileSync(ART_BOUNDS, 'utf8'))
const WIDTH = calibration.image.width
const HEIGHT = calibration.image.height
const BOUNDS = calibration.bounds

// Web Mercator, normalised to the unit square - the same maths calibrate-basemap.py fitted
// with, and the same the app inverts in config/mapConfig.ts.
const mercatorY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}
const mercatorX = (lon) => (lon + 180) / 360

const X_WEST = mercatorX(BOUNDS.west)
const X_EAST = mercatorX(BOUNDS.east)
const Y_NORTH = mercatorY(BOUNDS.north)
const Y_SOUTH = mercatorY(BOUNDS.south)

/** Projects a coordinate onto the art, in pixels from its top-left. */
const project = (lat, lon) => [
  round2(((mercatorX(lon) - X_WEST) / (X_EAST - X_WEST)) * WIDTH),
  round2(((mercatorY(lat) - Y_NORTH) / (Y_SOUTH - Y_NORTH)) * HEIGHT),
]

/** The inverse of `project`: art pixels back to a coordinate. */
const unproject = (x, y) => {
  const lon = (X_WEST + ((X_EAST - X_WEST) * x) / WIDTH) * 360 - 180
  const yy = Y_NORTH + ((Y_SOUTH - Y_NORTH) * y) / HEIGHT
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((0.5 - yy) * 2 * Math.PI)) - Math.PI / 2)
  return { lat, lon }
}

const round2 = (n) => Math.round(n * 100) / 100
const inside = (lat, lon) =>
  lat >= BOUNDS.south && lat <= BOUNDS.north && lon >= BOUNDS.west && lon <= BOUNDS.east

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg) => (deg * Math.PI) / 180
function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// --- Overpass --------------------------------------------------------------------------

const OVERPASS_QUERY = `[out:json][timeout:180];
(
  way["highway"](${BBOX.south - 0.002},${BBOX.west - 0.002},${BBOX.north + 0.002},${BBOX.east + 0.002});
  way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["leisure"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["amenity"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["shop"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["barrier"]["name"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["highway"="bus_stop"]["name"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out body geom;`

async function loadOsm() {
  if (!args.has('--refresh') && existsSync(CACHE)) {
    console.log('Using cached Overpass response (--refresh to re-query)')
    return JSON.parse(await readFile(CACHE, 'utf8'))
  }
  console.log('Querying Overpass...')
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain' },
    body: OVERPASS_QUERY,
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const text = await res.text()
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, text)
  return JSON.parse(text)
}

// --- Basemap ---------------------------------------------------------------------------

/** Recolours the supplied art into the violet night palette (see style-basemap.py). */
function styleArt() {
  if (!existsSync(ART)) throw new Error(`No campus art at ${ART}`)
  execFileSync('python3', [STYLE_SCRIPT, ART, IMAGE_OUT], { stdio: 'inherit' })
}

// --- Routing graph ---------------------------------------------------------------------

/** Ways people may only walk. Everything else that carries traffic is walk + drive. */
const FOOT_ONLY = new Set(['footway', 'path', 'steps', 'pedestrian', 'corridor', 'bridleway'])
/** Not routable in either mode. */
const SKIP_HIGHWAY = new Set(['construction', 'proposed', 'raceway', 'bus_guideway'])

function buildGraph(elements) {
  const nodes = new Map() // osm node id -> { id, at, lat, lon }
  const edges = []
  const seen = new Set()

  for (const way of elements) {
    const highway = way.tags?.highway
    if (way.type !== 'way' || !highway || SKIP_HIGHWAY.has(highway)) continue
    // `access=private` is not a reason to drop a way here. Half the campus spine, Rajpath
    // included, carries that tag: it means "not a public through-route", which is exactly
    // what a university's internal roads are. Dropping them left the graph with holes the
    // art plainly shows as paths. Only `foot=no` on a footway is a genuine refusal.
    if (way.tags.foot === 'no' && FOOT_ONLY.has(highway)) continue
    const mode = FOOT_ONLY.has(highway) ? 'foot' : 'road'

    let prev = null
    for (let i = 0; i < way.nodes.length; i++) {
      const osmId = way.nodes[i]
      const { lat, lon } = way.geometry[i] ?? {}
      if (lat === undefined || !inside(lat, lon)) {
        prev = null // the way leaves the image; resume when it comes back
        continue
      }
      if (!nodes.has(osmId)) nodes.set(osmId, { id: `n${osmId}`, at: project(lat, lon), lat, lon })
      const node = nodes.get(osmId)
      if (prev && prev.id !== node.id) {
        // One way can retrace another's segment; keep a single edge per pair, preferring the
        // drivable classification so a road is never demoted to foot-only.
        const key = [prev.id, node.id].sort().join('|')
        const existing = seen.has(key) ? edges.find((e) => e.key === key) : null
        if (existing) {
          if (mode === 'road') existing.mode = 'road'
        } else {
          seen.add(key)
          edges.push({ key, from: prev.id, to: node.id, mode, metres: Math.round(haversine(prev, node)) })
        }
      }
      prev = node
    }
  }

  // Drop anything the main network cannot reach, so the UI can never offer a dead end.
  const best = largestComponent(edges)
  const kept = [...nodes.values()].filter((n) => best.has(n.id))
  return {
    nodes: kept,
    edges: edges.filter((e) => best.has(e.from) && best.has(e.to)),
  }
}

// --- Places ----------------------------------------------------------------------------

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[''’`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)

const FOOD_AMENITIES = new Set([
  'restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'bar', 'pub', 'canteen',
])
const SERVICE_AMENITIES = new Set([
  'atm', 'bank', 'post_office', 'pharmacy', 'hospital', 'clinic', 'doctors', 'toilets',
  'drinking_water', 'fuel', 'bus_station', 'police', 'library', 'bicycle_rental',
])

/** Names the keyword rules below cannot read: acronyms and places named after a dish. */
const CATEGORY_OVERRIDES = new Map(
  Object.entries({
    csed: 'academic',
    sumedhyam: 'food',
    maitri: 'food',
    'micro canteen': 'food',
    'ration shop': 'amenity',
    'angel dtp': 'amenity',
    'electrical maintenance unit': 'amenity',
    'techology business incubator': 'academic',
    'st.josephs nit campus church': 'other',
  }),
)

function categorise(tags, name) {
  const amenity = tags.amenity
  const lower = name.toLowerCase()
  const override = CATEGORY_OVERRIDES.get(lower)
  if (override) return override
  // A short all-caps name on this campus is a department or a lab (ELHC, NLHC, CSED).
  if (/^[A-Z][A-Z.& ]{1,10}$/.test(name)) return 'academic'
  if (FOOD_AMENITIES.has(amenity) || tags.shop === 'bakery' || /canteen|mess\b|bakery|cafe|restaurant|parlour/.test(lower)) {
    return 'food'
  }
  if (tags.leisure === 'park' || tags.leisure === 'pitch' || tags.leisure === 'stadium' ||
      /theatre|amphitheatre|ground|auditorium|plaza/.test(lower)) {
    return 'event'
  }
  if (tags.barrier || tags.highway === 'bus_stop') return 'amenity'
  if (SERVICE_AMENITIES.has(amenity) || tags.leisure === 'fitness_centre' ||
      /atm|bank|office|store|gymkhana|guest house/.test(lower)) {
    return 'amenity'
  }
  if (amenity === 'college' || amenity === 'university' ||
      /lab\b|laboratory|department|lhc|block|complex|school|centre|center|building|academic|incubator|library/.test(lower)) {
    return 'academic'
  }
  return 'other'
}

/** Area centroid (shoelace); falls back to the mean for degenerate rings. */
function centroid(points) {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [x0p, y0p] = points[i]
    const [x1p, y1p] = points[(i + 1) % points.length]
    const cross = x0p * y1p - x1p * y0p
    area += cross
    cx += (x0p + x1p) * cross
    cy += (y0p + y1p) * cross
  }
  if (Math.abs(area) < 1e-9) {
    const n = points.length
    return [round2(points.reduce((s, p) => s + p[0], 0) / n), round2(points.reduce((s, p) => s + p[1], 0) / n)]
  }
  return [round2(cx / (3 * area)), round2(cy / (3 * area))]
}

/** Drops collinear-ish vertices; OSM footprints carry more detail than this map needs. */
function simplify(points, tolerance = 1.2) {
  if (points.length <= 4) return points
  const out = [points[0]]
  for (const p of points.slice(1)) {
    const last = out[out.length - 1]
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= tolerance) out.push(p)
  }
  return out.length >= 3 ? out : points
}

/** Even-odd ray casting, on a ring already projected into art pixels. */
function ringContains(ring, [x, y]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Names the shapes the art labels but OpenStreetMap leaves unnamed, by looking up whichever
 * unnamed building or pitch contains the hand-read point. Adopting the real footprint is the
 * whole point: the alternative is drawing boxes by eye, which is what this pipeline exists
 * to avoid.
 */
function supplementalPlaces(elements, graph, drivableNodes) {
  const file = JSON.parse(readFileSync(SUPPLEMENT, 'utf8'))
  const candidates = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    if (el.type !== 'way' || tags.name) continue
    if (!tags.building && !tags.leisure) continue
    const ring = (el.geometry ?? []).filter((g) => g)
    if (ring.length < 3) continue
    candidates.push({ ring: ring.map((g) => project(g.lat, g.lon)), geometry: ring })
  }

  const out = []
  for (const entry of file.places) {
    // OSM geometry first; it is surveyed. An outline in the file is the fallback, traced off
    // the art by scripts/trace-art-shapes.py for the shapes OSM simply does not have.
    const host = entry.outline ? null : candidates.find((c) => ringContains(c.ring, entry.at))
    if (!host && !entry.outline) {
      console.warn(`  supplement: no shape for "${entry.name}" at ${entry.at}`)
    }
    const ring = host ? host.ring.slice() : (entry.outline ?? null)
    if (ring && ring.length > 1) {
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] === last[0] && first[1] === last[1]) ring.pop()
    }
    const anchor = ring ? centroid(ring) : entry.at
    const latlon = unproject(anchor[0], anchor[1])
    out.push({
      name: entry.name,
      category: entry.category,
      at: anchor,
      outline: ring ? simplify(ring) : null,
      nodeId: nearest(graph.nodes, latlon, 150),
      driveNodeId: nearest(drivableNodes, latlon, 400),
    })
  }
  return out
}

/** The biggest set of node ids joined to each other by the given edges. */
function largestComponent(edges) {
  const adjacency = new Map()
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, [])
    if (!adjacency.has(e.to)) adjacency.set(e.to, [])
    adjacency.get(e.from).push(e.to)
    adjacency.get(e.to).push(e.from)
  }
  let best = new Set()
  const visited = new Set()
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue
    const component = new Set([start])
    const stack = [start]
    while (stack.length) {
      for (const next of adjacency.get(stack.pop())) {
        if (!component.has(next)) {
          component.add(next)
          stack.push(next)
        }
      }
    }
    for (const id of component) visited.add(id)
    if (component.size > best.size) best = component
  }
  return best
}

/** Id of the closest node, or null if the closest is further off than `limitMetres`. */
function nearest(nodes, latlon, limitMetres) {
  let bestId = null
  let best = Infinity
  for (const node of nodes) {
    const d = haversine(latlon, node)
    if (d < best) {
      best = d
      bestId = node.id
    }
  }
  return best <= limitMetres ? bestId : null
}

function buildPlaces(elements, graph) {
  const found = []
  // Drivers snap onto the largest connected run of road, not merely onto any road node:
  // a stub of driveway cut off from the rest would otherwise strand them there.
  const drivableNodes = graph.nodes.filter((n) =>
    largestComponent(graph.edges.filter((e) => e.mode === 'road')).has(n.id),
  )

  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = tags.name
    if (!name) continue

    const isArea = el.type === 'way' && (tags.building || tags.leisure)
    // Gates and bus stops are how people describe where they are on a campus, so they are
    // places here even though OSM files them as barriers and transport.
    const isPoint =
      el.type === 'node' && (tags.amenity || tags.shop || tags.barrier || tags.highway === 'bus_stop')
    if (!isArea && !isPoint) continue

    let outline = null
    let at
    let latlon
    if (isArea) {
      const ring = el.geometry?.filter((g) => g)
      if (!ring || ring.length < 3) continue
      if (!ring.some((g) => inside(g.lat, g.lon))) continue
      const pts = ring.map((g) => project(g.lat, g.lon))
      // Overpass closes rings by repeating the first node; Leaflet closes them itself.
      if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop()
      outline = simplify(pts)
      at = centroid(outline)
      latlon = {
        lat: ring.reduce((s, g) => s + g.lat, 0) / ring.length,
        lon: ring.reduce((s, g) => s + g.lon, 0) / ring.length,
      }
    } else {
      if (!inside(el.lat, el.lon)) continue
      at = project(el.lat, el.lon)
      latlon = { lat: el.lat, lon: el.lon }
    }

    // Snap to the nearest point on the network so routes end at a real door-side junction.
    // Walkers and drivers need different anchors: a building reached only by a footpath has
    // no drivable node near it, and snapping both modes to the same one would either send
    // cars down a footpath or make the place undrivable when a road is a short walk away.
    const nodeId = nearest(graph.nodes, latlon, 150)
    const driveNodeId = nearest(drivableNodes, latlon, 400)
    if (haversine(CAMPUS_CENTRE, { lat: latlon.lat, lon: latlon.lon }) > CAMPUS_RADIUS_M) continue

    found.push({ name, category: categorise(tags, name), at, outline, nodeId, driveNodeId })
  }

  // One name can appear as both a building and an amenity node; keep the one with an outline.
  // This has to settle before ids are handed out, or the survivor inherits a "_2" suffix.
  const byName = new Map()
  for (const p of found) {
    const key = p.name.toLowerCase()
    const existing = byName.get(key)
    if (!existing || (!existing.outline && p.outline)) byName.set(key, p)
  }

  const supplement = JSON.parse(readFileSync(SUPPLEMENT, 'utf8'))
  for (const extra of supplementalPlaces(elements, graph, drivableNodes)) {
    byName.set(extra.name.toLowerCase(), extra)
  }

  // The art's labels are what people on campus actually say; prefer them for display. The
  // id keeps following the ORIGINAL name, because ids are printed on QR codes around campus
  // - a nicer label must never silently invalidate a poster.
  const renamed = [...byName.values()].map((p) => ({
    ...p,
    idSource: p.name,
    name: supplement.renames[p.name] ?? p.name,
  }))

  const usedIds = new Set()
  return renamed
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ idSource, ...p }) => {
      const base = slug(idSource) || 'place'
      let id = base
      for (let i = 2; usedIds.has(id); i++) id = `${base}_${i}`
      usedIds.add(id)
      // Search-only extra words; `_comment` in the file is not one of them.
      const aliases = id === '_comment' ? undefined : supplement.aliases?.[id]
      return aliases ? { id, ...p, aliases } : { id, ...p }
    })
}

// --- Main ------------------------------------------------------------------------------

const osm = await loadOsm()
if (!args.has('--no-art')) styleArt()

const graph = buildGraph(osm.elements)
const places = buildPlaces(osm.elements, graph)

// Where the campus actually sits inside the image: the opening view frames this, rather
// than the whole render, which runs out into Kattangal and would start the user too far out.
const marks = places.flatMap((p) => p.outline ?? [p.at])
const clamp = (v, hi) => Math.max(0, Math.min(hi, v))
const campusBox = {
  minX: clamp(Math.floor(Math.min(...marks.map((m) => m[0]))), WIDTH),
  minY: clamp(Math.floor(Math.min(...marks.map((m) => m[1]))), HEIGHT),
  maxX: clamp(Math.ceil(Math.max(...marks.map((m) => m[0]))), WIDTH),
  maxY: clamp(Math.ceil(Math.max(...marks.map((m) => m[1]))), HEIGHT),
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  attribution: '(c) OpenStreetMap contributors',
  source: 'https://www.openstreetmap.org/copyright',
  art: calibration.art,
  metresPerPixel: calibration.metresPerPixel,
  image: { width: WIDTH, height: HEIGHT },
  bounds: BOUNDS,
  campusBox,
  places,
  graph: {
    nodes: graph.nodes.map((n) => ({ id: n.id, at: n.at })),
    edges: graph.edges.map((e) => ({ from: e.from, to: e.to, mode: e.mode, metres: e.metres })),
  },
}

await mkdir(dirname(DATA_OUT), { recursive: true })
await writeFile(DATA_OUT, `${JSON.stringify(payload, null, 1)}\n`)

const footEdges = graph.edges.filter((e) => e.mode === 'foot').length
console.log(`Wrote ${DATA_OUT}`)
console.log(`  bounds  ${BOUNDS.south.toFixed(6)},${BOUNDS.west.toFixed(6)} .. ${BOUNDS.north.toFixed(6)},${BOUNDS.east.toFixed(6)}`)
console.log(`  graph   ${graph.nodes.length} nodes, ${graph.edges.length} edges (${footEdges} foot-only, ${graph.edges.length - footEdges} drivable)`)
console.log(`  campus  ${campusBox.maxX - campusBox.minX}x${campusBox.maxY - campusBox.minY}px of ${WIDTH}x${HEIGHT}`)
console.log(`  places  ${places.length} (${places.filter((p) => p.outline).length} with outlines, ${places.filter((p) => !p.nodeId).length} unwalkable, ${places.filter((p) => !p.driveNodeId).length} undrivable)`)
