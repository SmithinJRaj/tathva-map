# Live Events Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, admin-editable event schedule to the Tathva campus map: a Fastify + SQLite API, a Live / Up next bottom sheet with tap-to-locate, per-venue schedules in place popups, an `/admin` GUI, and a one-off spreadsheet importer.

**Architecture:** Pure schedule logic (schemas, delay rules, live/upcoming classification, IST formatting) lives in `shared/` and is imported by the server, the attendee app and the admin GUI. The server (`server/`) is one Fastify process over a SQLite file, run with `tsx`. The attendee app polls `GET /api/schedule` every 30 s with ETags and keeps the last good copy in `localStorage`; the admin GUI is a lazy-loaded chunk chosen in `main.tsx` by path.

**Tech Stack:** React 19, Vite 8, react-leaflet 5, Tailwind 4 (existing) · Fastify 5, `@fastify/cookie`, `@fastify/rate-limit`, `better-sqlite3`, `@node-rs/argon2`, `zod` 4, `nanoid`, `csv-parse`, `tsx` (new) · Vitest (new).

**Spec:** `docs/superpowers/specs/2026-10-08-live-events-design.md`

## Global Constraints

- All commits go on branch `parthiv-features` only. Never commit to `master`. Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Timestamps are stored and sent as ISO-8601 UTC (`Date#toISOString()`), and always displayed in `Asia/Kolkata` (IST), whatever the device timezone.
- Event categories: exactly `workshop`, `competition`, `talk`, `cultural`, `proshow`, `other`.
- Stored status is only `scheduled` or `cancelled`. Live / upcoming / ended are computed, never stored.
- A `placeId` is valid only if it appears in `shared/places.ts` `knownPlaces` (generated places + `indoorPlaces`).
- Polling interval 30 s; staleness tag after 2 minutes without a successful fetch.
- Session cookie: name `tm_session`, httpOnly, `Secure` unless `COOKIE_SECURE=false`, `SameSite=Strict`, 12 h. Login rate limit: 10 attempts / 15 min / IP.
- Server env vars: `PORT` (default `8787`), `HOST` (default `127.0.0.1`), `DB_PATH` (required), `SESSION_SECRET` (required, ≥ 32 chars), `COOKIE_SECURE` (default `true`).
- Match the surrounding code style: no semicolons, single quotes, 2-space indent, explanatory comments only where the code is non-obvious (see existing `src/`).
- No new dependencies beyond those listed in Tech Stack.
- Test files import `test`, `expect`, `vi` from `'vitest'` explicitly (no globals), so `tsc -b` type-checks them.

## Review Focus

1. **Events crossing IST midnight** (e.g. 23:30–01:00 IST): grouped under the day they start, and live until their end on the next day. → test in Task 3.
2. **Device set to a non-IST timezone:** times and day headings still show IST. → test in Task 3 (run with `TZ=America/New_York`).
3. **Corrupt or old-format `localStorage` cache:** the app ignores it and fetches fresh rather than crashing on launch. → test in Task 8.
4. **Admin double-taps "+15":** the second request carries a stale `updatedAt` and gets `409`, so the event is delayed once, not twice. → test in Task 6.
5. **Spreadsheet exported with a UTF-8 BOM and trailing blank rows:** headers still match and blank rows are skipped, not reported as errors. → test in Task 7.

---

## File map

| File | Responsibility |
| --- | --- |
| `shared/schedule.ts` | Types, categories, zod schemas for inputs |
| `shared/places.ts` | `knownPlaces`: id → name, for validation and venue names |
| `shared/rules.ts` | Delay / edit / correction rules on event fields |
| `shared/ist.ts` | IST date keys and formatting |
| `shared/classify.ts` | Event state and Live / Up next grouping |
| `server/db.ts` | Open SQLite, create tables |
| `server/store.ts` | Event reads and audited, versioned writes |
| `server/auth.ts` | Password hashing, admin accounts, sessions |
| `server/app.ts` | Fastify app factory; `server/routes/public.ts`, `server/routes/admin.ts` |
| `server/index.ts` | Reads env, opens DB, listens |
| `server/scripts/admin.ts` | `npm run admin -- add <username> <display name>` |
| `server/import/*.ts`, `server/scripts/import-schedule.ts` | Spreadsheet import |
| `src/schedule/*` | Attendee data layer: fetch, cache, hooks, context, day labels |
| `src/components/EventRow.tsx`, `EventSheet.tsx` | Event list row and the bottom sheet |
| `src/components/layerRegistry.ts` | Place id → Leaflet layer, for focus-on-map |
| `src/admin/*` | Admin GUI |

---

### Task 1: Tooling, shared types and known places

**Files:**
- Modify: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `.gitignore`
- Create: `tsconfig.server.json`, `vitest.config.ts`, `shared/places.ts`, `shared/schedule.ts`
- Test: `shared/schedule.test.ts`

**Interfaces:**
- Produces (`shared/places.ts`): `knownPlaces: ReadonlyMap<string, string>` (place id → display name; generated places from `src/data/generated/campus.json` plus every `indoorPlaces` entry from `src/data/festContent.ts`).
- Produces (`shared/schedule.ts`):
  - `CATEGORIES` (readonly tuple), `type Category`, `type EventStatus = 'scheduled' | 'cancelled'`
  - `interface ScheduleEvent { id: string; title: string; description: string | null; category: Category; placeId: string; room: string | null; startAt: string; endAt: string; originalStartAt: string | null; status: EventStatus; note: string | null; updatedAt: string; updatedBy: string }`
  - `interface ScheduleResponse { version: number; generatedAt: string; events: ScheduleEvent[] }`
  - `type EventFields = Omit<ScheduleEvent, 'id' | 'updatedAt' | 'updatedBy'>`
  - `eventInputSchema` (create; output `EventInput`), `eventPatchSchema` (output `EventPatch` = partial `EventInput` + `updatedAt: string` + `correction?: boolean`), `delaySchema` (`{ minutes: number; updatedAt?: string }`), `cancelSchema` (`{ note?: string; updatedAt?: string }`), `restoreSchema` (`{ updatedAt?: string }`), `loginSchema` (`{ username: string; password: string }`)
  - `type FieldErrors = Record<string, string>`; `fieldErrors(err: z.ZodError): FieldErrors` (first message per top-level path)

