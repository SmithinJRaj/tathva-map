# Tathva Campus Map

Offline-first campus map and navigation for Tathva @ NIT Calicut. React + Vite + Leaflet,
installable as a PWA, with QR codes around campus to set "you are here".

```bash
npm install
npm run dev -- --host   # self-signed HTTPS, so phone cameras work on the LAN
npm run build
```

## How the map is put together

There are no live map tiles. The campus is a single image, stretched between two geographic
corners, with everything else drawn on top of it — so the whole thing works offline.

| File | Holds |
| --- | --- |
| `real_map.jpeg` | The campus art, as supplied (2560 × 1810) |
| `scripts/calibrate-basemap.py` | Works out where that art sits on the globe |
| `scripts/style-basemap.py` | Recolours it into the violet night palette |
| `scripts/trace-art-shapes.py` | Traces outlines off the art for shapes OSM lacks |
| `scripts/place-supplement.json` | Names and renames the art labels that OSM does not carry |
| `scripts/build-campus-map.mjs` | Builds the data, and drives the recolour |
| `src/data/generated/campus.json` | Bounds, places and the routing graph, in image pixels |
| `src/config/mapConfig.ts` | The art, its corners, and the pixel → coordinate projection |
| `src/data/festContent.ts` | Hand-written events, food and amenities, by place id |

**Everything on the map is stored in image pixels, not latitude and longitude.** Outlines and
path nodes are `[x, y]` on the art; `imagePoint()` in `mapConfig.ts` projects them at load
time. That one indirection is what makes the art swappable: move the corners and the whole
campus moves with the picture, still aligned.

### Georeferencing, without eyeballing

The art is a rendering of OpenStreetMap data, so its buildings are the same shapes in the
same projection as the ones Overpass returns. That turns georeferencing into a registration
problem: `calibrate-basemap.py` rasterises the OSM footprints at a candidate scale, slides
them over the image's building mask, and keeps whichever scale and offset line up best.
Rotation is assumed zero (web maps are north-up) and the projection Web Mercator, leaving
three unknowns; translation is solved in one FFT per scale, so the search is a loop over
scales rather than a 3-D grid. The current fit overlaps at 0.54, and the outlines land on
the drawn buildings to within a pixel or two.

Run it whenever the art changes:

```bash
python3 scripts/calibrate-basemap.py real_map.jpeg
```

## Regenerating

```bash
node scripts/build-campus-map.mjs            # from the cached Overpass response
node scripts/build-campus-map.mjs --refresh  # re-query OpenStreetMap first
node scripts/build-campus-map.mjs --no-art   # data only, leave the image alone
```

Edit `BBOX` or `CAMPUS_RADIUS_M` at the top of the script to change what is collected. The
`BBOX` should contain the art's extent with room to spare — a building only has to clip the
edge to be returned, and a tight box drops it silently rather than complaining.

### Places the art labels but OSM does not

Three cases, handled in order by `scripts/place-supplement.json`:

- **OSM has the shape, unnamed.** Give a point in art pixels that falls inside it; the build
  looks up whichever unnamed building or pitch contains that point and adopts its real,
  surveyed outline. This is how Basketball Court gets its geometry.
- **OSM does not have the building at all.** `trace-art-shapes.py` flood-fills the drawn
  shape under the point and traces its boundary, writing the outline back into the
  supplement. C, F and G Hostel and the Department of Chemical Engineering come from here —
  the art draws them and OSM does not have them at all.
- **OSM has it under a different name.** Add a `renames` entry. The art's label is what
  people on campus actually say.

Place **ids keep following the original OSM name**, not the renamed one, because ids are
printed on QR codes around campus — a nicer label must never silently invalidate a poster.

### Dropping in different art

1. Replace `real_map.jpeg` and re-run `calibrate-basemap.py`.
2. Re-read the `at` points in `place-supplement.json`, and delete any `outline` you want
   re-traced.
3. Re-run `build-campus-map.mjs`.

