# Schedule service

A small Node service (Fastify + SQLite) that holds the live event schedule. The attendee app
polls `GET /api/schedule` every 30 s; organisers edit events from the admin GUI at `/admin`.
The map itself stays a static, offline-first PWA — it only needs this service for the
schedule, and shows the last cached copy with an Offline tag when it cannot reach it.

## Configuration

Environment variables only.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_PATH` | required | SQLite file. Keep it outside the repo. Created on first start. |
| `SESSION_SECRET` | required | At least 32 characters. Signs the session cookie. |
| `PORT` | `8787` | Listen port. |
| `HOST` | `127.0.0.1` | Listen address. |
| `COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP local runs. |
| `TRUST_PROXY` | off | **Set to `1` when nginx (or any proxy) runs on the same box.** See below. |
| `ANNOUNCEMENT_URL` | `http://whatsapp:4000/api/parse-announcement` | The WhatsApp bridge's text reader, for "Add from text". Nothing breaks if it is unreachable — that one button reports it and the rest of the GUI is unaffected. |

**TRUST_PROXY matters.** The login rate limit (10 attempts / 15 min / IP) keys on the client
IP. Behind a reverse proxy without `TRUST_PROXY`, every user shares the proxy's IP, so ten
failed logins lock everyone out. `1` (or `true`) trusts exactly one hop, the connecting
proxy, and reads the client from `X-Forwarded-For`. Any other value is treated as an IP/CIDR
list. Leave it unset when the service is exposed directly.

## Build and run

```bash
npm ci
npm run build           # static app and admin GUI into dist/
export DB_PATH=/var/lib/tathva/schedule.db
export SESSION_SECRET="$(openssl rand -hex 32)"   # keep it; changing it logs admins out
export TRUST_PROXY=1
npm run server:start
```

`npm run server` is the same with auto-reload, for development.

## Admin accounts

```bash
npm run admin -- add <username> <display name>
npm run admin -- remove <username>    # deletes the account and signs it out
```

Prompts for a password (not echoed). Running it again for an existing username replaces the
password and signs that admin out everywhere. The display name is what the audit log and "changed by" messages show.

## Adding events from pasted text

`/admin` → **Add from text** takes a poster caption and fills the ordinary event form in. The
parse happens on the WhatsApp bridge, which asks a language model to read it; this service only
relays the call, so the browser never talks to the bridge and the parse sits behind the admin
session. That matters for more than tidiness: each call spends model quota, and an open parse
endpoint is a free language model for whoever finds it.

Nothing on that path writes. The answer is validated field by field here (`import/announcement.ts`)
and anything that does not survive is **dropped and listed** rather than stored — an unknown
venue, a time that will not parse, a category that is not one of ours, or the literal string
`"Null"`, which is how an absent optional field can come back from a model that answers in prose.
The event exists only once a person has read the draft and pressed Create.

## Bulk edits

Tick several events in the list and one change — start time, end time, venue, type — applies to
all of them, each on its own day. It exists for imported placeholder windows: a couple of dozen
events timed 09:00–18:00 each look live for nine hours, and fixing them one at a time is a couple
of dozen round trips.

**Correction** is on by default there, because resetting a placeholder window is a fix, not a
delay, and marking two dozen events "delayed" would tell attendees something untrue.

Each event is written separately with its own `updatedAt`, so one that the bridge moved while the
selection sat open fails its own check and the rest still go through. What failed stays ticked,
with the reason, so pressing Apply again retries exactly those.

## History and reverting

`/admin` → **History** is the audit log: who changed what, when, with before and after. Sheet
imports are hidden by default, since there are a hundred-odd of them.

**Revert** writes the fields of one entry back. It deliberately does not write the whole stored
row back, because that would restore `updatedBy` too: a revert of a bot's change would look like
an import, which would hand the event back to the sheet-overwrite rule and let the next sync
silently undo the revert. Reverting the fields as the admin doing it keeps the history honest —
the revert appears in the log as its own edit — and keeps that protection.

## Importing the events sheet

Export the sheet as CSV, then:

```bash
npm run import-schedule -- events.csv            # dry run: prints every row and every problem
npm run import-schedule -- events.csv --commit   # writes
```

The sheet keeps the date in the **tab name**, not in the rows, so export one tab at a time
and say which day it is:

```bash
npm run import-schedule -- day1.csv --date=2027-02-06 --commit
npm run import-schedule -- day2.csv --date=2027-02-07 --commit
npm run import-schedule -- everyday.csv --every-day --commit
```

`--date` fills in rows that have no Date cell; a row that has one still wins. `--every-day`
turns each row into one event per fest day, for the "everyday events" tab — it reads the
dates from `FEST_DAYS` in `src/schedule/festDays.ts` and refuses to run while that is empty.
The expansions share a title and differ by day, which is what the store matches on, so they
stay three distinct events and keep their ids across re-imports.

`--commit` is all-or-nothing: it refuses to run while any row has an error. Re-running
updates events matched by title + IST day instead of duplicating them, so the sheet can be
re-imported after edits (but a row whose title or day changed becomes a new event).

**Warning:** re-importing overwrites the times, venues and notes of every matched event with the
sheet's values, including anything changed in `/admin` since the last import. Import
reschedules are treated as corrections, so they are not shown as DELAYED.

`--skip-errors` imports the rows that parsed and lists the rest. Without it one bad row
stops the whole import, which is right when the sheet is meant to be complete and wrong
while it is still being written. The three fest days go in as:

