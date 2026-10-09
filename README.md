# Tathva Campus Map

Offline-first campus map and navigation for Tathva @ NIT Calicut. React + Vite + Leaflet,
installable as a PWA, with QR codes around campus to set "you are here".

```bash
npm install
npm run dev -- --host   # self-signed HTTPS, so phone cameras work on the LAN
npm run build
```

## Live schedule

Events come from a small API server rather than the bundle, so organisers can change a time,
delay or cancel an event while the fest is running. The map polls it and falls back to the
last cached copy offline. Locally, run `DB_PATH=/tmp/s.db SESSION_SECRET=<32+ chars>
COOKIE_SECURE=false npm run server` next to `npm run dev`; `/admin` is the organiser login.
Running it for real (env vars, admins, importing the sheet, nginx, backups) is in
[`server/README.md`](server/README.md).

Every event card has a share button. The link it shares, `/?event=<id>`, opens the map on that
event's venue with its popup open, then drops the parameter so a reload doesn't fly back.

**Lite mode** switches off the glow filters, pulses, blinking and the fly-to animation, for
phones that stutter. It turns itself on for four cores or fewer, Data Saver, or reduced motion,
and can be flipped either way from the **Layers** menu (remembered on that phone).

## How the map is put together

There are no live map tiles. The campus is a single image, stretched between two geographic
corners, with everything else drawn on top of it — so the whole thing works offline.

| File | Holds |
| --- | --- |
| `real_map.jpeg` | The campus art, as supplied (2560 × 1810) |
| `src/assets/map/nitc-campus.webp` | That art recoloured, and what ships (≈329 KB) |
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
them over the image's mask of drawn shapes, and keeps whichever scale and offset line up
best. Rotation is assumed zero (web maps are north-up) and the projection Web Mercator,
leaving three unknowns; translation is solved in one FFT per scale, so the search is a loop
over scales rather than a 3-D grid.

It runs **in two passes**, and the second is not optional. The coarse pass works at 512 px
wide, which quantises translation to five art pixels and steps scale by about 1.2% — over a
2560 px image that leaves tens of pixels of slop at the edges, enough to sit outlines
visibly off their buildings. The refine pass re-searches a narrow bracket around the coarse
answer at 2048 px. Both passes register against the buildings *and* the green areas, which
are drawn just as crisply and nearly double the signal.

Measured against the art's own drawn shapes, refinement moved the median error from
(−3, −2) px to (0, +2) and cut the outlines sitting more than 8 px out from 28 of 67 to 19.
The ones that still measure badly are rows of identical parallel strips — the lab block —
where a shape can slide onto its neighbour and still score well; those are ambiguity in the
measurement, not misalignment on screen.

Run it whenever the art changes:

```bash
python3 scripts/calibrate-basemap.py real_map.jpeg
```

### Why the basemap is WebP

One file dominates what a visitor downloads. Everything else the app ships is text, which
the host serves compressed — the main bundle is 505 KB on disk but about 150 KB on the wire.
The basemap is already-compressed bytes, so what you see is what you send.

As a PNG it was 1,089 KB of a ~1,402 KB first visit: **78% of the download for one file**.
At WebP quality 82 it is 329 KB, which takes a first visit to about 627 KB. Lossy encoding
on flat fills and 8 px labels is exactly where artefacts show, so this was checked at 4×
magnification rather than assumed: the labels are indistinguishable and whole-image RMSE is
about 1%.

The styled image is encoded straight to WebP without the palette step PNG needs — quantising
first only hands the lossy encoder banded input, costing quality without saving bytes.

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

Place **ids keep following the original OSM name**, not the renamed one: a nicer display
label must never silently change an id, because ids are what shared links and the schedule
service key on. Where OSM's name makes an id actively misleading, override it explicitly in
the `ids` map — `nit_ground` meant the Volleyball Court, which anyone would read as the
football ground. An override, or an alias, that matches nothing is a build warning rather
than a silent no-op; renaming an id dropped an alias exactly that way once.

### Dropping in different art

1. Replace `real_map.jpeg` and re-run `calibrate-basemap.py`.
2. Re-read the `at` points in `place-supplement.json`, and delete any `outline` you want
   re-traced.
3. Re-run `build-campus-map.mjs`.

For art that is not an OSM rendering, calibration will not find a fit; set `MAP_IMAGE_SIZE`
and `MAP_BOUNDS` by hand in `mapConfig.ts` instead, and re-trace content with the dev
Polygon tool (`npm run dev`, open the map with `?dev=1`, tick **Trace mode**, click an
outline, hit **Copy** — it emits the `[[x, y], ...]` literal the data files use). Without
`?dev=1` the tool stays hidden, so testing the app on a phone isn't covered by it; production
builds leave it out entirely.

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
- **From / To are type-to-search** (`components/PlaceField.tsx`). They were native selects,
  which are unbeatable for a short list and hopeless for ninety names — you could scroll but
  not type. Ranking lives in `lib/placeSearch.ts` and is by *how* the query matched, not just
  whether it did, so "a hos" offers A Hostel before ABC Auditorium Complex. Abbreviations
  people say that are not in the place name — OAT, TBI — are listed under `aliases` in
  `scripts/place-supplement.json`; they widen search only and never change what is displayed.
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

**Fest venues** (`festVenues`, same file) are the other way round: a name for somewhere that
is already on the map. The Proshow is not a building, it is a night on the football ground,
and nobody searches for "NITC Football Ground" when they want it. They appear in the From/To
pickers and in the schedule's venue list and route exactly as their host does, but they are
not drawn — the ground already is, and a second marker on it would just be clutter. Both
kinds set `anchoredTo`, which is what keeps them off the map and makes selecting one
highlight the shape it sits on.

