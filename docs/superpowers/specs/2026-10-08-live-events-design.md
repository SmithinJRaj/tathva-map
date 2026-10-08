# Live Events Schedule — Design

Date: 2026-10-08 · Branch: `parthiv-features` · Status: awaiting review

## 1. Goal

Turn the Tathva campus map into a live view of the fest: attendees see what is happening
**now** and what is **coming up**, each event tied to a venue on the map, and organisers can
change the schedule at any moment without a redeploy.

### In scope

- **A. Schedule backend** — a small service of its own on the Tathva DigitalOcean VM.
- **B. Attendee views** — a Live / Up next bottom sheet, tap-to-locate, and a full
  per-venue schedule in the place popup.
- **C. Admin GUI** — log in, add / edit / delay / cancel / delete events.
- **D. Spreadsheet import** — a one-off script to load the existing events sheet.

### Out of scope (separate sub-project)

- **WhatsApp → Gemini delay bridge.** Not built yet. This design only guarantees it can be
  added later without new endpoints: the bot logs in as its own admin account and calls
  the same `delay` / `cancel` endpoints the admin GUI uses (§3).

### Decisions taken

| Question | Decision |
| --- | --- |
| Backend | Separate from the main Tathva site's backend; shares only the VM |
| Stack | Node + TypeScript (Fastify) + SQLite (`better-sqlite3`), in `server/` of this repo |
| Admin auth | A handful of named admin accounts, created by script; no sign-up |
| Freshness | Clients poll every 30 s and on focus; no push |
| Event status | Live / upcoming / ended are computed from times; stored status is only `scheduled` or `cancelled` |
| Up next | Every future event, grouped by IST calendar day, sorted by start time |
| Venue | Picked from known map places + optional free-text room |
| Attendee layout | Bottom sheet with LIVE and UP NEXT tabs |
| Map move on tap | Configurable `fly` / `jump`; decided after testing on real phones |

## 2. Data model

SQLite, WAL mode. All timestamps stored as ISO-8601 UTC strings; always displayed in IST
(`Asia/Kolkata`) regardless of the device's timezone.

### `events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | Short random id (nanoid, 10 chars); stable, used in links and by the bridge |
| `title` | text, not empty | |
| `description` | text, nullable | |
| `category` | text | One of `workshop`, `competition`, `talk`, `cultural`, `proshow`, `other` |
| `place_id` | text | Must be a known map place id (§2.4) |
| `room` | text, nullable | Free text, e.g. "Room 301, 3rd floor" |
| `start_at` | text | Current start, delays applied |
| `end_at` | text | Current end; must be after `start_at` |
| `original_start_at` | text, nullable | Start time before the first delay; drives the ~~14:00~~ 14:30 display |
| `status` | text | `scheduled` or `cancelled` |
| `note` | text, nullable | Message to attendees, e.g. "Delayed: judges late" |
| `deleted` | integer 0/1 | Soft delete; deleted events never leave the API |
| `updated_at` | text | Used for optimistic concurrency (§3.3) |
| `updated_by` | text | Admin username |

### `admins`

`username` (PK), `display_name`, `password_hash` (argon2id). Created and reset with
`npm run admin -- add <username> <display name>` (prompts for the password). There is
no admin-management UI.

### `audit_log`

`id`, `at`, `admin`, `action` (`create` | `edit` | `delay` | `cancel` | `restore` |
`delete` | `import`), `event_id`, `before` (JSON, nullable), `after` (JSON, nullable).

### `meta`

Single row: `version` (integer). Bumped by every write, in the same transaction as the
write and its audit row.

### 2.1 Delay rules

- **Delay action** (`minutes`, may be negative): shifts `start_at` and `end_at` by the same
  amount. If `original_start_at` is null it is set to the pre-shift `start_at`. Repeated
  delays accumulate and keep the first original.
- **Edit** may change `start_at` and `end_at` independently. Any change to `start_at`
  records `original_start_at` (if null) exactly as a delay does.
- **Correction flag** on an edit (`correction: true`) clears `original_start_at`, for typo
  fixes that should not read as a delay.
- If, after any change, `start_at` equals `original_start_at`, `original_start_at` is
  cleared (an event delayed and then brought back is simply on time).

### 2.2 Computed state (one function in `shared/schedule.ts`, used by the app and admin GUI)

Given `now`:

- **cancelled** — `status = cancelled`. Shown in lists, greyed, never "live".
- **live** — `start_at <= now < end_at`.
- **upcoming** — `now < start_at`.
- **ended** — `end_at <= now`. Not shown to attendees.
- **delayed** — `original_start_at` is set and `start_at > original_start_at`.
- **brought forward** — `original_start_at` is set and `start_at < original_start_at`.
  Both show the struck-through original time.

### 2.3 Days

Day grouping uses the IST calendar date of `start_at`. Labels come from a config list of
fest dates (`src/schedule/festDays.ts`, e.g. `2027-02-06 → "Day 1"`); a date outside the
list is labelled by its date alone. The current IST date is labelled "Today".

### 2.4 Known places