- [ ] **Step 1: Install dependencies**

```bash
npm install
npm install fastify @fastify/cookie @fastify/rate-limit better-sqlite3 @node-rs/argon2 zod nanoid csv-parse tsx
npm install -D vitest @types/better-sqlite3
```

Expected: installs cleanly; `zod` major is 4 (`npm ls zod`).

- [ ] **Step 2: Configure TypeScript and Vitest**

- `tsconfig.app.json`: `"include": ["src", "shared"]`.
- `tsconfig.server.json`: copy of `tsconfig.node.json` options with `"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo"`, `"module": "esnext"`, `"moduleResolution": "bundler"`, `"resolveJsonModule": true`, `"types": ["node"]`, `"include": ["server", "shared"]`.
- `tsconfig.json`: add `{ "path": "./tsconfig.server.json" }` to `references`.
- `vitest.config.ts`: `defineConfig({ test: { environment: 'node', include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'src/**/*.test.ts'] } })` from `vitest/config` (a separate file so the PWA/SSL plugins are not loaded in tests).
- `package.json` scripts: `"test": "vitest run"`, `"server": "tsx watch server/index.ts"`, `"server:start": "tsx server/index.ts"`, `"admin": "tsx server/scripts/admin.ts"`, `"import-schedule": "tsx server/scripts/import-schedule.ts"`.
- `.gitignore`: add `*.db`, `*.db-wal`, `*.db-shm`.

- [ ] **Step 3: Write the failing test** (`shared/schedule.test.ts`)

```ts
const valid = {
  title: 'Robowars Finals', category: 'competition', placeId: 'elhc',
  startAt: '2027-02-06T14:00:00+05:30', endAt: '2027-02-06T16:00:00+05:30',
}

test('knownPlaces has generated and indoor places', () => {
  expect(knownPlaces.get('elhc')).toBeTruthy()
  expect(knownPlaces.get('elhc_301')).toBe('ELHC 301')
})
test('input normalises times to UTC and defaults optionals to null', () => {
  const out = eventInputSchema.parse(valid)
  expect(out.startAt).toBe('2027-02-06T08:30:00.000Z')
  expect(out.room).toBeNull(); expect(out.description).toBeNull(); expect(out.note).toBeNull()
})
test('rejects unknown venue, blank title, end before start, bad category', () => {
  const r = eventInputSchema.safeParse({ ...valid, placeId: 'nowhere', title: '  ', endAt: valid.startAt, category: 'party' })
  expect(r.success).toBe(false)
  expect(fieldErrors(r.error!)).toMatchObject({
    placeId: 'Unknown venue', title: 'Title is required', category: expect.any(String),
  })
  const r2 = eventInputSchema.safeParse({ ...valid, endAt: valid.startAt })
  expect(fieldErrors(r2.error!)).toEqual({ endAt: 'End must be after start' })
})
test('patch requires updatedAt and accepts a subset', () => {
  expect(eventPatchSchema.safeParse({ title: 'X' }).success).toBe(false)
  expect(eventPatchSchema.parse({ title: 'X', updatedAt: 'a', correction: true }).title).toBe('X')
})
test('delay minutes must be a non-zero integer within ±1440', () => {
  expect(delaySchema.safeParse({ minutes: 0 }).success).toBe(false)
  expect(delaySchema.safeParse({ minutes: 1.5 }).success).toBe(false)
  expect(delaySchema.safeParse({ minutes: 1441 }).success).toBe(false)
  expect(delaySchema.parse({ minutes: -30 }).minutes).toBe(-30)
})
```

- [ ] **Step 4: Run it — expect failure**

Run: `npx vitest run shared/schedule.test.ts` → FAIL (modules not found).

- [ ] **Step 5: Implement `shared/places.ts` and `shared/schedule.ts`**

- `places.ts` imports `../src/data/generated/campus.json` with `with { type: 'json' }` and `indoorPlaces` from `../src/data/festContent.ts` (it has no imports, so it is safe for Node).
- Schemas: define the plain object `eventFields` first; `eventInputSchema = eventFields.superRefine(end > start)`; `eventPatchSchema = eventFields.partial().extend({ updatedAt: z.string().min(1), correction: z.boolean().optional() })` (end > start for patches is checked by the rules in Task 2, after merging).
- Field rules: `title` trimmed, 1–120 chars, message `'Title is required'` when empty; `description` ≤ 1000, `room` ≤ 80, `note` ≤ 200, each optional → `null`; `placeId` refined against `knownPlaces` with message `'Unknown venue'`; `startAt`/`endAt` `z.iso.datetime({ offset: true })` transformed with `new Date(v).toISOString()`; end-before-start message `'End must be after start'` on path `endAt`.

- [ ] **Step 6: Run the tests — expect pass**

Run: `npx vitest run shared/schedule.test.ts` → PASS. Also `npx tsc -b` → no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig*.json vitest.config.ts .gitignore shared/
git commit -m "Add shared schedule types, schemas and known places"
```

---

### Task 2: Delay and edit rules

**Files:**
- Create: `shared/rules.ts`
- Test: `shared/rules.test.ts`

**Interfaces:**
- Consumes: `EventFields`, `EventInput` from Task 1.
- Produces:
  - `class RuleError extends Error { field: string }`
  - `applyDelay(e: EventFields, minutes: number): EventFields`
  - `applyEdit(e: EventFields, patch: Partial<EventInput>, correction: boolean): EventFields` — throws `RuleError('endAt', 'End must be after start')` if the merged result has `endAt <= startAt`.

- [ ] **Step 1: Write the failing tests** (`shared/rules.test.ts`). Base event: start `2027-02-06T08:30:00.000Z`, end `2027-02-06T10:30:00.000Z`, `originalStartAt: null`.

```ts
test('delay shifts both times and records the original', () => {
  const d = applyDelay(base, 30)
  expect(d.startAt).toBe('2027-02-06T09:00:00.000Z'); expect(d.endAt).toBe('2027-02-06T11:00:00.000Z')
  expect(d.originalStartAt).toBe('2027-02-06T08:30:00.000Z')
})
test('stacked delays keep the first original', () => {
  expect(applyDelay(applyDelay(base, 30), 15).originalStartAt).toBe('2027-02-06T08:30:00.000Z')
})
test('delay back to the original time clears the marker', () => {
  expect(applyDelay(applyDelay(base, 30), -30).originalStartAt).toBeNull()
})
test('negative delay records original (brought forward)', () => {
  expect(applyDelay(base, -15).originalStartAt).toBe(base.startAt)
})
test('editing only the end does not mark a delay', () => {
  expect(applyEdit(base, { endAt: '2027-02-06T11:30:00.000Z' }, false).originalStartAt).toBeNull()
})
test('editing the start records the original', () => {
  expect(applyEdit(base, { startAt: '2027-02-06T09:00:00.000Z' }, false).originalStartAt).toBe(base.startAt)
})
test('correction clears the original', () => {
  const delayed = applyDelay(base, 30)
  expect(applyEdit(delayed, { startAt: '2027-02-06T09:15:00.000Z' }, true).originalStartAt).toBeNull()
})
test('edit making end <= start throws RuleError on endAt', () => {
  expect(() => applyEdit(base, { endAt: base.startAt }, false)).toThrow(RuleError)
})
```

- [ ] **Step 2: Run** `npx vitest run shared/rules.test.ts` → FAIL.
- [ ] **Step 3: Implement `shared/rules.ts`.** Pure functions, no mutation. After every change: if `originalStartAt === startAt`, set it to `null`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git add shared/rules* && git commit -m "Add delay and edit rules for schedule events"`