For art that is not an OSM rendering, calibration will not find a fit; set `MAP_IMAGE_SIZE`
and `MAP_BOUNDS` by hand in `mapConfig.ts` instead, and re-trace content with the dev
Polygon tool (`npm run dev`, tick **Trace mode**, click an outline, hit **Copy** — it emits
the `[[x, y], ...]` literal the data files use).

## Interface

Violet space, drawn in 8-bit. One palette, hard edges, pixel type, with glow reserved for
the few things that should look lit. It lives in `src/styles/retro.css` as tokens plus a
handful of reusable classes — `.slab`, `.btn`, `.seg`, `.field`, `.chip`, `.pin` — which
`retro-popup.css` and `components/markers.ts` both build on, so a colour changes in one
place.

Press Start 2P is used only for small uppercase labels (it is very wide); VT323 carries
anything with real words. Map pins are `divIcon`s styled by the same CSS rather than
Leaflet's default teardrop.

**The basemap is recoloured to match**, by `scripts/style-basemap.py`. A flat colour swap is
tempting on flat art, but it cannot tell a label from a building outline — both are dark —
and swapping them together leaves the labels unreadable. Instead every pixel is classified
by saturation and hue into one of four families and only its lightness carries over: *ink*
(the darkest pixels, i.e. type) goes bright so labels read wherever they sit; *neutral* (the
pale ground) is inverted to deep space; *building* and *road* and *green* each get their own
ramp, with roads kept the brightest structure so routes have something to sit on. Within a
family the original light-to-dark ordering survives, so building outlines stay darker than
their fills.

Space is carried by two layers. `.space-bg` paints a tiled starfield behind the art, seen
when the map is zoomed out past its edges — note that an inline `background` shorthand on
the map container will silently blow away its `background-image`. `.space-haze` lays nebula
and a vignette over the map, because the art fills the viewport at most zooms and otherwise
the starfield is never seen.

Worth knowing:

- The opening view frames the **campus**, not the whole image, which runs out into
  Kattangal. `CAMPUS_BOUNDS` comes from the extent of the generated places.
- **Layers** (bottom left) is both the colour key and a filter — with ninety-odd places on a
  phone, hiding everything but food is what makes the map readable.
- Routes draw as three lines: a violet halo that reads as glow, a dark casing, and the
  coloured core. Walking is dashed amber, driving solid cyan.

## Routing

`lib/astar.ts` runs A* over the graph with a Haversine heuristic. The graph is the real
OpenStreetMap way geometry, so routes lie on the roads and paths rather than cutting across
buildings.

Every edge is classified from its `highway` tag:

- **`foot`** — footways, paths and steps. Walkers only.
- **`road`** — service roads, residential streets and everything else carrying traffic.
  Both modes.

One filter matters more than it looks: **`access=private` is not a reason to drop a way
here.** Much of the campus spine, Rajpath included, carries that tag — on a university it
means "not a public through-route", which is exactly what internal roads are. Excluding
them left the graph with holes the art plainly showed as roads, and forced drivers out onto
the public road for journeys that never leave campus.

Walking searches the whole network; driving searches only the `road` edges, which is why
the two often disagree. Each place is snapped to *both* networks when the data is built, so
a driver is sent to the nearest point a car can actually reach — never told "no route"
because the front door is on a footpath. Drivers snap only to the largest connected run of
road, so no one is stranded on an isolated driveway.

Rooms inside buildings (`indoorPlaces` in `festContent.ts`) hang off their building's
junction by a foot-only link whose cost stands in for the climb — stairs are zero metres on
the ground, so without that a route would call them free.

## Where you are

Scanning a campus QR sets the start: the code carries `?startNode=<place id>` (or a bare
place id), which is also written to the address bar so a reload or a shared link keeps it.
Place ids are slugs of OSM names — `elhc`, `main_building`, `nit_calicut_main_gate` — and
are listed in `src/data/generated/campus.json`.

## Attribution

Map data and tiles © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
The attribution shown in the map corner is required by that licence; please keep it.

---

`scripts/generate-placeholder-map.js` and `src/assets/map/nitc-placeholder.png` are the
pre-art stand-in from before the OSM pipeline existed. Nothing imports them any more.
`screenshot-*.png` in the repo root are throwaway captures from a dev session.
