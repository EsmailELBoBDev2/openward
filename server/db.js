'use strict';
// OpenWard — hospital-local backend: server-owned SQLite via Node's built-in
// node:sqlite (real file DB, WAL, transactions — no native build, no npm).
// Run the server/tests with:  node --experimental-sqlite
//
// THE key architectural change from the browser app: the database lives here, in
// the local service process. Browsers never touch it directly; they call the API.
const { DatabaseSync } = require('node:sqlite');

// ONE idempotent schema path, used for BOTH fresh and existing databases. The
// browser app's bug was that ALTER/trigger/constraint statements ran only when
// restoring an existing DB, so fresh installs were missing columns + clinical
// constraints. Here there is a single applySchema() and a schema_version row.
const SCHEMA_VERSION = 1;

function applySchema(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');     // referential integrity actually enforced
  db.exec('PRAGMA secure_delete = ON');    // deleted rows zeroed (no free-page PHI remnants)

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL,
      department_id INTEGER,
      is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id   TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      created_at   TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      account    TEXT NOT NULL,
      attempt_ms INTEGER NOT NULL,
      success    INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0,1))
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(account, attempt_ms);

    CREATE TABLE IF NOT EXISTS audit_log (
      log_id    INTEGER PRIMARY KEY,
      ts        TEXT NOT NULL,
      user_id   INTEGER,
      action    TEXT NOT NULL,
      detail    TEXT NOT NULL DEFAULT '',
      prev_hash TEXT NOT NULL,
      row_hash  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      patient_id INTEGER PRIMARY KEY AUTOINCREMENT,
      mrn        TEXT NOT NULL UNIQUE,
      full_name  TEXT NOT NULL,
      dob        TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admissions (
      admission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id   INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
      dept_id      INTEGER,
      attending_id INTEGER REFERENCES users(user_id),
      status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','discharged')),
      admitted_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id);
    -- clinical constraint enforced at the DB, not the UI: one ACTIVE admission/patient
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_active_per_patient
      ON admissions(patient_id) WHERE status = 'active';
  `);

  db.prepare('INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run('schema_version', String(SCHEMA_VERSION));
}

function openDb(path) {
  const db = new DatabaseSync(path || ':memory:');
  applySchema(db);
  return db;
}

module.exports = { openDb, applySchema, SCHEMA_VERSION };