---

### Task 3: IST helpers and classification

**Files:**
- Create: `shared/ist.ts`, `shared/classify.ts`
- Test: `shared/classify.test.ts`

**Interfaces:**
- Consumes: `ScheduleEvent`.
- Produces:
  - `istDateKey(t: string | Date): string` → `'2027-02-06'`
  - `formatIstTime(iso: string): string` → `'14:30'` (24 h)
  - `formatIstDay(dateKey: string): string` → `'Sat 6 Feb'`
  - `type EventState = 'cancelled' | 'live' | 'upcoming' | 'ended'`; `eventState(e: ScheduleEvent, now: Date): EventState`
  - `timeShift(e: ScheduleEvent): 'delayed' | 'early' | null`
  - `classify(events: ScheduleEvent[], now: Date): { live: ScheduleEvent[]; upcomingByDay: { dateKey: string; events: ScheduleEvent[] }[] }`

Classification rules (spec §2.2–2.3): live sorted by `endAt`; upcoming = not started, grouped by `istDateKey(startAt)`, days ascending, events by `startAt`. Cancelled events never appear in `live`; a cancelled event whose `endAt` is still in the future is listed in `upcomingByDay` under its start day (shown greyed by the UI). Ended events are dropped.

- [ ] **Step 1: Write the failing tests.** Use `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'` in the implementation; the tests cover:

```ts
test('formats in IST', () => {
  expect(formatIstTime('2027-02-06T08:30:00.000Z')).toBe('14:00')
  expect(istDateKey('2027-02-06T19:00:00.000Z')).toBe('2027-02-07') // 00:30 IST next day
  expect(formatIstDay('2027-02-06')).toBe('Sat 6 Feb')
})
// now = 2027-02-06T09:00:00Z (14:30 IST); events 14:00–16:00, 16:00–17:00, 10:00–11:00 IST
test('eventState', () => {
  expect(eventState(liveEv, now)).toBe('live')        // start <= now < end
  expect(eventState(laterEv, now)).toBe('upcoming')
  expect(eventState(pastEv, now)).toBe('ended')
  expect(eventState({ ...liveEv, status: 'cancelled' }, now)).toBe('cancelled')
  expect(eventState(ev({ startAt: now.toISOString() }), now)).toBe('live')  // boundary: start == now
  expect(eventState(ev({ endAt: now.toISOString() }), now)).toBe('ended')   // boundary: end == now
})
test('event crossing IST midnight is grouped by start day and live after midnight', () => {
  // 23:30–01:00 IST on 6 Feb
  const e = ev({ startAt: '2027-02-06T18:00:00.000Z', endAt: '2027-02-06T19:30:00.000Z' })
  expect(classify([e], new Date('2027-02-06T12:00:00Z')).upcomingByDay[0].dateKey).toBe('2027-02-06')
  expect(classify([e], new Date('2027-02-06T19:00:00Z')).live).toEqual([e]) // 00:30 IST
})
test('upcoming grouped by day ascending, sorted by start; live sorted by end', () => {
  // given events on 7 Feb 10:00, 6 Feb 18:00, 6 Feb 16:00 (input in that order) and two live
  // events ending 15:30 and 15:00: dateKeys ['2027-02-06', '2027-02-07'], 6 Feb order
  // [16:00, 18:00], live order [ends 15:00, ends 15:30]
})
test('cancelled event: never live; listed under its day until its end; dropped after', () => {
  // cancelled 14:00–16:00 at now 14:30 → not in live, in upcomingByDay['2027-02-06'];
  // at 16:30 → absent everywhere
})
test('timeShift', () => {
  expect(timeShift(ev({ originalStartAt: null }))).toBeNull()
  expect(timeShift(ev({ startAt: T('14:30'), originalStartAt: T('14:00') }))).toBe('delayed')
  expect(timeShift(ev({ startAt: T('13:45'), originalStartAt: T('14:00') }))).toBe('early')
})
```

- [ ] **Step 2: Run** `npx vitest run shared/classify.test.ts` → FAIL.
- [ ] **Step 3: Implement `shared/ist.ts` and `shared/classify.ts`.**
- [ ] **Step 4: Run** `npx vitest run shared/classify.test.ts` and `TZ=America/New_York npx vitest run shared/classify.test.ts` → both PASS (Review Focus 2).
- [ ] **Step 5: Commit** `git add shared/ist.ts shared/classify* && git commit -m "Add IST helpers and live/upcoming classification"`

---

### Task 4: Database and event store

**Files:**
- Create: `server/db.ts`, `server/store.ts`
- Test: `server/store.test.ts`

