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
# Local (this PC) — works out of the box on loopback:
node server/server.js                      # http://127.0.0.1:8080
# LAN (other workstations) — bind all interfaces; plain HTTP is REFUSED off-loopback:
HOST=0.0.0.0 HTTPS_KEY=key.pem HTTPS_CERT=cert.pem node server/server.js
```

No `npm install` — it uses only Node built-ins plus the vendored `sql.js`.
The default bind is **loopback (127.0.0.1)**; for the LAN set `HOST=0.0.0.0` with
a TLS cert (or `OPENWARD_INSECURE_HTTP=1` for a throwaway demo). LAN clients then
open `https://<hospital-pc-ip>:8080`.

- **Central DB:** `server/data/openward.sqlite` (created on first run; FK enforcement
  is ON server-side — orphan clinical rows are rejected).
- **Audit key:** `server/data/audit.key` — the HMAC key for the audit chain,
  stored **outside** the DB so a DB-only edit can't silently forge the chain.
- **First run (no default accounts):** with no `OPENWARD_DEMO`, the server starts
  with **zero users** and prints a **one-time setup token** to the console. Create
  the first admin once, from the hospital PC, with that token:
  ```bash
  curl -X POST 127.0.0.1:8080/api/setup -H 'Content-Type: application/json' \
    -d '{"token":"<printed-token>","username":"admin","password":"<a strong password>","full_name_en":"IT Admin"}'
  ```
  `/api/setup` requires the token **and** a loopback connection, and closes after
  the first account.
  `/api/setup` is refused once any account exists.
- **Demo accounts (opt-in):** `OPENWARD_DEMO=1 node server/server.js` seeds
  `admin / HIS@2024`, `er.doc / doctor123`, `nurse / nurse123`, `consultant /
  doctor123` + a starter formulary. Never use demo mode for real data.
- **HTTPS:** `HTTPS_KEY=key.pem HTTPS_CERT=cert.pem node server/server.js` serves
  over TLS and marks the session cookie `Secure`. Use a local CA cert before real
  PHI (LAN HTTP is cleartext).

Config env: `HOST`, `PORT`, `OPENWARD_DEMO`, `HTTPS_KEY`/`HTTPS_CERT`,
`TRUST_PROXY` (believe `X-Forwarded-For` only behind a real proxy),
`OPENWARD_DATA_DIR`.

Quick check it's really central (demo mode):
```bash
OPENWARD_DEMO=1 node server/server.js &
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
- **Endpoints:** `GET /api/health`, `POST /api/setup` (first-run only),
  `POST /api/login`, `POST /api/logout`, `GET /api/me`,
  `GET/POST /api/patients`, `GET /api/patients/:id`, `GET /api/beds`,
  `POST /api/vitals`, `GET/POST /api/prescriptions` (formulary-only),
  `POST /api/lab-orders`, `GET /api/audit` (role-gated).

Covered by `test/test_server.js` + `test/test_setup.js` (auth, RBAC denial,
transactional bed conflict, **a second client seeing the first's write**,
formulary-only prescribing, no secret leakage in patient detail, role-gated audit,
audit chain, **FK enforcement** of orphan rows, path-traversal, **first-run setup
with no default accounts**).

## This IS the production target (decision locked)

OpenWard's agreed architecture is **a local LAN server**: one hospital PC runs
this process and owns the one database; every workstation/phone/tablet is just a
browser client hitting `/api`. No cloud. The SQLite file is owned by this one
process only — never shared over SMB/NFS, never opened directly by clients. (If
Node is unwanted, this same design can be a single Rust/Go binary; Node here has
zero npm deps.)

## Roadmap — the remaining work is the UI migration

The server is now substantial; the big remaining job is moving the **browser UI**
off the in-browser sql.js/IndexedDB source-of-truth onto `/api`. Because the UI's
DB calls are synchronous and `/api` is async, this is done screen-by-screen:

1. ✅ Server owns the DB; auth/RBAC/audit/transactions; patients, beds, vitals,
   prescriptions, lab orders, patient detail, audit endpoints.
2. ⬜ Wire the browser **login** to `/api/login` (load `js/api.js`; drop the
   client-side `login()` for staff).
3. ⬜ Migrate registration → beds → vitals → orders → MAR → dispensing → labs →
   discharge → portal to `/api`, deleting their `dbRun/dbGet/saveDBToIndexedDB`
   source-of-truth use (keep `localStorage` for UI prefs only).
4. ⬜ Server push (WebSocket/SSE) to replace `BroadcastChannel` for live updates.
5. ⬜ Server-side backup/restore (scheduled, encrypted, off-machine); remove the
   in-UI "Reset Database" from server builds.
6. ⬜ Row versioning / conflict detection on hot rows (beds, stock, MAR).

## Operational must-dos before real PHI

- **HTTPS.** LAN HTTP is cleartext — passwords/PHI cross the network in the open,
  and the browser's Web Crypto needs a secure context. HTTPS is built in: pass
  `HTTPS_KEY`/`HTTPS_CERT` (a local CA cert). Until then it runs plain HTTP.
- **One owner.** Never run two servers against the same file, and never put
  `openward.sqlite` on SMB/NFS — SQLite can corrupt when network file locking
  misbehaves.
- **Back up** `server/data/` (DB + audit key) off the machine; test restores.
- **FK retrofit.** Foreign keys are defined in `CREATE TABLE` and enforced
  server-side (`PRAGMA foreign_keys=ON`, re-asserted after each `sql.js` export).
  SQLite can't ALTER-add FKs to tables created *before* those clauses, so a
  pre-FK `server/data/openward.sqlite` stays unconstrained — boot logs any
  `foreign_key_check` violations; for a clean FK-enforced DB, recreate
  `server/data` (a full table-rebuild migration is deferred as too risky pre-release).