## Where you are, and getting there

**Live location.** `useGeolocation` watches `navigator.geolocation`. Three things to know:

- It needs a **secure origin**. `npm run dev -- --host` serves HTTPS for this reason, and any
  deployment must too, or the browser refuses and the app says so plainly.
- It needs **permission**, and browsers only grant it off a user gesture the first time.
  Asking unprompted on first load is how a site gets permanently blocked, so the app waits
  to be asked. On later visits the Permissions API reports the existing grant and the watch
  starts on load with no prompt — which is the "by default" part.
- Once there is a fix, **"From" defaults to your location**, derived rather than stored, so
  it follows the fix appearing or going away without any state to keep in step.

The dot is drawn with its accuracy circle. That is deliberate: a bare dot implies a precision
phone GPS does not have, and on a campus this dense someone will trust it into the wrong
building. Above about 35 m the panel says the signal is weak and gives the figure.

**A fix is vetted before the app acts on it** (`fixProblem` in `lib/geo.ts`). Indoors, with no
satellites and no known wifi, a phone falls back to locating by IP address, which lands on
the network's exchange — often a different district, and every map app shows the same wrong
answer. Snapping that onto the campus network would put the user at whichever corner of the
map lies toward it and point every route outbound, which is worse than admitting we do not
know. So a fix more than a quarter of the map's span outside it, or with an accuracy circle
wider than 250 m, is treated as no fix at all: no dot, no "My location" origin, and the
planner says why.

**There is no fallback for that case.** The in-app QR scanner used to be one — scanning a
code on a wall set the start exactly, with no satellites involved — and it was removed when
the fest dropped QR codes. So indoors, where GPS is worst, the honest answer is that the app
does not know where you are and says so; you pick your starting point from the list. If
printed codes ever come back, the cheapest route is a plain URL rather than a scanner (see
below) — it costs nothing to ship and the phone's own camera opens it.

**Arriving at a place by link.** `?startNode=<place id>` still sets the start on load, which
is what makes a shared link, or a printed code opened by the phone's own camera, land on the
right place. Place ids are slugs of OSM names — `elhc`, `main_building`,
`nit_calicut_main_gate` — and are listed in `src/data/generated/campus.json`.

### Navigation

Press **Go** with a destination set and the planner is replaced by a turn card: the next
manoeuvre, the distance to it, the distance remaining, and an ETA at the mode's speed.

A raw fix is not on the path network — GPS drifts further than the paths are apart — so it
is snapped onto the nearest edge the current mode may use, and the route starts from that
edge's nearer end. `lib/geo.ts` does that in a local flat frame: over a campus, treating a
degree as a constant number of metres is accurate to millimetres and turns projection onto a
segment into ordinary 2-D algebra.

`lib/navigation.ts` turns a route into directions. The graph is a dense chain of OSM shape
points, so most of its nodes are nothing to tell anyone about; a manoeuvre is only emitted
where the bearing changes by more than 25°, **and** turns within 20 m of each other are
merged by summing their angles. Without that merge a mapped path's small jogs produce "turn
left, turn right, turn left" for what is plainly a straight walk — the 300 m from the main
gate to the OAT reported eleven manoeuvres before merging and six after.

Because the origin is the live fix, straying **re-routes on its own**: the snapped start node
changes, A* re-runs, and the new route starts from where you actually are. The off-route
message only shows when the origin is a fixed place, and needs three consecutive bad fixes
before it appears, so one reflection off a building does not make the card flap.

Arrival is measured to **where the route ends**, not to the middle of the destination. A
route can only reach the path outside a building, and that is 23 m from the centre of the OAT
and 56 m from the centre of the worst building here; measuring to the centre would mean never
quite arriving.

## Deploying

The attendee app is a static build; `vercel.json` carries the config.

```bash
npm run static-schedule   # optional, see below
npm run build             # -> dist/
```

Two things in that config are load-bearing. `/admin` is client-routed from the same
`index.html`, so it needs a rewrite or a direct visit 404s. And `sw.js`,
`manifest.webmanifest` and `index.html` must **not** be cached long: Vite fingerprints
everything under `/assets`, but these keep their names, and a service worker cached for a
year is one you can never replace. Do not add a catch-all SPA rewrite — it would swallow
`/api/schedule` and serve the app shell in its place.

### Running without the schedule service

`npm run static-schedule` reads the CSV exports in `csv/` and writes `public/api/schedule`,
which Vite copies into the build. The app only ever reads `GET /api/schedule`, so a static
file there is indistinguishable from the service: same shape, same ETag and 304 from the
host, same offline cache on the client. What it cannot do is change — no admin edits, no
WhatsApp bridge — which is the trade while the service has nowhere to run.

It is generated here and committed, rather than built on the host, because the CSVs carry
volunteers' names and phone numbers and are gitignored for that reason. The generated file
carries neither: the contact columns are unmapped, so they never reach it.

To switch to the live service: delete `public/api/schedule` and point `/api/*` at the
service (a Vercel rewrite, or nginx as in `server/README.md`).

## Attribution

Map data and tiles © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
The attribution shown in the map corner is required by that licence; please keep it.

---

`scripts/generate-placeholder-map.js` and `src/assets/map/nitc-placeholder.png` are the
pre-art stand-in from before the OSM pipeline existed. Nothing imports them any more.
`screenshot-*.png` in the repo root are throwaway captures from a dev session.