**Interfaces:**
- Consumes: `applyDelay`, `applyEdit`, `RuleError` (Task 2); `EventInput`, `EventPatch`, `ScheduleEvent` (Task 1).
- Produces:
  - `openDb(path: string): Database.Database` — WAL mode; creates `events`, `admins`, `sessions`, `audit_log`, `meta` (spec §2) with `CREATE TABLE IF NOT EXISTS`; inserts `meta(version=0)` if missing. Use `':memory:'` in tests.
  - `class NotFoundError extends Error`; `class ConflictError extends Error { current: ScheduleEvent }`
  - `interface AuditEntry { id: number; at: string; admin: string; action: AuditAction; eventId: string; before: ScheduleEvent | null; after: ScheduleEvent | null }`, `type AuditAction = 'create' | 'edit' | 'delay' | 'cancel' | 'restore' | 'delete' | 'import'`
  - `createStore(db): Store` where

```ts
interface Store {
  version(): number
  list(): ScheduleEvent[]                     // not deleted, ordered by startAt
  get(id: string): ScheduleEvent | null       // null if missing or deleted
  create(input: EventInput, admin: string, action?: 'create' | 'import'): ScheduleEvent
  edit(id: string, patch: EventPatch, admin: string, action?: 'edit' | 'import'): ScheduleEvent
  delay(id: string, minutes: number, admin: string, expectedUpdatedAt?: string): ScheduleEvent
  cancel(id: string, note: string | undefined, admin: string, expectedUpdatedAt?: string): ScheduleEvent
  restore(id: string, admin: string, expectedUpdatedAt?: string): ScheduleEvent
  remove(id: string, admin: string): void
  audit(eventId?: string): AuditEntry[]       // newest first
  findByTitleAndDay(title: string, dateKey: string): ScheduleEvent | null  // for the importer
}
```

Every write runs in one `db.transaction`: load (→ `NotFoundError`), compare `expectedUpdatedAt` if given (→ `ConflictError(current)`), apply rule, write row, insert audit (`before`/`after` JSON), increment `meta.version`. `edit` always checks `patch.updatedAt`. `updatedAt` must strictly increase per event: use `new Date().toISOString()`, and if that equals the previous value, add 1 ms. Ids: `nanoid(10)`. `cancel` sets `note` only when one is given.

- [ ] **Step 1: Write the failing tests:** create → list/get/version 1 and one `create` audit row; edit with stale `updatedAt` → `ConflictError` whose `current` is the stored event; delay without `expectedUpdatedAt` applies; delay with stale one → `ConflictError`; two consecutive writes give different `updatedAt`; cancel then restore toggles status; remove hides from `list`/`get` and keeps a `delete` audit row with `before`; unknown id → `NotFoundError`; `audit('id')` newest first; edit making end ≤ start throws `RuleError` and leaves version unchanged.
- [ ] **Step 2: Run** `npx vitest run server/store.test.ts` → FAIL.
- [ ] **Step 3: Implement `server/db.ts` and `server/store.ts`.** Map snake_case columns to the camelCase `ScheduleEvent` in one `rowToEvent` function.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git add server/db.ts server/store* && git commit -m "Add SQLite event store with audit log and versioning"`

---

### Task 5: Admin accounts and sessions

**Files:**
- Create: `server/auth.ts`, `server/scripts/admin.ts`
- Test: `server/auth.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(pw: string): Promise<string>`, `verifyPassword(hash: string, pw: string): Promise<boolean>` (`@node-rs/argon2`, argon2id)
  - `upsertAdmin(db, username: string, displayName: string, password: string): Promise<void>` (adds or resets)
  - `checkLogin(db, username, password): Promise<{ username: string; displayName: string } | null>`
  - `createSession(db, username: string, now?: Date): string` — 32 random bytes, base64url; stores SHA-256 of the token with `expires_at = now + 12 h`
  - `getSessionAdmin(db, token: string, now?: Date): { username: string; displayName: string } | null` — null if unknown or expired
  - `deleteSession(db, token: string): void`
  - `SESSION_TTL_MS = 12 * 60 * 60 * 1000`

- [ ] **Step 1: Write the failing tests:** upsert then `checkLogin` succeeds with the right password, returns null with a wrong one and for an unknown user; upsert twice resets the password; session valid before 12 h, null after (`now` argument); the raw token is not stored (`SELECT` finds no row equal to it); `deleteSession` invalidates.
- [ ] **Step 2: Run** `npx vitest run server/auth.test.ts` → FAIL.
- [ ] **Step 3: Implement `server/auth.ts`.**
- [ ] **Step 4: Implement `server/scripts/admin.ts`:** `npm run admin -- add <username> <display name...>` reads `DB_PATH`, prompts for the password twice with echo off (`node:readline` on a muted output), refuses mismatches or passwords shorter than 10 chars, calls `upsertAdmin`, prints `Saved admin <username>`. Any other usage prints the usage line and exits 1.
- [ ] **Step 5: Run** tests → PASS. Manually: `DB_PATH=./dev.db npm run admin -- add parthiv Parthiv` → `Saved admin parthiv`.
- [ ] **Step 6: Commit** `git add server/auth* server/scripts/admin.ts && git commit -m "Add admin accounts, sessions and admin CLI"`

---

### Task 6: HTTP API

**Files:**
- Create: `server/app.ts`, `server/routes/public.ts`, `server/routes/admin.ts`, `server/index.ts`
- Test: `server/app.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 4, 5.
- Produces: `buildApp(opts: { db: Database.Database; cookieSecret: string; cookieSecure: boolean; logger?: boolean }): FastifyInstance` and the endpoints in spec §3.2 with these response bodies:
  - `GET /api/schedule` → `ScheduleResponse`, header `ETag: "<version>"`, `Cache-Control: no-cache`; `If-None-Match` equal to the ETag → `304`, empty body.
  - `GET /api/health` → `{ ok: true }`
  - `POST /api/admin/login` → `{ username, displayName }` + cookie; bad credentials → `401 { error: 'invalid_credentials' }`
  - `GET /api/admin/me` → `{ username, displayName }`
  - create / patch / delay / cancel / restore → the resulting `ScheduleEvent` (create: `201`)
  - `DELETE` → `204`
  - `GET /api/admin/audit?event=<id>` → `AuditEntry[]`
  - Errors: zod or `RuleError` → `400 { error: 'validation', fields: FieldErrors }`; no/expired session → `401 { error: 'unauthorized' }`; `NotFoundError` → `404 { error: 'not_found' }`; `ConflictError` → `409 { error: 'conflict', current: ScheduleEvent }`; rate limit → `429`.
