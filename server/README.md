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
```

Prompts for a password (not echoed). Running it again for an existing username replaces the
password. The display name is what the audit log and "changed by" messages show.

## Importing the events sheet

Export the sheet as CSV, then:

```bash
npm run import-schedule -- events.csv            # dry run: prints every row and every problem
npm run import-schedule -- events.csv --commit   # writes
```

`--commit` is all-or-nothing: it refuses to run while any row has an error. Re-running
updates events matched by title + IST day instead of duplicating them, so the sheet can be
re-imported after edits (but a row whose title or day changed becomes a new event).

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