The set of valid `place_id`s is the generated places in `src/data/generated/campus.json`
plus the `indoorPlaces` in `src/data/festContent.ts`. The server imports the same module
the map uses, so the two cannot disagree.

## 3. API

Fastify, JSON, all under `/api`. Inputs validated by zod schemas in a shared module
(`shared/schedule.ts`) imported by both the server and the admin GUI.

### 3.1 Public

- `GET /api/schedule` → `{ version, generatedAt, events: Event[] }`, every non-deleted
  event including cancelled ones. Sends `ETag: "<version>"`; a matching `If-None-Match`
  gets `304` with no body. `Cache-Control: no-cache`.
- `GET /api/health` → `200 { ok: true }`.

### 3.2 Admin (session required)

| Method & path | Body | Effect |
| --- | --- | --- |
| `POST /api/admin/login` | `{ username, password }` | Sets session cookie (httpOnly, Secure, SameSite=Strict, 12 h). Rate-limited: 10 attempts / 15 min / IP |
| `POST /api/admin/logout` | — | Clears session |
| `GET /api/admin/me` | — | `{ username, displayName }` or `401` |
| `POST /api/admin/events` | event fields | Create |
| `PATCH /api/admin/events/:id` | partial fields, `updatedAt`, optional `correction` | Edit |
| `POST /api/admin/events/:id/delay` | `{ minutes, updatedAt? }` | Shift both times (§2.1) |
| `POST /api/admin/events/:id/cancel` | `{ note?, updatedAt? }` | `status = cancelled` |
| `POST /api/admin/events/:id/restore` | `{ updatedAt? }` | `status = scheduled` |
| `DELETE /api/admin/events/:id` | — | Soft delete |
| `GET /api/admin/audit?event=:id` | — | History, newest first |

Sessions are stored server-side in SQLite (`sessions` table: token hash, username,
expires_at), so a restart does not log everyone out.

### 3.3 Behaviour common to every write

- One transaction: change the event, insert the audit row, bump `version`.
- **Optimistic concurrency:** `PATCH` requires, and the quick actions accept, the
  `updatedAt` the client last saw. A mismatch returns `409` with the current event. Quick
  actions sent without `updatedAt` (the bridge) always apply — a delay is relative, so it
  composes safely.
- `place_id` not in the known set (§2.4), empty title, or `end_at <= start_at` → `400`
  with per-field messages.

### 3.4 Status codes

`400` validation · `401` no / expired session · `404` unknown or deleted event · `409`
conflict · `429` login rate limit · `500` unexpected (logged).

## 4. Attendee app

### 4.1 Data (`src/schedule/`)

- `useSchedule()` — fetches `/api/schedule` on mount, every 30 s while the page is
  visible, and on `visibilitychange` to visible. Uses `If-None-Match`. Stores the last
  good response in `localStorage` and renders it immediately on launch.
- `useNow()` — a clock that ticks every 30 s, so events move between Live / Up next /
  gone without waiting for a fetch.
- `classify(events, now)` — pure; returns `{ live, upcomingByDay }` per §2.2–2.3. Live is
  sorted by `end_at`; each day by `start_at`.
- Staleness: if the last successful fetch is older than 2 minutes, show
  "Offline · updated N min ago" in the sheet header.
- The API base URL comes from `VITE_API_BASE` (default `/api`).

### 4.2 Bottom sheet (`src/components/EventSheet.tsx`)

- Three snap points: **peek** (a strip: "● 3 LIVE · 12 UP NEXT"), **half**, **full**.
  Dragged by its handle with pointer events; no gesture library.
- Tabs **LIVE** and **UP NEXT** (UP NEXT has day headers).
- Each row: time, title, category chip, **venue name + room**, and one status:
  ~~14:00~~ 14:30 DELAYED · CANCELLED (greyed) · "ends in 20 min" (live only).
- **Tap a row** → sheet drops to peek → map moves to the venue → the building outline
  pulses briefly → its popup opens. Map movement uses `MAP_MOVE: 'fly' | 'jump'` in
  `src/config/mapConfig.ts` (default `fly`).
- An event whose venue is not a known place (e.g. after a map rebuild renamed it) still
  lists, without the tap-to-locate action.
- The Layers control and legend move up so they are never covered by the peek strip.

### 4.3 Venue popup (`src/components/PlacePopup.tsx`)

- The static event list is replaced by the venue's schedule from `useSchedule`, in
  sections: **Live now**, **Later today**, then one per later day. Same status markers as
  the sheet. Description, food, amenities and "Route here" are unchanged.
- Venues with a live event glow on the map (existing glow treatment from `retro.css`).

### 4.4 Removed / changed

- `events` is removed from `PlaceContent` and from every entry in `festContent.ts`;
  descriptions, food and amenities stay.
- A place's `event` category is decided at runtime: a place with any upcoming or live
  event counts as an event venue for the Layers filter.

### 4.5 Service worker

`/api/schedule` is not precached; it is fetched network-first by the hook, with the
`localStorage` copy as fallback. `/admin` and `/api/admin/*` are excluded from the service
worker's navigation fallback and runtime caching.