- `server/index.ts` reads env per Global Constraints; exits with a clear message if `DB_PATH` is missing or `SESSION_SECRET` is shorter than 32 chars.

Implementation notes: `@fastify/cookie` with `secret: cookieSecret`, cookie signed; `@fastify/rate-limit` registered with `global: false` and applied only to the login route (`max: 10, timeWindow: '15 minutes'`). Admin routes share one `preHandler` that resolves the session and sets `request.admin`. One `setErrorHandler` maps the error classes above.

- [ ] **Step 1: Write the failing tests** with `app.inject()` against `openDb(':memory:')` and a seeded admin:
  - schedule is public, returns events and ETag; same `If-None-Match` → `304`; after a write the ETag changes.
  - admin routes without cookie → `401`; login wrong password → `401`; login ok → cookie set with `HttpOnly`, `SameSite=Strict`; `me` works with it; logout then `me` → `401`.
  - create with unknown venue → `400` with `fields.placeId === 'Unknown venue'`.
  - create → delay `{ minutes: 30, updatedAt }` → schedule shows shifted times and `originalStartAt`.
  - **double-tap (Review Focus 4):** two delays sent with the same `updatedAt` → first `200`, second `409` with `current.startAt` delayed by exactly 30 min.
  - patch with stale `updatedAt` → `409`; delete → `204`, then gone from schedule and `404` on patch.
  - audit lists `create`, `delay` for the event, newest first.
  - 11th login attempt within the window → `429`.
- [ ] **Step 2: Run** `npx vitest run server/app.test.ts` → FAIL.
- [ ] **Step 3: Implement `server/app.ts`, the two route files and `server/index.ts`.**
- [ ] **Step 4: Run** `npm test` → all PASS; `npx tsc -b` → clean.
- [ ] **Step 5: Smoke run:** `DB_PATH=./dev.db SESSION_SECRET=$(openssl rand -hex 32) COOKIE_SECURE=false npm run server`, then `curl -i localhost:8787/api/schedule` → `200` with `ETag: "0"`.
- [ ] **Step 6: Commit** `git add server/ && git commit -m "Add schedule and admin HTTP API"`

---

### Task 7: Spreadsheet importer

**Files:**
- Create: `server/import/columns.ts`, `server/import/venues.ts`, `server/import/parse.ts`, `server/scripts/import-schedule.ts`
- Test: `server/import/import.test.ts`, fixture `server/import/fixtures/sample.csv`

**Interfaces:**
- Consumes: `knownPlaces`, `eventInputSchema`, `fieldErrors`, `istDateKey`, `Store` (`create`, `edit`, `findByTitleAndDay`).
- Produces:
  - `COLUMN_MAP: Record<'title' | 'description' | 'category' | 'venue' | 'date' | 'start' | 'end' | 'note', string>` — sheet header for each field. Initial values `Title`, `Description`, `Category`, `Venue`, `Date`, `Start`, `End`, `Note`; to be replaced with the real headers once the sheet is shared (spec §6).
  - `VENUE_ALIASES: Record<string, string>` — normalised alias → place id, starting with `oat → open_air_theatre`.
  - `matchVenue(text: string, places: ReadonlyMap<string, string>, aliases: Record<string, string>): { placeId: string; room: string | null } | null`
  - `parseScheduleCsv(text: string): { ok: { line: number; input: EventInput }[]; errors: { line: number; message: string }[] }`

Venue matching (spec §6): normalise to lowercase alphanumerics and single spaces. For k = token count down to 1, take the first k tokens; if they equal a place name or an alias, the rest of the tokens (original casing) become `room` (or null if none). Otherwise fuzzy-match the whole text against place names with normalised Levenshtein similarity ≥ 0.8 (room null). Otherwise null.

Row parsing: strip a leading BOM; skip rows whose cells are all blank; `date` as `YYYY-MM-DD`, `start`/`end` as `HH:mm`, interpreted as IST (`+05:30`); category lowercased, blank → `other`; then `eventInputSchema.safeParse`. Errors carry the 1-based CSV line and a message (`Unknown venue "<text>"`, `Bad time "<text>"`, or the zod field errors joined).

Script: `npm run import-schedule -- <file.csv> [--commit]`. Always prints each ok row (`line · date start–end · title @ place (room)`) and every error. Without `--commit` it writes nothing. With `--commit` it exits 1 without writing if there are any errors; otherwise, per row, `findByTitleAndDay(title, istDateKey(startAt))` → `edit(..., 'import', 'import')` with that event's `updatedAt`, else `create(..., 'import', 'import')`. Prints `Created N, updated M`.

- [ ] **Step 1: Write the failing tests:** `matchVenue('ELHC 301')` → `{ placeId: 'elhc', room: '301' }`; `'OAT'` → `open_air_theatre`, room null; a one-letter typo of a full place name matches it; `'Mars'` → null. `parseScheduleCsv` on the fixture: ok rows have UTC times (`2027-02-06`, `14:00` → `08:30:00.000Z`); an unknown venue row and a `25:00` row appear in `errors` with their line numbers; **BOM + trailing blank rows (Review Focus 5):** the same CSV prefixed with `﻿` and suffixed with `,,,,,,,\n,,,,,,,\n` gives the same ok rows and no extra errors. Store-level: importing the same rows twice into `openDb(':memory:')` leaves one event per row (second run updates).
- [ ] **Step 2: Run** `npx vitest run server/import` → FAIL.
- [ ] **Step 3: Implement the four files.** Use `csv-parse/sync` with `columns: true`, `skip_empty_lines: true`, `bom: true`.
- [ ] **Step 4: Run** → PASS. Manually: `DB_PATH=./dev.db npm run import-schedule -- server/import/fixtures/sample.csv` prints the dry-run report.
- [ ] **Step 5: Commit** `git add server/import server/scripts/import-schedule.ts && git commit -m "Add spreadsheet import script with venue matching"`

---

### Task 8: Attendee schedule data layer

**Files:**
- Create: `src/schedule/api.ts`, `src/schedule/cache.ts`, `src/schedule/useSchedule.ts`, `src/schedule/useNow.ts`, `src/schedule/festDays.ts`, `src/schedule/ScheduleContext.tsx`
- Modify: `vite.config.ts`
- Test: `src/schedule/schedule.test.ts`

