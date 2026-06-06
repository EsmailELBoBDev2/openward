# OpenWard LAN Server (central database)

This turns OpenWard from a browser-only app (where **each browser has its own
IndexedDB**, so two workstations never share data) into a **client–server** app:
one process on the hospital PC owns **one** SQLite database, and every
workstation's browser talks to its JSON `/api`. All clients then read and write
the **same** data.

> Why this exists: hosting the static files over `http://server-ip:port` only
> shares the HTML/JS — the database still lived in each visitor's browser. A
> shared database needs a server that owns it. That's this.

## Run it (on the hospital PC)

```bash
node server/server.js                      # serves http://0.0.0.0:8080 on the LAN
HOST=127.0.0.1 PORT=9000 node server/server.js   # custom bind
```

No `npm install` — it uses only Node built-ins plus the vendored `sql.js`.
Other workstations open `http://<hospital-pc-ip>:8080`.

- **Central DB:** `server/data/openward.sqlite` (created on first run).
- **Audit key:** `server/data/audit.key` — the HMAC key for the audit chain,
  stored **outside** the DB so a DB-only edit can't silently forge the chain.
- **Seeded logins (dev):** `admin / HIS@2024` (it_admin), `er.doc / doctor123`
  (emergency_doctor), `nurse / nurse123` (nurse). Change these before real use.

Quick check it's really central:
```bash
curl -i -c jar -X POST localhost:8080/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"HIS@2024"}'
curl -b jar localhost:8080/api/patients
```

## What this slice does (server-authoritative)

- **Auth:** login verifies PBKDF2 hashes **on the server**; the session is an
  `HttpOnly; SameSite=Strict` cookie (no session id in JS). DB-backed lockout.
- **RBAC:** every endpoint checks the caller's role server-side (`can()`),
  independent of the UI.
- **Audit:** every write logs to `audit_log` with the real client **IP** and an
  **HMAC chain** keyed outside the DB.
- **Concurrency:** one process owns the DB (Node serializes requests);
  multi-step writes use `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` (e.g. registration
  rejects a double-booked bed atomically).
- **Endpoints:** `POST /api/login`, `POST /api/logout`, `GET /api/me`,
  `GET/POST /api/patients`, `GET /api/beds`, `POST /api/vitals`.

Covered by `test/test_server.js` (auth, RBAC denial, transactional bed conflict,
**a second client seeing the first's write**, audit chain).

## Not done yet (honest roadmap)

This is **slice 1**. The browser UI still uses the old in-browser DB for most
screens; those flows are migrated to `/api` (via `js/api.js`) slice by slice:

1. ✅ Server owns the DB; auth/RBAC/audit; patients + beds + vitals endpoints.
2. ⬜ Wire the browser **login** to `/api/login` (drop client-side `login()`).
3. ⬜ Migrate registration, beds, vitals, orders, MAR, dispensing, discharge,
   labs, portal to `/api` and delete their `dbRun/dbGet/saveDBToIndexedDB`
   source-of-truth use (keep `localStorage` for UI prefs only).
4. ⬜ Server push (WebSocket/SSE) to replace `BroadcastChannel` for live updates.
5. ⬜ Server-side backup/restore (scheduled, encrypted, off-machine) and remove
   the in-UI "Reset Database" from server builds.
6. ⬜ Row versioning / conflict detection on hot rows (beds, stock, MAR).

## Operational must-dos before real PHI

- **HTTPS.** LAN HTTP is cleartext — passwords/PHI cross the network in the open,
  and the browser's Web Crypto needs a secure context. Front this with a local CA
  cert (e.g. a reverse proxy or Node `https`).
- **One owner.** Never run two servers against the same file, and never put
  `openward.sqlite` on SMB/NFS — SQLite can corrupt when network file locking
  misbehaves.
- **Back up** `server/data/` (DB + audit key) off the machine; test restores.