## 5. Admin GUI (`/admin`)

Lazy-loaded route in the same React app (separate chunk; attendees never download it).
The app has no router today and does not gain one: `main.tsx` renders the admin root when
`location.pathname` starts with `/admin`, otherwise the map. Uses the existing retro
classes; laid out for phones first.

1. **Login** — username and password, error message on failure.
2. **Schedule list** — grouped by day, sorted by start. Filters: day, venue, status
   (live / upcoming / ended / cancelled); title search. Each row: time, title, venue,
   status chip and quick actions **+15**, **+30**, **Delay…** (custom minutes, negative
   allowed), **Cancel / Restore**, **Edit**. Quick actions show a toast with **Undo**, which
   sends the inverse action (itself audited).
3. **Add / Edit form** — title, description, category, venue (searchable list of known
   places with a small map preview), optional room, start and end as separate IST date and
   time inputs, note to attendees, **"Correction — don't show as delayed"** (edit only).
   Field errors come from the shared zod schema. Delete is behind a confirm dialog.
4. **History** — the event's audit entries (who, when, before → after), opened from the form.

Behaviour: a `409` shows "Changed by <name> <time> ago — reload?"; a `401` returns to
login and keeps the unsaved form in memory; a network failure shows a
"Can't reach server" banner and leaves the form intact.

Not included: bulk import in the GUI, admin management, per-event permissions, images.

## 6. Spreadsheet import

`npm run import-schedule -- <file.csv> [--commit]` (dry run unless `--commit`).

- A column map at the top of the script translates sheet headers to event fields.
- Venue text is matched to a place id by: exact name → alias table (e.g. `OAT →
  open_air_theatre`) → closest name above a similarity threshold. Text left over after the
  matched venue (e.g. "301") becomes `room`.
- Dry run prints each row as it would be imported and a separate list of rows it could not
  import (unknown venue, unparseable time, end before start). `--commit` refuses to run
  while that list is non-empty.
- Re-running matches existing events by title + IST date and updates them instead of
  duplicating. Writes are audited with admin `import`.

**Input needed before implementation:** the sheet's column headers and a few sample rows
(dummy values are fine), to fill in the column map and alias table.

## 7. Deployment

**The DigitalOcean VM's setup is not yet known** (process manager, reverse proxy, domain,
TLS). The service is therefore built to make no assumptions about it, and the concrete
deployment is decided once the VM's setup is confirmed with whoever runs it.

Requirements the build meets regardless of setup:

- One Node process, configured only by environment variables: `PORT`, `HOST` (default
  `127.0.0.1`), `DB_PATH`, `SESSION_SECRET`, `COOKIE_SECURE` (default `true`).
- The attendee app and admin GUI are static files from `npm run build`; any web server can
  serve them.
- The app and API must be served from the **same origin** (static files at `/`, API
  proxied at `/api`) so the session cookie works without CORS. Serving them from different
  origins is not supported in this design.
- The web server must fall back to `index.html` for `/admin` (single-page app routing).
- The SQLite file lives outside the repo; backups are a copy made with `sqlite3 .backup`.
- `server/README.md` documents the environment variables, the admin-account script, the
  build commands and an example reverse-proxy block for nginx.

Questions to settle with the VM's owner: is nginx (or another proxy) already in front of
the main site; which subdomain or path the map gets; how processes are kept running
(systemd, pm2, Docker); whether TLS is already set up.

## 8. Errors

| Situation | Attendee | Admin |
| --- | --- | --- |
| Server unreachable | Cached schedule + "Offline · updated N min ago" | "Can't reach server" banner |
| Invalid input | — | Field-level messages (400) |
| Session expired | — | Back to login, form kept (401) |
| Concurrent edit | — | Reload prompt naming who changed it (409) |
| Unknown venue id in data | Listed, no locate action; dev-mode warning | Server rejects new ones (400) |
| Server crash | Same as unreachable | Same as unreachable; the process manager restarts it |

## 9. Testing

Vitest throughout.

- **Unit:** `classify()` (live/upcoming boundaries, IST day grouping across midnight UTC,
  cancelled and delayed events); delay rules in §2.1 (stacked delays, negative delays,
  correction flag, returning to original time); zod schemas; importer venue matching.
- **API:** Fastify `inject()` against a temporary SQLite file — login and rate limit,
  create / edit / delay / cancel / restore / delete, audit rows, `version` bump, ETag and
  `304`, `409` on stale `updatedAt`, `400` on unknown venue.
- **Manual, before the fest:** on real phones over campus Wi-Fi, check sheet-drag
  smoothness and choose `MAP_MOVE` (`fly` or `jump`).

## 10. Repository layout (new and changed)

```
shared/schedule.ts            zod schemas, Event type, delay + classify logic
server/                       Fastify app, SQLite, scripts (admin, import-schedule)
src/schedule/                 useSchedule, useNow, festDays
src/components/EventSheet.tsx bottom sheet
src/components/PlacePopup.tsx venue schedule
src/admin/                    lazy-loaded admin GUI
src/data/festContent.ts       events removed
```