**Interfaces:**
- Consumes: `ScheduleResponse`, `ScheduleEvent`, `classify`, `eventState`, `istDateKey`, `formatIstDay`.
- Produces:
  - `API_BASE = import.meta.env.VITE_API_BASE ?? '/api'`
  - `fetchSchedule(etag: string | null): Promise<{ status: 'ok'; data: ScheduleResponse; etag: string | null } | { status: 'not-modified' }>` — throws on network error or non-2xx/304
  - `interface CachedSchedule { data: ScheduleResponse; etag: string | null; fetchedAt: number }`; `loadCachedSchedule(storage?: Storage): CachedSchedule | null` (returns null on missing, unparseable, or wrong-shaped JSON — checks `version` is a number and `events` is an array); `saveCachedSchedule(c: CachedSchedule, storage?: Storage): void` (swallows storage errors). Key `tathva-map:schedule`.
  - `useSchedule(): { events: ScheduleEvent[]; fetchedAt: number | null; stale: boolean }` — loads cache first, fetches on mount, every 30 s while `document.visibilityState === 'visible'`, and on becoming visible; `stale` when `fetchedAt` is null or older than 2 min.
  - `useNow(intervalMs = 30_000): Date`
  - `FEST_DAYS: Record<string, string>` — IST date key → `'Day 1'`; starts empty with a comment to fill in the real fest dates. `dayLabel(dateKey: string, todayKey: string): string` → `'Today'`, else `'Day 1 · Sat 6 Feb'` when listed, else `'Sat 6 Feb'`.
  - `ScheduleProvider` (wraps the map app) and `useScheduleData(): { events; now: Date; stale: boolean; fetchedAt: number | null; byPlace: ReadonlyMap<string, ScheduleEvent[]>; liveVenueIds: ReadonlySet<string>; eventVenueIds: ReadonlySet<string> }` — `eventVenueIds` = places with any live or upcoming non-cancelled event; `liveVenueIds` = places with a live event.
- `vite.config.ts`: `server.proxy = { '/api': 'http://127.0.0.1:8787' }`; in `workbox` add `navigateFallbackDenylist: [/^\/api\//, /^\/admin/]`.

- [ ] **Step 1: Write the failing tests:** `fetchSchedule` with a stubbed global `fetch` (`vi.stubGlobal`) sends `If-None-Match` when given an etag, maps `304` to `not-modified`, returns the ETag header on `200`, throws on `500`. **Corrupt cache (Review Focus 3):** `loadCachedSchedule` on a fake storage holding `'{oops'`, `'{"data":{"events":"x"}}'` and nothing all return null, and a storage whose `getItem` throws also returns null. `dayLabel` returns the three forms.
- [ ] **Step 2: Run** `npx vitest run src/schedule` → FAIL.
- [ ] **Step 3: Implement the files.**
- [ ] **Step 4: Run** → PASS; `npx tsc -b` → clean.
- [ ] **Step 5: Commit** `git add src/schedule vite.config.ts && git commit -m "Add schedule fetching, caching and context for the map app"`

---

### Task 9: Venue schedules on the map

**Files:**
- Create: `src/components/EventRow.tsx`, `src/schedule/venueSections.ts`, `src/components/layerRegistry.ts`
- Modify: `src/data/festContent.ts`, `src/data/campus.ts`, `src/components/PlacePopup.tsx`, `src/components/PlaceLayer.tsx`, `src/components/CampusMap.tsx`, `src/App.tsx`, `src/main.tsx`, `src/styles/retro.css`, `src/styles/retro-popup.css`
- Test: `src/schedule/venueSections.test.ts`

**Interfaces:**
- Consumes: `useScheduleData`, `dayLabel`, `classify`, `eventState`, `timeShift`, `formatIstTime`, `knownPlaces`.
- Produces:
  - `venueSections(events: ScheduleEvent[], now: Date): { title: string; events: ScheduleEvent[] }[]` — `'Live now'`, `'Later today'`, then one section per later day titled by `dayLabel`; empty sections omitted.
  - `<EventRow event={ScheduleEvent} now={Date} showVenue={boolean} onSelect?={() => void} />` — time (`14:30`, with the struck-through original when `timeShift` is set), title, category chip, venue name + room when `showVenue` (`knownPlaces.get(placeId) ?? 'Unknown venue'`), and one status: `DELAYED`, `EARLY`, `CANCELLED` (row greyed) or `ends in N min` (live only). Rendered as a `<button>` when `onSelect` is given, else a `<div>`.
  - `effectiveCategory(place: Place, eventVenueIds: ReadonlySet<string>): PlaceCategory` in `campus.ts` — `'event'` if the place is in the set, else `place.category`.
  - `registerPlaceLayer(id: string, layer: L.Layer | null): void`, `getPlaceLayer(id: string): L.Layer | undefined`

Changes:
- `festContent.ts`: remove `PlaceEvent`, the `events` field and every `events:` entry; keep descriptions, food, amenities and `indoorPlaces`. `campus.ts`: drop `events` from `Place` and its re-export.
- `main.tsx`: wrap `<App />` in `<ScheduleProvider>`.
- `PlacePopup.tsx`: replace the Events section with one section per `venueSections(byPlace.get(id) ?? [], now)` entry, rows via `<EventRow showVenue={false} />`; when there are none, `'No events scheduled here.'`.
- `PlaceLayer.tsx` and the point markers in `CampusMap.tsx`: colour and filter by `effectiveCategory`; register each polygon/marker with `registerPlaceLayer` via `ref`; live venues get the CSS class `place-live` (polygons: `className` path option; markers: extra class on the `divIcon`).
- `ScheduleProvider`: in dev only (`import.meta.env.DEV`), `console.warn` once per unknown `placeId` in fetched events (spec §8).
- `retro.css`: `.place-live` glows using the existing `--glow` colour (an SVG `filter: drop-shadow(...)` for paths); `@keyframes place-pulse` and `.place-pulse` (three pulses, ~1.8 s) for Task 10; both disabled under `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing test** for `venueSections` at a fixed `now`: one live, one later today, two tomorrow, one ended → titles `['Live now', 'Later today', <dayLabel tomorrow>]`, ended event absent, an unknown `placeId` event still listed.
- [ ] **Step 2: Run** `npx vitest run src/schedule/venueSections.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files and changes above.
- [ ] **Step 4: Run** `npm test`, `npx tsc -b`, `npm run lint` → all clean.
- [ ] **Step 5: Manual check:** with the server from Task 6 running and one live and one upcoming event created via `curl`, `npm run dev`: the venue glows, its popup shows "Live now" and "Later today", the Layers "Events" filter includes it.
- [ ] **Step 6: Commit** `git add -A src && git commit -m "Show live venue schedules on the map"`