```bash
npm run import-schedule -- Day_1.csv --date=2026-10-09 --commit --skip-errors
npm run import-schedule -- Day_2.csv --date=2026-10-10 --commit --skip-errors
npm run import-schedule -- Day_3.csv --date=2026-10-11 --commit --skip-errors
npm run import-schedule -- Everyday.csv --every-day --commit --skip-errors
```

### What the sheet actually looks like

Two header vocabularies are accepted, so both the canonical columns below and the real
events sheet import. The sheet says `Event` for the title and keeps the start and end
together in one `Time` column; it also opens each tab with a title row (`DAY 1`) above the
headers, so the header row is found by name rather than assumed to be first.

`Time` is read by `server/import/times.ts`, which parses an unambiguous range and **guesses
nothing else** — no default durations, no inferred AM, no invented end times. A cell holding
only a start, prose, or its own date is reported and added in `/admin` by someone who knows
what it meant. `11:00PM to 12:30PM` is passed through to fail validation rather than
silently read as 11 AM, which would be a twelve-hour guess.

Category comes from the sheet's section headings (`EXPO:`, `Informals:`) where there is no
Category column; the mapping is `SECTION_CATEGORIES` in `columns.ts`.

Expected columns (headers are mapped in `server/import/columns.ts`, which also holds the
venue aliases such as `OAT`):

| Column | Format |
| --- | --- |
| Title | Required. Must be unique per day. |
| Description, Note | Optional. |
| Category | `workshop`, `competition`, `talk`, `cultural`, `proshow`, `other` (blank is `other`). |
| Venue | A place name, an alias, or a place plus room (e.g. a building and "301"). Unknown venues are errors. |
| Date | `YYYY-MM-DD` |
| Start, End | `HH:mm`, 24-hour, IST. |

Start and End share the one Date column, and an end before the start is an error, so an
event that runs past midnight cannot be expressed in the sheet: end it at 23:59 and edit it
in the admin GUI.

## Before the fest

- Fill in `FEST_DAYS` in `src/schedule/festDays.ts` (IST date to "Day 1" etc.), then rebuild.
- Create the admin accounts and do the import.
- On real phones over campus Wi-Fi, check the bottom sheet drags smoothly.

## Backups

```bash
sqlite3 "$DB_PATH" ".backup '/path/schedule-$(date +%F).db'"
```

Safe while the service is running. Do not just `cp` the file.

## Two schedules, and how they drift

`/api/schedule` can be served by two different things, and it is not obvious from the outside
which one an attendee is reading:

| | Source | Changes when |
| --- | --- | --- |
| **The service** | SQLite, this repo's `server/` | Instantly — admin GUI, WhatsApp bridge, importer |
| **`public/api/schedule`** | A committed file, copied into `dist/` | Only when someone rebuilds and deploys |

A deployment with no backend — Vercel, or any static host — serves the file. The app cannot
tell the difference: same path, same shape, same ETag behaviour. So the site keeps serving a
schedule that is perfectly valid and quietly hours old, and nothing anywhere reports it.

**This has already bitten once.** On day 1 the hosted site showed 48 events while the service
held 115: everything the bridge and the organisers had added since the morning's build was
missing, including Tathack, both days of Robowars and all 21 informals acts.

Rebuild the file from whichever source is authoritative:

```bash
npm run static-schedule     # from the CSV exports - before the service exists
npm run snapshot-schedule   # from the running service - once it does
```

`static-schedule` only knows what is in the CSVs, so running it once the bridge is live would
*drop* everything the bridge added. Use `snapshot-schedule` from then on.

**A snapshot is still frozen.** A delay entered at 3pm reaches nobody until the next deploy.
The real fix is to put the service behind the same origin and let `/api` reach it.

**If you do that on Vercel, delete `public/api/schedule` first.** Vercel checks the filesystem
before it applies `rewrites`, so a real file at `/api/schedule` wins over a rewrite pointing at
the backend — the site would go on serving the stale snapshot and the rewrite would look broken
for no visible reason. After deploying, check with `curl -i https://<host>/api/schedule` that
the `ETag` changes when an event is edited.

## What the host needs

- The app and `/api` on the **same origin**: static files at `/`, the API proxied at `/api`.
  The session cookie is `SameSite=Strict` and there is no CORS, so separate origins will not work.
- `/admin` must fall back to `index.html` (it is a single-page route).
- HTTPS in production (the cookie is `Secure`), and the Node process kept alive and
  restarted if it crashes.
- One instance only; SQLite is the store.

## Examples (not final)

These are untested sketches until the VM's setup is confirmed.

nginx:

```nginx
server {
  server_name map.example.org;
  root /srv/tathva-map/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / {
    try_files $uri /index.html;
  }
}
```

systemd (`/etc/systemd/system/tathva-schedule.service`):

```ini
[Unit]
Description=Tathva schedule service
After=network.target

[Service]
WorkingDirectory=/srv/tathva-map
EnvironmentFile=/etc/tathva-schedule.env
ExecStart=/usr/bin/npm run server:start
Restart=always
User=tathva

[Install]
WantedBy=multi-user.target
```

`/etc/tathva-schedule.env` holds `DB_PATH`, `SESSION_SECRET`, `TRUST_PROXY=1`, and so on.

## Open questions for whoever runs the VM

- Is nginx (or another proxy) already in front of the main site?
- Which subdomain or path does the map get?
- How are processes kept running (systemd, pm2, Docker)?
- Is TLS already set up?
