# OpenWard — hospital-local backend (`server/`)

This is the start of moving OpenWard from a **browser-owned** app to a
**hospital-local** one: a small Node service on the hospital LAN that owns the
database, authentication, authorization, and the audit log. The browser becomes
an **untrusted UI** that calls this service's API. No cloud; still FOSS and cheap.

```
Hospital LAN users
  → Browser / Electron UI
  → http(s)://openward.local              (this Node service is the trust boundary)
  → server-owned SQLite (node:sqlite, WAL, FKs)  →  Postgres later for larger sites
  → append-only HMAC audit  +  local encrypted backups
```

## Run it

Requires Node 22+ (uses the built-in `node:sqlite` — **no `npm install`, no native build**).

```bash
npm start            # node --experimental-sqlite server/index.js  → http://localhost:8090
```

- First run creates an `admin` (it_admin). The password comes from
  `OPENWARD_ADMIN_PASSWORD`, or a random one is generated and printed **once**.
  There are **no hardcoded credentials**.
- The DB and the audit signing key live in `server/data/` (gitignored). The
  audit key can also be supplied via `OPENWARD_AUDIT_KEY` (kept out of the DB).
- Env: `PORT`, `OPENWARD_DATA`, `OPENWARD_ADMIN_PASSWORD`, `OPENWARD_AUDIT_KEY`.

```bash
npm test             # runs the client-logic suite AND the backend suite (test/test_server.js)
```

## What slice 1 delivers (the trust boundary)

The point of the first slice is to prove the architecture, not to port every
screen. It directly executes the review's top priorities:

- **Server-owned DB** (`db.js`) with **one idempotent schema path** for fresh and
  existing DBs (fixes the browser app's fresh-vs-migrated divergence), `PRAGMA
  foreign_keys=ON`, WAL, `secure_delete`, and the "one active admission per
  patient" constraint enforced at the DB.
- **Real auth** (`auth.js`): scrypt password KDF (not salted SHA-256),
  server-held sessions as opaque `HttpOnly; SameSite=Strict` cookies (`Secure`
  over TLS), idle + absolute timeout, **revocation on user-disable**, and
  **server-side** login throttling stored in the DB.
- **Central RBAC/ABAC** (`rbac.js`) checked on **every** protected route — plus
  patient-scope filtering (a doctor only loads their attending patients). Sidebar
  visibility is no longer the security boundary.
- **Tamper-evident audit** (`audit.js`): append-only, **HMAC chain whose key is
  outside the DB**, so a DB-editing insider can't forge it; reads are audited too.
- **HTTP API** (`http.js`, `index.js`): `/api/login`, `/api/logout`, `/api/me`,
  `/api/patients` (scoped), `/api/audit` (role-gated), security headers, and it
  serves the existing UI during migration. `test/test_server.js` proves it live
  (401 unauth → 403 RBAC → 200 scoped, cookie sessions, logout revocation).

## Migration roadmap (next slices)

1. **Port the schema + seed** from `js/db.js` into `server/db.js` (all tables,
   constraints, triggers) under the single `applySchema()`.
2. **Resource APIs + transactions**: admissions, orders (CPOE), MAR, labs,
   discharge — each multi-row workflow wrapped in a transaction, with optimistic
   `version` columns.
3. **Rewrite the UI** to call the API (`fetch`) instead of `dbGet/dbAll/dbRun`;
   remove `sql.js`/IndexedDB as the source of truth (IndexedDB → offline cache
   only, with a queued-write sync).
4. **Real-time** via SSE/WebSocket (bed board, MAR, labs, pharmacy, inbox).
5. **MFA** (TOTP/WebAuthn) for admin, pharmacist verify, code status, break-glass.
6. **Encrypted backups** + restore-with-schema-validation; local TLS cert.
7. **Clinical governance**: gate dosing/sepsis/code-status/lab-release behind
   reviewed, versioned rules; remove one-click auto-dose until validated.
8. **Postgres** option for larger sites (same schema, swap the DB layer).

## Status

Foundation only. The legacy browser app still runs and is still the feature-
complete UI; it has **not** yet been migrated to these APIs. Do not treat this as
a production HIS — it is the correct *trust boundary* to build the rest on.