---

### Task 10: Live / Up next bottom sheet and focus-on-map

**Files:**
- Create: `src/components/EventSheet.tsx`, `src/components/sheetSnap.ts`
- Modify: `src/config/mapConfig.ts`, `src/components/CampusMap.tsx`, `src/App.tsx`, `src/components/Legend.tsx`, `src/styles/retro.css`
- Test: `src/components/sheetSnap.test.ts`

**Interfaces:**
- Consumes: `useScheduleData`, `classify`, `dayLabel`, `istDateKey`, `EventRow`, `getPlaceLayer`, `placesById`.
- Produces:
  - `MAP_MOVE: 'fly' | 'jump' = 'fly'` in `mapConfig.ts`
  - `type SheetSnap = 'peek' | 'half' | 'full'`; `SHEET_PEEK_PX = 56`; `sheetHeight(snap: SheetSnap, viewportPx: number): number` (peek 56, half 50 % of viewport, full viewport minus 120 so the planner stays visible); `nearestSnap(heightPx: number, viewportPx: number): SheetSnap`
  - `<EventSheet onLocate={(placeId: string) => void} />`
  - `CampusMap` prop `focus: { placeId: string; token: number; openPopup: boolean } | null` replacing the internal `FlyToPlace`; both QR calibration and event taps go through one `FocusPlace` component.

Behaviour (spec §4.2):
- Peek strip text: `● N LIVE · M UP NEXT`; adds `Offline · updated N min ago` when `stale` and `fetchedAt` is set.
- Tabs LIVE / UP NEXT; UP NEXT renders `upcomingByDay` with `dayLabel` headers; empty states `'Nothing live right now.'` and `'Nothing else scheduled.'`.
- Drag by the handle with pointer events (`setPointerCapture`); on release snap with `nearestSnap`. Tapping the handle toggles peek ↔ half.
- Selecting a row (only when `placesById.has(placeId)`): set snap to peek, call `onLocate(placeId)`. App sets `focus = { placeId, token: token + 1 }`.
- `FocusPlace`: `MAP_MOVE === 'fly'` → `map.flyTo(pos, 18, { duration: 1.2 })` and act on `moveend`; `'jump'` → `map.setView(pos, 18)` and act at once. Then `getPlaceLayer(id)?.openPopup()` and add `place-pulse` to the layer's element for 1.8 s. QR scans pass `focus` with `openPopup: false`; event taps use `openPopup: true`.
- Legend and the zoom/scan stack sit at `bottom: calc(56px + 20px)` so the peek strip never covers them; the toast moves up the same amount.
- Popup autopan: add `SHEET_PEEK_PX` to the bottom padding (`autoPanPaddingBottomRight`).

- [ ] **Step 1: Write the failing test** for `sheetSnap`: `sheetHeight('half', 800) === 400`; `sheetHeight('full', 800) === 680`; `nearestSnap(70, 800) === 'peek'`; `nearestSnap(450, 800) === 'half'`; `nearestSnap(650, 800) === 'full'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the files and changes above.
- [ ] **Step 4: Run** `npm test`, `npx tsc -b`, `npm run lint` → clean.
- [ ] **Step 5: Manual check** in the browser at mobile size (375×812): drag between snaps; tap a live event → sheet drops to peek, map flies, building pulses, popup opens; set `MAP_MOVE = 'jump'` and confirm the instant move, then set it back; Legend and Scan QR stay visible above the strip; QR calibration still recentres.
- [ ] **Step 6: Commit** `git add -A src && git commit -m "Add Live / Up next sheet with tap-to-locate"`

---

### Task 11: Admin GUI — login and schedule list

**Files:**
- Create: `src/admin/api.ts`, `src/admin/AdminApp.tsx`, `src/admin/LoginForm.tsx`, `src/admin/ScheduleList.tsx`, `src/admin/filters.ts`, `src/admin/admin.css`
- Modify: `src/main.tsx`
- Test: `src/admin/filters.test.ts`

**Interfaces:**
- Consumes: endpoint contracts from Task 6; `classify`/`eventState`, `istDateKey`, `dayLabel`, `knownPlaces`, `EventRow`.
- Produces:
  - `class ApiError extends Error { status: number; fields?: FieldErrors; current?: ScheduleEvent }`
  - `adminApi = { me(), login(username, password), logout(), schedule(), create(input), patch(id, patch), delay(id, minutes, updatedAt), cancel(id, updatedAt, note?), restore(id, updatedAt), remove(id), audit(id) }` — all `fetch` with `credentials: 'same-origin'`, throw `ApiError` on non-2xx; network failure throws `ApiError` with `status: 0`.
  - `interface AdminFilters { day: string | null; placeId: string | null; state: EventState | null; search: string }`; `filterEvents(events: ScheduleEvent[], f: AdminFilters, now: Date): ScheduleEvent[]` (search is case-insensitive on title; includes ended events, unlike the attendee view)
- `main.tsx`: if `location.pathname.startsWith('/admin')`, render a lazy `AdminApp` (no `ScheduleProvider`, no map); otherwise the existing tree.

Behaviour (spec §5):
- `AdminApp`: calls `me()`; `401` → `LoginForm`, else the list. Any later `401` returns to login, keeping in-memory form state (Task 12).
- `LoginForm`: username, password, `Log in`; shows `Wrong username or password` on `401`, `Too many attempts, try again later` on `429`.
- `ScheduleList`: filters (day select, venue select, state select, search box), events grouped by IST day; each row shows time, title, venue, a state chip, and buttons `+15`, `+30`, `Delay…` (prompts for minutes, negative allowed), `Cancel`/`Restore`, `Edit`, plus an `Add event` button at the top. Quick actions send the row's `updatedAt`, then refetch; success shows a toast `"<title>" delayed 15 min · Undo` (Undo sends the inverse: `delay(-m)` or `restore`/`cancel`). `409` → toast `Changed by <updatedBy> <n> min ago — reload?` with a reload button. `status 0` → a persistent `Can't reach server` banner until the next success. Header shows the admin's display name and `Log out`.
- Styling: reuse `.slab`, `.btn`, `.field`, `.chip`; `admin.css` only for the table/list layout; single column below 640 px.

- [ ] **Step 1: Write the failing tests** for `filterEvents`: each filter alone, combined, search case-insensitive, ended events included when `state` is null.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm test`, `npx tsc -b`, `npm run lint` → clean; `npm run build` and confirm with `ls dist/assets` that the admin code is in its own chunk (the main `index-*.js` must not contain the string `Wrong username or password`: `grep -L` on it).
- [ ] **Step 5: Manual check** at `https://localhost:5173/admin` with the dev server and API running: log in, filter, `+15` then Undo, cancel/restore, double-tap `+15` quickly → second shows the conflict toast, stop the API → banner appears.
- [ ] **Step 6: Commit** `git add -A src && git commit -m "Add admin login and schedule list with quick actions"`

---

### Task 12: Admin GUI — event form and history

**Files:**
- Create: `src/admin/EventForm.tsx`, `src/admin/VenuePicker.tsx`, `src/admin/HistoryPanel.tsx`, `src/admin/istInputs.ts`
- Modify: `src/admin/ScheduleList.tsx`, `src/admin/AdminApp.tsx`
- Test: `src/admin/istInputs.test.ts`

**Interfaces:**
- Consumes: `adminApi`, `ApiError`, `CATEGORIES`, `knownPlaces`, `placesById` (for the preview position/outline), `MAP_IMAGE_URL`, `MAP_BOUNDS`.
- Produces:
  - `toIstInputs(iso: string): { date: string; time: string }` (`'2027-02-06'`, `'14:00'`); `fromIstInputs(date: string, time: string): string | null` (UTC ISO, or null if either is malformed)
  - `<EventForm event?={ScheduleEvent} onSaved={(e: ScheduleEvent) => void} onCancel={() => void} />`
  - `<VenuePicker value={string | null} onChange={(id: string) => void} />` — text filter over `knownPlaces` names, list of matches, and a 200 px-high non-interactive Leaflet preview (image overlay plus the selected place's polygon or a marker) centred on the selection
  - `<HistoryPanel eventId={string} />` — `audit(eventId)` rendered as `when · who · action` with a before → after list of changed fields

Behaviour (spec §5):
- Fields: title, description, category select, venue picker, room, start date + time, end date + time (IST inputs via `istInputs.ts`), note, and on edit a checkbox `Correction — don't show as delayed`.
- Create → `adminApi.create`; edit → `adminApi.patch` with only changed fields + the event's `updatedAt` + `correction`.
- `400` → show `fields[name]` under each input; `409` → `Changed by <updatedBy> <n> min ago — reload?` keeping the user's inputs; `401` → AdminApp switches to login and, after a successful login, reopens the form with the same inputs (hold the draft in `AdminApp` state).
- `Delete` on edit opens a confirm dialog (`Delete "<title>"? This removes it from the public schedule.`) then `remove`.
- `History` button on edit shows `HistoryPanel`.

- [ ] **Step 1: Write the failing tests:** `toIstInputs('2027-02-06T08:30:00.000Z')` → `{ date: '2027-02-06', time: '14:00' }`; `fromIstInputs('2027-02-06', '14:00')` → `'2027-02-06T08:30:00.000Z'`; `fromIstInputs('2027-02-06', '00:30')` → `'2027-02-05T19:00:00.000Z'`; malformed → null; both pass under `TZ=America/New_York`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm test`, `npx tsc -b`, `npm run lint` → clean.
- [ ] **Step 5: Manual check:** create an event; edit only the end time (no strikethrough on the map); edit the start (strikethrough appears); edit again with Correction ticked (strikethrough gone); submit end-before-start (field error); delete with confirm; view history.
- [ ] **Step 6: Commit** `git add -A src/admin && git commit -m "Add admin event form, venue picker and history"`

---

### Task 13: Deployment docs and final verification

**Files:**
- Create: `server/README.md`
- Modify: `README.md` (short "Live schedule" section linking to `server/README.md`)

`server/README.md` covers, per spec §7: what the service is; env vars (Global Constraints); `npm ci`, `npm run build` (static app in `dist/`), `npm run server:start`; creating admins; running the importer (dry run then `--commit`); backups with `sqlite3 "$DB_PATH" ".backup '/path/schedule-$(date +%F).db'"`; requirements on the host (same origin for `/` and `/api`, SPA fallback to `index.html` for `/admin`, process kept alive and restarted on crash); an example nginx server block (static `root dist`, `try_files $uri /index.html`, `location /api/ { proxy_pass http://127.0.0.1:8787; }`) and an example systemd unit, both labelled as examples pending confirmation of the VM setup; and the open questions from spec §7.

- [ ] **Step 1: Write the two README changes.**
- [ ] **Step 2: Full verification:** `npm test` (all pass), `npx tsc -b` (clean), `npm run lint` (clean), `npm run build` (succeeds).
- [ ] **Step 3: Production-like run:** `npm run build`, start the API with `COOKIE_SECURE=false`, `npm run preview` with the same `/api` proxy (add `preview.proxy` mirroring `server.proxy` in `vite.config.ts`), then check the map, sheet, popup and `/admin` work against it, and that reloading the map offline (DevTools → Offline) still shows the cached schedule with the Offline tag.
- [ ] **Step 4: Commit** `git add README.md server/README.md vite.config.ts && git commit -m "Document running and deploying the schedule service"`

---

## Inputs still needed (not blocking Tasks 1–6, 8–13)

- The events sheet's real column headers and a few sample rows → update `COLUMN_MAP` / `VENUE_ALIASES` in Task 7 before the real import.
- The fest dates → fill `FEST_DAYS` in `src/schedule/festDays.ts`.
- The DigitalOcean VM's setup → finalise the examples in `server/README.md`.
