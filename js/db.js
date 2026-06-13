// ============================================================
// HIS — Database Module (sql.js / SQLite in browser)
// ============================================================

let db = null; // single SQLite database instance

// ============================================================
// Shared server-DB mode
// ------------------------------------------------------------
// When the page is served by the OpenWard LAN server (server/server.js), the UI
// runs every dbGet/dbRun/dbAll against that server's ONE central SQLite file
// (via /api/db/*) instead of this browser's private IndexedDB copy — so two or
// more workstations read and write the SAME database in real time ("host the
// app on the PC, staff log in and edit one shared DB like a normal local app").
// The browser is still the UI; the server process stays the single file owner.
//
// Detected once at boot. OFF for file:// and the static dev server (serve.py) —
// those keep the original browser-local IndexedDB behavior, fully unchanged.
// Synchronous XMLHttpRequest is used deliberately: it lets the thousands of
// existing synchronous dbGet/dbRun call sites work untouched, and the server is
// on the LAN/loopback so round-trips are fast.
// ============================================================
let SERVER_MODE = false;
let _serverLastId = null;   // last_insert_rowid() from the most recent server exec

function detectServerMode() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/health', false);
    xhr.send();
    if (xhr.status === 200) {
      const h = JSON.parse(xhr.responseText);
      return !!(h && h.server === 'openward');
    }
  } catch (e) { /* no server -> browser-local mode */ }
  return false;
}

function _serverSql(endpoint, sql, params) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/db/' + endpoint, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify({ sql: sql, params: params || [] }));
  if (xhr.status !== 200) {
    let msg = 'server DB error (' + xhr.status + ')';
    try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) {}
    throw new Error(msg);
  }
  return JSON.parse(xhr.responseText);
}

// True while the install has no user accounts yet (set by initDB). The boot
// script in index.html shows the Demo/Production chooser and clears it via
// completeFirstRun().
let DB_NEEDS_FIRST_RUN = false;

// Called by the first-run chooser. 'demo' seeds the full sample hospital
// (demo logins + fake patients). 'production' seeds ONLY reference data
// (departments, formulary, supplies, interaction table) and creates the
// IT-admin account the operator just typed — no default credentials exist.
async function completeFirstRun(mode, admin) {
  if (!DB_NEEDS_FIRST_RUN) return;
  if (mode === 'production') {
    await seedData({ demo: false });
    await createFirstAdmin(admin && admin.username, admin && admin.password);
  } else {
    await seedData();
  }
  DB_NEEDS_FIRST_RUN = false;
  await saveDBToIndexedDB();
}

async function createFirstAdmin(username, password) {
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 characters (letters, digits, . _ -)');
  if (String(password || '').length < 10) throw new Error('Admin password must be at least 10 characters');
  if (dbGet('SELECT user_id FROM users WHERE username = ?', [username])) throw new Error('Username already exists');
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  db.run(`INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 'it_admin', 12, 1, ?)`,
    [username, hash, salt, 'مدير النظام', 'System Administrator', nowISO()]);
}

/**
 * Initialize the database: load sql.js WASM, create or restore DB
 */
async function initDB() {
  // Server mode: the central server owns the schema, seed, and persistence —
  // skip all local sql.js / IndexedDB setup. dbGet/dbRun/dbAll proxy to /api/db.
  SERVER_MODE = detectServerMode();
  if (SERVER_MODE) {
    console.log('[DB] Server mode — using the central shared database at /api/db (no browser-local copy)');
    return;
  }

  const SQL = await initSqlJs({
    locateFile: file => `vendor/${file}`
  });

  // Restore from IndexedDB with backup-rotation recovery: tries the newest saved
  // version (transparently unlocking it if encrypted) and falls back to an older
  // backup if the newest copy is unreadable. See loadDatabaseWithRecovery.
  db = await loadDatabaseWithRecovery(SQL);
  let _freshDb = false;
  if (db) {
    console.log('[DB] Restored database from IndexedDB');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
    createAllTables();
    _freshDb = true;
  }

  // Schema migrations run for BOTH fresh and restored DBs (previously only the
  // restored path). They are idempotent (ALTER ... ADD COLUMN wrapped in
  // try/catch, CREATE TABLE/INDEX IF NOT EXISTS), so a brand-new install gets
  // every column/table the router uses (vitals NEWS2 fields, drugs.is_high_alert,
  // lab rejection columns, MAR witness columns) instead of crashing at runtime.
  applySchemaMigrations();

  // First-run gate: a database with NO user accounts (brand-new install, or a
  // first run interrupted before a mode was chosen) must not silently seed demo
  // credentials. The boot script shows a Demo-vs-Production chooser and calls
  // completeFirstRun(); login stays gated until then. Detection is "no users",
  // not "no DB blob", so a refresh mid-choice can't brick the install — the
  // schema-only DB simply re-enters first-run on the next boot.
  if (_freshDb || !dbGet('SELECT user_id FROM users LIMIT 1')) {
    DB_NEEDS_FIRST_RUN = true;
    console.log('[DB] First run — waiting for Demo/Production choice');
  }

  // Connection pragmas + one-time VACUUM (gated by user_version) to purge any
  // pre-existing free-page remnants. See _reassertConnectionPragmas for why the
  // pragmas must be re-applied after every db.export().
  _reassertConnectionPragmas();
  try {
    const uv = db.exec('PRAGMA user_version');
    const ver = (uv && uv[0]) ? uv[0].values[0][0] : 0;
    if (ver < 1) { db.run('VACUUM'); db.run('PRAGMA user_version = 1'); }
  } catch (e) {}

  // Auto-save every 30 seconds
  setInterval(() => saveDBToIndexedDB(), 30000);

  // Flush pending writes when the tab is hidden or closing. Without this, a write
  // made between two 30s ticks (a nurse records vitals, then the tab is closed,
  // crashes, or the laptop sleeps) lives only in the in-memory DB and is LOST on
  // next boot — the old IndexedDB blob is restored instead. 'visibilitychange ->
  // hidden' is the reliable signal (it fires on tab switch, minimize, and most
  // closes); 'pagehide' is the belt-and-braces fallback. The save is async and a
  // hard kill can still truncate it, but this closes the common-case data loss.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { try { saveDBToIndexedDB(); } catch (e) {} }
    });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', () => { try { saveDBToIndexedDB(); } catch (e) {} });
  }
}

// Idempotent schema migrations, applied to BOTH fresh and restored databases
// (called from initDB). Kept as one function so a brand-new install and the
// fresh-DB boot test build the exact same schema.
function applySchemaMigrations() {
    // Schema migrations for existing databases
    try { db.run('ALTER TABLE prescriptions ADD COLUMN verified_by INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE prescriptions ADD COLUMN verified_at TEXT'); } catch(e) {}
    // MAR + critical ack migrations
    try { db.run(`CREATE TABLE IF NOT EXISTS med_admin_records (
      mar_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER NOT NULL,
      admission_id   INTEGER NOT NULL,
      drug_name      TEXT NOT NULL,
      dose           TEXT NOT NULL,
      route          TEXT NOT NULL,
      scheduled_time TEXT,
      administered_at TEXT,
      administered_by INTEGER,
      status         TEXT DEFAULT 'pending',
      hold_reason    TEXT,
      notes          TEXT
    )`); } catch(e) {}
    try { db.run(`CREATE TABLE IF NOT EXISTS lab_critical_acks (
      ack_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL UNIQUE,
      doctor_id   INTEGER NOT NULL,
      acked_at    TEXT NOT NULL,
      comments    TEXT
    )`); } catch(e) {}
    // Fix seed data: set is_critical=1 for any resulted lab with a critical flag
    try { db.run(`UPDATE lab_orders SET is_critical = 1 WHERE (result_flag LIKE '%critical%') AND status = 'resulted' AND is_critical = 0`); } catch(e) {}
    // Vitals extended fields for NEWS2
    try { db.run('ALTER TABLE vitals_log ADD COLUMN resp_rate INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN on_o2 INTEGER DEFAULT 0'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN consciousness TEXT DEFAULT "alert"'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN news2_score INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN qsofa_score INTEGER'); } catch(e) {}
    // Clinical assessment scales
    try { db.run(`CREATE TABLE IF NOT EXISTS clinical_assessments (
      assess_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      assess_type   TEXT NOT NULL,
      score         INTEGER,
      risk_level    TEXT,
      details_json  TEXT,
      assessed_by   INTEGER NOT NULL,
      assessed_at   TEXT NOT NULL
    )`); } catch(e) {}
    // Fluid balance I&O
    try { db.run(`CREATE TABLE IF NOT EXISTS fluid_balance (
      fb_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      type          TEXT NOT NULL,
      category      TEXT NOT NULL,
      amount_ml     REAL NOT NULL,
      recorded_by   INTEGER NOT NULL,
      recorded_at   TEXT NOT NULL,
      shift         TEXT,
      notes         TEXT
    )`); } catch(e) {}
    // Order set instances
    try { db.run(`CREATE TABLE IF NOT EXISTS order_set_log (
      log_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      set_name      TEXT NOT NULL,
      applied_by    INTEGER NOT NULL,
      applied_at    TEXT NOT NULL
    )`); } catch(e) {}
    // Order-set meds with no formulary match: a clinician must prescribe them
    // manually. Tracked here (not as a fake nurse task) so they stay visible and
    // actionable instead of vanishing.
    try { db.run(`CREATE TABLE IF NOT EXISTS order_set_exceptions (
      exc_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      set_name      TEXT,
      item_type     TEXT DEFAULT 'med',
      drug_name     TEXT NOT NULL,
      dose          TEXT,
      route         TEXT,
      frequency     TEXT,
      reason        TEXT,
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      status        TEXT DEFAULT 'pending'
    )`); } catch(e) {}
    try { db.run("ALTER TABLE order_set_exceptions ADD COLUMN item_type TEXT DEFAULT 'med'"); } catch(e) {}
    // Code Blue events
    try { db.run(`CREATE TABLE IF NOT EXISTS code_blue_events (
      event_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER,
      admission_id  INTEGER,
      location      TEXT,
      event_type    TEXT DEFAULT 'code_blue',
      initiated_by  INTEGER NOT NULL,
      initiated_at  TEXT NOT NULL,
      outcome       TEXT,
      duration_min  INTEGER,
      notes         TEXT,
      resolved_at   TEXT
    )`); } catch(e) {}
    // Home medications (medication reconciliation)
    try { db.run(`CREATE TABLE IF NOT EXISTS home_medications (
      hm_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL,
      admission_id  INTEGER,
      drug_name     TEXT NOT NULL,
      dose          TEXT,
      route         TEXT,
      frequency     TEXT,
      reason        TEXT,
      prescriber    TEXT,
      status        TEXT DEFAULT 'active',
      reconciled    INTEGER DEFAULT 0,
      reconcile_action TEXT,
      reconciled_by INTEGER,
      reconciled_at TEXT,
      recorded_by   INTEGER NOT NULL,
      recorded_at   TEXT NOT NULL
    )`); } catch(e) {}
    // ---- Patient Portal additions ----
    try { db.run('ALTER TABLE patients ADD COLUMN portal_password_hash TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN portal_salt TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN portal_enabled INTEGER DEFAULT 1'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN weight_kg REAL'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN egfr REAL'); } catch(e) {}
    try { db.run(`CREATE TABLE IF NOT EXISTS portal_messages (
      msg_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL,
      from_type     TEXT NOT NULL,
      from_id       INTEGER,
      subject       TEXT,
      body          TEXT NOT NULL,
      sent_at       TEXT NOT NULL,
      read_at       TEXT
    )`); } catch(e) {}
    // ---- Sepsis alerts log ----
    try { db.run(`CREATE TABLE IF NOT EXISTS sepsis_alerts (
      alert_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      vitals_id     INTEGER,
      qsofa_score   INTEGER,
      news2_score   INTEGER,
      temp          REAL,
      severity      TEXT,
      triggered_at  TEXT NOT NULL,
      acknowledged_by INTEGER,
      acknowledged_at TEXT,
      action_taken    TEXT
    )`); } catch(e) {}
    // ---- Nursing care plans (NANDA/NIC/NOC) ----
    try { db.run(`CREATE TABLE IF NOT EXISTS nursing_care_plans (
      plan_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      nanda_code    TEXT NOT NULL,
      nanda_label   TEXT,
      nic_code      TEXT,
      nic_label     TEXT,
      noc_code      TEXT,
      noc_label     TEXT,
      goal_text     TEXT,
      status        TEXT DEFAULT 'active',
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      resolved_at   TEXT
    )`); } catch(e) {}
    // ---- Readmission risk scoring ----
    try { db.run('ALTER TABLE admissions ADD COLUMN readmission_risk_score INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE admissions ADD COLUMN readmission_risk_level TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE admissions ADD COLUMN readmission_risk_factors TEXT'); } catch(e) {}
    // ---- Code Status & Vaccinations ----
    try { db.run("ALTER TABLE admissions ADD COLUMN code_status TEXT DEFAULT 'unknown'"); } catch(e) {}
    try { db.run("ALTER TABLE admissions ADD COLUMN code_status_set_by INTEGER"); } catch(e) {}
    try { db.run("ALTER TABLE admissions ADD COLUMN code_status_set_at TEXT"); } catch(e) {}
    try { db.run("ALTER TABLE admissions ADD COLUMN news2_scale INTEGER DEFAULT 1"); } catch(e) {}
    // Real nurse-selected ESI (1-5). In CREATE TABLE for fresh installs; this
    // guarded ALTER retrofits databases created before the column existed.
    try { db.run("ALTER TABLE admissions ADD COLUMN triage_level INTEGER"); } catch(e) {}
    // One-time PHI-leak repair: staff STEMI/stroke pages used to be stored in
    // portal_messages keyed by the STAFF user_id; a patient with a colliding
    // patient_id could read the incoming patient's clinical page in their own
    // portal inbox. Re-key existing page rows to the sentinel 0 (idempotent).
    try { db.run("UPDATE portal_messages SET patient_id = 0 WHERE from_type='system' AND subject LIKE '%[→ user:%'"); } catch(e) {}
    // ---- Communicable diseases & enhanced emergency contact ----
    try { db.run('ALTER TABLE patient_conditions ADD COLUMN category TEXT DEFAULT \'chronic\''); } catch(e) {}
    // ---- Coded, dated problem list (retrofit DBs created before these columns) ----
    try { db.run("ALTER TABLE patient_conditions ADD COLUMN code_system TEXT DEFAULT 'icd10'"); } catch(e) {}
    try { db.run('ALTER TABLE patient_conditions ADD COLUMN display TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patient_conditions ADD COLUMN onset_date TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patient_conditions ADD COLUMN resolved_date TEXT'); } catch(e) {}
    try { db.run("ALTER TABLE patient_conditions ADD COLUMN status TEXT DEFAULT 'active'"); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN emergency_contact_name TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN emergency_contact_phone TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN emergency_contact_relation TEXT'); } catch(e) {}
    // ---- Shift handoff acknowledgment (round 4) ----
    try { db.run('ALTER TABLE nurse_assignments ADD COLUMN transferred_from INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE nurse_assignments ADD COLUMN acknowledged_at TEXT'); } catch(e) {}
    // ---- Defense-in-depth schema constraints (round 2) ----
    // Partial unique indexes (catch direct-SQL bypasses of UI checks)
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_natid_unique ON patients(national_id) WHERE national_id IS NOT NULL AND national_id != ''"); } catch(e) {}
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_active_per_patient ON admissions(patient_id) WHERE status = 'active'"); } catch(e) {}
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_bed_dept_active ON admissions(bed_number, dept_id) WHERE status = 'active' AND bed_number IS NOT NULL"); } catch(e) {}
    // Lookup speed
    try { db.run('CREATE INDEX IF NOT EXISTS idx_patients_mrn_upper ON patients(UPPER(mrn))'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_pa_patient ON patient_allergies(patient_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_pc_patient_cat ON patient_conditions(patient_id, category)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_pc_patient_status ON patient_conditions(patient_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_pflags_patient ON patient_flags(patient_id, active)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_incident_status_sev ON incident_reports(status, severity)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_attach_patient ON patient_attachments(patient_id, uploaded_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status, to_dept)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_caregap_admission ON care_gap_overrides(admission_id, gap_key)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_lab_admission_status ON lab_orders(admission_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_rx_admission_status ON prescriptions(admission_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_audit_action_ts ON audit_log(action_type, timestamp DESC)'); } catch(e) {}
    // Hot-path indices for per-render worklist/chart queries (profiled against the
    // actual WHERE/ORDER-BY shapes in router.js):
    //  - vitals chart + "latest vitals" + NEWS2 trend: WHERE admission_id ORDER BY recorded_at
    //  - nurse task lists / "overdue": WHERE admission_id AND status
    //  - patient-portal unread badge + inbox: WHERE patient_id AND from_type
    //  - admissions worklists by department: WHERE status AND dept_id
    //  - MAR due/given lookups: WHERE admission_id (+ status)
    try { db.run('CREATE INDEX IF NOT EXISTS idx_vitals_adm_time ON vitals_log(admission_id, recorded_at DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_nursing_adm_status ON nursing_tasks(admission_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_portal_msg_patient ON portal_messages(patient_id, from_type)'); } catch(e) {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_admissions_dept_status ON admissions(dept_id, status)"); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_mar_admission ON med_admin_records(admission_id, status)'); } catch(e) {}
    // Hot-path indices, round 2 (verified against the WHERE/JOIN/ORDER-BY
    // shapes actually used in router.js):
    //  - consultations: last/first note per admission (rounds, chart, discharge)
    //  - case_assignments: doctor worklists (WHERE doctor_id) + joins ON admission_id
    //  - nurse_assignments: my-patients (WHERE nurse_id, shift_date) + joins ON admission_id
    //  - med_admin_records: "last administration" per prescription (MAR view + correlated subqueries)
    //  - appointments: date-range lists, per-doctor schedule, per-patient lookups
    //  - sw_contacts / fluid_balance / lab_critical_acks: per-row joins batched in render views
    try { db.run('CREATE INDEX IF NOT EXISTS idx_consult_adm_time ON consultations(admission_id, created_at DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_case_assign_doctor ON case_assignments(doctor_id, admission_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_case_assign_adm ON case_assignments(admission_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_nurse_assign_nurse_date ON nurse_assignments(nurse_id, shift_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_nurse_assign_adm ON nurse_assignments(admission_id, shift_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_mar_rx_time ON med_admin_records(prescription_id, administered_at DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appt_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, appt_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_natid ON appointments(national_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_sw_contacts_case ON sw_contacts(case_id, contact_date DESC)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_fluid_adm ON fluid_balance(admission_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_lca_order ON lab_critical_acks(order_id)'); } catch(e) {}
    // Round 3 (EXPLAIN QUERY PLAN sweep over all 286 SQL literals): the only
    // full scans left on GROWTH tables that a one-line index fixes. Verified
    // each flips SCAN -> SEARCH against the seeded schema.
    try { db.run('CREATE INDEX IF NOT EXISTS idx_patients_natid ON patients(national_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions(status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_adm_admitted ON admissions(admitted_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_adm_discharged ON admissions(discharged_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_mar_status_time ON med_admin_records(status, administered_at)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_patients_dupcheck ON patients(full_name_ar, phone)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_lab_critical_time ON lab_orders(is_critical, resulted_at)'); } catch(e) {}

    // Triggers (CHECK constraints can't be added via ALTER in SQLite; use triggers)
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_vitals_plausible BEFORE INSERT ON vitals_log FOR EACH ROW
      WHEN (NEW.bp_systolic IS NOT NULL AND (NEW.bp_systolic < 30 OR NEW.bp_systolic > 300))
        OR (NEW.bp_diastolic IS NOT NULL AND (NEW.bp_diastolic < 15 OR NEW.bp_diastolic > 250))
        OR (NEW.heart_rate IS NOT NULL AND (NEW.heart_rate < 20 OR NEW.heart_rate > 300))
        OR (NEW.temperature IS NOT NULL AND (NEW.temperature < 25 OR NEW.temperature > 45))
        OR (NEW.o2_sat IS NOT NULL AND (NEW.o2_sat < 0 OR NEW.o2_sat > 100))
      BEGIN
        SELECT RAISE(ABORT, 'Vital sign out of plausible range');
      END`); } catch(e) {}
    // NOTE: use datetime() to normalize both sides (ISO 8601 with T → SQLite space format)
    // Without this, string comparison of '2026-05-23T08:00:00Z' vs '2026-05-23 09:00:00' fails because 'T'(84) > ' '(32)
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_vitals_future BEFORE INSERT ON vitals_log FOR EACH ROW
      WHEN datetime(NEW.recorded_at) > datetime('now', '+1 hour')
      BEGIN
        SELECT RAISE(ABORT, 'Vital sign recorded_at cannot be in the future');
      END`); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_fluid_positive BEFORE INSERT ON fluid_balance FOR EACH ROW
      WHEN NEW.amount_ml <= 0
      BEGIN
        SELECT RAISE(ABORT, 'fluid_balance.amount_ml must be > 0 (use type=intake/output for direction)');
      END`); } catch(e) {}
    // Same datetime() normalization as vitals
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_lab_time_order BEFORE INSERT ON lab_orders FOR EACH ROW
      WHEN NEW.resulted_at IS NOT NULL AND datetime(NEW.resulted_at) < datetime(NEW.ordered_at)
      BEGIN
        SELECT RAISE(ABORT, 'lab_orders.resulted_at cannot precede ordered_at');
      END`); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_lab_time_order_upd BEFORE UPDATE ON lab_orders FOR EACH ROW
      WHEN NEW.resulted_at IS NOT NULL AND datetime(NEW.resulted_at) < datetime(NEW.ordered_at)
      BEGIN
        SELECT RAISE(ABORT, 'lab_orders.resulted_at cannot precede ordered_at');
      END`); } catch(e) {}
    // D2 fix: block new orders on discharged admissions (schema defense).
    // COALESCE closes the NULL-skip: a NONEXISTENT admission_id made the status
    // subquery NULL, and NULL = 'discharged' is NULL (not true), so a dangling
    // order slipped through wherever FKs are off (browser mode). A missing
    // admission now reads as '' which is <> 'active' → ABORT. DROP first so
    // existing databases get the replacement (CREATE IF NOT EXISTS never would).
    try { db.run('DROP TRIGGER IF EXISTS trg_rx_block_discharged'); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_rx_block_discharged BEFORE INSERT ON prescriptions FOR EACH ROW
      WHEN COALESCE((SELECT status FROM admissions WHERE admission_id = NEW.admission_id), '') <> 'active'
      BEGIN
        SELECT RAISE(ABORT, 'Cannot create prescription on a discharged or nonexistent admission');
      END`); } catch(e) {}
    try { db.run('DROP TRIGGER IF EXISTS trg_lab_block_discharged'); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_lab_block_discharged BEFORE INSERT ON lab_orders FOR EACH ROW
      WHEN COALESCE((SELECT status FROM admissions WHERE admission_id = NEW.admission_id), '') <> 'active'
      BEGIN
        SELECT RAISE(ABORT, 'Cannot order lab on a discharged or nonexistent admission');
      END`); } catch(e) {}
    // G5 fix: enforce doctor role on prescriptions at DB level
    // COALESCE closes the NULL hole: a NONEXISTENT doctor_id made the subquery
    // return NULL, and NULL NOT IN (...) is NULL (not true), so the trigger
    // silently allowed the insert. Missing user now reads as role '' → ABORT.
    // DROP first: CREATE IF NOT EXISTS never replaces the pre-fix trigger on
    // existing databases (idempotent — runs every boot).
    try { db.run('DROP TRIGGER IF EXISTS trg_rx_doctor_role'); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_rx_doctor_role BEFORE INSERT ON prescriptions FOR EACH ROW
      WHEN COALESCE((SELECT role FROM users WHERE user_id = NEW.doctor_id), '') NOT IN ('doctor','consultant','emergency_doctor','resident')
      BEGIN
        SELECT RAISE(ABORT, 'doctor_id must reference a user with a doctor role');
      END`); } catch(e) {}
    // RBAC at the data layer (role-alignment pass): the browser gates views by
    // role and the server gates /api by its CAN matrix, but the shared SQL
    // bridge is coarse-trust by design — these triggers make the highest-
    // stakes actor columns refuse a wrong-role user id in BOTH modes
    // (server/server.js reuses this exact schema builder). Same COALESCE
    // pattern as trg_rx_doctor_role: a NONEXISTENT user id reads as role ''
    // and aborts instead of NULL-skipping.
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_lab_doctor_role BEFORE INSERT ON lab_orders FOR EACH ROW
      WHEN COALESCE((SELECT role FROM users WHERE user_id = NEW.doctor_id), '') NOT IN ('doctor','consultant','emergency_doctor','resident')
      BEGIN
        SELECT RAISE(ABORT, 'lab_orders.doctor_id must reference a user with a doctor role');
      END`); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_rx_verify_pharmacist BEFORE UPDATE OF verified_by ON prescriptions FOR EACH ROW
      WHEN NEW.verified_by IS NOT NULL AND COALESCE((SELECT role FROM users WHERE user_id = NEW.verified_by), '') <> 'pharmacist'
      BEGIN
        SELECT RAISE(ABORT, 'prescriptions.verified_by must reference a pharmacist');
      END`); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_rx_verify_pharmacist_ins BEFORE INSERT ON prescriptions FOR EACH ROW
      WHEN NEW.verified_by IS NOT NULL AND COALESCE((SELECT role FROM users WHERE user_id = NEW.verified_by), '') <> 'pharmacist'
      BEGIN
        SELECT RAISE(ABORT, 'prescriptions.verified_by must reference a pharmacist');
      END`); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_dispense_pharmacist BEFORE INSERT ON dispensing_log FOR EACH ROW
      WHEN COALESCE((SELECT role FROM users WHERE user_id = NEW.dispensed_by), '') <> 'pharmacist'
      BEGIN
        SELECT RAISE(ABORT, 'dispensing_log.dispensed_by must reference a pharmacist');
      END`); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_mar_clinical_role BEFORE INSERT ON med_admin_records FOR EACH ROW
      WHEN NEW.administered_by IS NOT NULL AND COALESCE((SELECT role FROM users WHERE user_id = NEW.administered_by), '') NOT IN ('nurse','senior_nurse','triage_nurse','doctor','consultant','emergency_doctor')
      BEGIN
        SELECT RAISE(ABORT, 'med_admin_records.administered_by must reference clinical staff');
      END`); } catch(e) {}
    // D4 fix: limit lab result_value text length (prevent garbage / overflow)
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_lab_result_len BEFORE UPDATE ON lab_orders FOR EACH ROW
      WHEN NEW.result_value IS NOT NULL AND length(NEW.result_value) > 5000
      BEGIN
        SELECT RAISE(ABORT, 'lab_orders.result_value exceeds 5000 chars — likely data error');
      END`); } catch(e) {}

    // High-alert med flag + second signature (K1 fix)
    try { db.run('ALTER TABLE drugs ADD COLUMN is_high_alert INTEGER DEFAULT 0'); } catch(e) {}
    try { db.run('ALTER TABLE med_admin_records ADD COLUMN witnessed_by INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE med_admin_records ADD COLUMN witnessed_at TEXT'); } catch(e) {}
    // Seed high-alert flags for common ones (insulin, opioids, heparin, warfarin, KCl)
    try {
      db.run(`UPDATE drugs SET is_high_alert = 1 WHERE LOWER(name_generic) LIKE '%insulin%' OR LOWER(name_generic) LIKE '%morphine%'
        OR LOWER(name_generic) LIKE '%fentanyl%' OR LOWER(name_generic) LIKE '%oxycodone%' OR LOWER(name_generic) LIKE '%hydromorphone%'
        OR LOWER(name_generic) LIKE '%heparin%' OR LOWER(name_generic) LIKE '%warfarin%' OR LOWER(name_generic) LIKE '%enoxaparin%'
        OR LOWER(name_generic) LIKE '%potassium chloride%' OR LOWER(name_generic) LIKE '%kcl%'
        OR LOWER(name_generic) LIKE '%digoxin%' OR LOWER(name_generic) LIKE '%methotrexate%'`);
    } catch(e) {}

    // ---- Code Blue intervention timeline (P0 fix from persona simulation) ----
    try { db.run('ALTER TABLE code_blue_events ADD COLUMN cpr_started_at TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE code_blue_events ADD COLUMN first_epinephrine_at TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE code_blue_events ADD COLUMN defibrillation_at TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE code_blue_events ADD COLUMN intubation_at TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE code_blue_events ADD COLUMN rosc_at TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE code_blue_events ADD COLUMN team_members TEXT'); } catch(e) {}
    // ---- Lab specimen rejection (P0 fix from persona simulation) ----
    try { db.run('ALTER TABLE lab_orders ADD COLUMN rejected_at TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE lab_orders ADD COLUMN rejected_by INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE lab_orders ADD COLUMN rejection_reason TEXT'); } catch(e) {}
    // ---- Pre-arrival board (triage nurse) ----
    try { db.run(`CREATE TABLE IF NOT EXISTS incoming_arrivals (
      arrival_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      mode          TEXT NOT NULL,
      patient_label TEXT,
      age_guess     INTEGER,
      gender_guess  TEXT,
      chief_complaint TEXT,
      severity      TEXT,
      eta_minutes   INTEGER,
      paramedic_notes TEXT,
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      converted_patient_id INTEGER,
      status        TEXT DEFAULT 'pending'
    )`); } catch(e) {}
    // ---- Nosocomial (hospital-acquired) infections ----
    try { db.run(`CREATE TABLE IF NOT EXISTS nosocomial_infections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      patient_id    INTEGER NOT NULL,
      infection_type TEXT NOT NULL,
      pathogen      TEXT,
      identified_at TEXT NOT NULL,
      identified_by INTEGER,
      is_isolated   INTEGER DEFAULT 0,
      treatment     TEXT,
      notes         TEXT
    )`); } catch(e) {}
    try { db.run(`CREATE TABLE IF NOT EXISTS vaccinations (
      vac_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL,
      vaccine_name  TEXT NOT NULL,
      dose_number   INTEGER,
      administered_at TEXT NOT NULL,
      site          TEXT,
      lot_number    TEXT,
      expiry_date   TEXT,
      administered_by INTEGER,
      next_due_date TEXT,
      notes         TEXT
    )`); } catch(e) {}

    // Brute-force protection (see auth.js): stored in the DB instead of
    // localStorage, so a localStorage.clear() no longer resets the counter
    // and the lockout survives a page refresh.
    try { db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      account    TEXT NOT NULL,
      attempt_ms INTEGER NOT NULL
    )`); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_login_attempts_acct ON login_attempts(account, attempt_ms)'); } catch(e) {}

    // ---- Patient-portal self-booked appointments ----
    try { db.run('ALTER TABLE appointments ADD COLUMN mrn TEXT'); } catch(e) {}
    // Patient-originated rows have no staff user: created_by stays NOT NULL
    // with sentinel 0, and the real requester is recorded here.
    try { db.run('ALTER TABLE appointments ADD COLUMN requested_by_patient_id INTEGER'); } catch(e) {}
    // Must come AFTER the ALTER above — an index on a not-yet-added column
    // fails silently in the try/catch and never gets created on fresh DBs.
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_req_patient ON appointments(requested_by_patient_id, created_at)'); } catch(e) {}
}

// ============================================================
// Table Creation
// ============================================================

function createAllTables() {
  // ---- Auth tables ----
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      dept_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar    TEXT NOT NULL,
      name_en    TEXT NOT NULL,
      type       TEXT NOT NULL
    );
  `);

  // Brute-force login throttling (see auth.js). Kept in the DB rather than
  // localStorage so the counter is not reset by a localStorage.clear().
  db.run(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      account    TEXT NOT NULL,
      attempt_ms INTEGER NOT NULL
    );
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_login_attempts_acct ON login_attempts(account, attempt_ms)');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      full_name_ar  TEXT NOT NULL,
      full_name_en  TEXT NOT NULL,
      role          TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(dept_id),
      specialization TEXT,
      is_active     INTEGER DEFAULT 1,
      created_by    INTEGER,
      created_at    TEXT NOT NULL,
      last_login    TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id  TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      role        TEXT NOT NULL,
      dept_id     INTEGER,
      login_time  TEXT NOT NULL,
      last_active TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
  `);

  // ---- Patient tables ----
  db.run(`
    CREATE TABLE IF NOT EXISTS patients (
      patient_id               INTEGER PRIMARY KEY AUTOINCREMENT,
      mrn                      TEXT NOT NULL UNIQUE,
      national_id              TEXT,
      full_name_ar             TEXT NOT NULL,
      full_name_en             TEXT,
      date_of_birth            TEXT,
      gender                   TEXT,
      blood_type               TEXT,
      phone                    TEXT,
      emergency_contact        TEXT,
      emergency_contact_name   TEXT,
      emergency_contact_phone  TEXT,
      emergency_contact_relation TEXT,
      registered_by            INTEGER,
      registered_at            TEXT NOT NULL,
      qr_code_data             TEXT,
      portal_password_hash     TEXT,
      portal_salt              TEXT,
      portal_enabled           INTEGER DEFAULT 1,
      weight_kg                REAL,
      egfr                     REAL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS patient_conditions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id     INTEGER NOT NULL REFERENCES patients(patient_id),
      condition_code TEXT NOT NULL,
      category       TEXT DEFAULT 'chronic',
      severity       TEXT,
      notes          TEXT,
      added_by       INTEGER,
      added_at       TEXT,
      -- Coded, dated problem-list fields. condition_code carries the ICD-10 code
      -- for new entries (display is the human label); legacy rows keep their free
      -- token in condition_code with code_system left at the default and are still
      -- rendered. status drives the active/resolved lifecycle.
      code_system    TEXT DEFAULT 'icd10',
      display        TEXT,
      onset_date     TEXT,
      resolved_date  TEXT,
      status         TEXT DEFAULT 'active'
    );
  `);

  // Patient flags — short, high-visibility chips a clinician pins to a patient
  // (e.g. "Fall risk", "Interpreter needed"). Surfaced on the safety banner.
  db.run(`
    CREATE TABLE IF NOT EXISTS patient_flags (
      flag_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id  INTEGER NOT NULL REFERENCES patients(patient_id),
      label_en    TEXT NOT NULL,
      label_ar    TEXT,
      color       TEXT DEFAULT 'info',
      created_by  INTEGER,
      created_at  TEXT,
      active      INTEGER DEFAULT 1
    );
  `);

  // Patient-safety incident reports (falls, med errors, near-misses, …). A
  // clinician-facing safety-event channel, distinct from the forensic audit_log:
  // anyone on staff may file (optionally anonymously — reported_by NULL); a
  // manager reviews and closes. patient_id/admission_id are nullable (not every
  // incident involves a specific patient).
  db.run(`
    CREATE TABLE IF NOT EXISTS incident_reports (
      incident_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      type             TEXT NOT NULL,
      severity         TEXT NOT NULL,
      occurred_at      TEXT,
      location         TEXT,
      patient_id       INTEGER,
      admission_id     INTEGER,
      description      TEXT NOT NULL,
      immediate_action TEXT,
      reported_by      INTEGER,
      reported_at      TEXT NOT NULL,
      status           TEXT DEFAULT 'open',
      reviewed_by      INTEGER,
      review_notes     TEXT,
      closed_at        TEXT
    );
  `);

  // Chart attachments — scanned consent forms, referral letters, wound photos,
  // an X-ray snapshot. LAN-only: the bytes live in the one server DB (base64),
  // no cloud, no DICOM server. Size-capped client-side (the bridge body limit
  // keeps a single upload small) — this is the lightweight stand-in for a PACS
  // viewer / document-management system, not a replacement for one.
  db.run(`
    CREATE TABLE IF NOT EXISTS patient_attachments (
      attach_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id   INTEGER NOT NULL REFERENCES patients(patient_id),
      admission_id INTEGER,
      filename     TEXT,
      mime         TEXT,
      kind         TEXT DEFAULT 'other',
      size_bytes   INTEGER,
      data         TEXT,
      note         TEXT,
      uploaded_by  INTEGER,
      uploaded_at  TEXT
    );
  `);

  // Internal referral / consult request — the LAN-internal adaptation of OSCAR's
  // secure messaging: a clinician asks another specialty/department to see the
  // patient; the receiving side accepts/responds/closes. Not a free-form chat.
  db.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      referral_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL REFERENCES patients(patient_id),
      admission_id  INTEGER,
      from_user     INTEGER,
      to_dept       INTEGER,
      to_specialty  TEXT,
      reason        TEXT NOT NULL,
      urgency       TEXT DEFAULT 'routine',
      status        TEXT DEFAULT 'open',
      created_at    TEXT,
      responded_by  INTEGER,
      response_note TEXT,
      responded_at  TEXT
    );
  `);

  // Care-gap dismissals — a clinician may dismiss a preventive-care nudge WITH A
  // REASON (the app-wide decline-with-reason pattern); the gap then stops showing
  // for that admission. Audited via logAction at the call site.
  db.run(`
    CREATE TABLE IF NOT EXISTS care_gap_overrides (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      gap_key       TEXT NOT NULL,
      reason        TEXT,
      dismissed_by  INTEGER,
      dismissed_at  TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS incoming_arrivals (
      arrival_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      mode          TEXT NOT NULL,
      patient_label TEXT,
      age_guess     INTEGER,
      gender_guess  TEXT,
      chief_complaint TEXT,
      severity      TEXT,
      eta_minutes   INTEGER,
      paramedic_notes TEXT,
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      converted_patient_id INTEGER,
      status        TEXT DEFAULT 'pending'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nosocomial_infections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      patient_id    INTEGER NOT NULL,
      infection_type TEXT NOT NULL,
      pathogen      TEXT,
      identified_at TEXT NOT NULL,
      identified_by INTEGER,
      is_isolated   INTEGER DEFAULT 0,
      treatment     TEXT,
      notes         TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS patient_allergies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id  INTEGER NOT NULL REFERENCES patients(patient_id),
      allergen    TEXT NOT NULL,
      reaction    TEXT,
      severity    TEXT,
      added_by    INTEGER,
      added_at    TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admissions (
      admission_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id      INTEGER NOT NULL REFERENCES patients(patient_id),
      dept_id         INTEGER NOT NULL REFERENCES departments(dept_id),
      bed_number      TEXT,
      admitted_by     INTEGER,
      admitted_at     TEXT NOT NULL,
      discharged_at   TEXT,
      status          TEXT DEFAULT 'active',
      complexity_score INTEGER DEFAULT 1,
      diet_code       TEXT DEFAULT 'REG',
      diet_notes      TEXT,
      chief_complaint TEXT,
      initial_diagnosis TEXT,
      disposition_plan TEXT,
      on_ventilator   INTEGER DEFAULT 0,
      post_surgery    INTEGER DEFAULT 0,
      triage_level    INTEGER,
      mode_of_arrival TEXT,
      pain_scale      INTEGER,
      gcs_score       INTEGER DEFAULT 15,
      news2_scale     INTEGER DEFAULT 1,
      readmission_risk_score INTEGER,
      readmission_risk_level TEXT,
      readmission_risk_factors TEXT,
      code_status         TEXT DEFAULT 'unknown',
      code_status_set_by  INTEGER,
      code_status_set_at  TEXT
    );
  `);

  // ---- Blackbox ----
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      log_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp     TEXT NOT NULL,
      user_id       INTEGER NOT NULL,
      user_name_en  TEXT NOT NULL,
      user_name_ar  TEXT NOT NULL,
      user_role     TEXT NOT NULL,
      dept_id       INTEGER,
      dept_name_en  TEXT,
      dept_name_ar  TEXT,
      patient_id    INTEGER,
      patient_name  TEXT,
      patient_mrn   TEXT,
      action_type   TEXT NOT NULL,
      action_detail TEXT NOT NULL,
      action_detail_ar TEXT,
      ip_address    TEXT,
      prev_hash     TEXT,
      row_hash      TEXT NOT NULL
    );
  `);

  // ---- Pharmacy ----
  db.run(`
    CREATE TABLE IF NOT EXISTS drugs (
      drug_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name_generic  TEXT NOT NULL,
      name_brand    TEXT,
      name_ar       TEXT,
      category      TEXT,
      unit          TEXT NOT NULL,
      stock_qty     REAL DEFAULT 0,
      min_threshold REAL DEFAULT 10,
      location      TEXT,
      qr_code_data  TEXT,
      is_controlled INTEGER DEFAULT 0,
      added_by      INTEGER,
      added_at      TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS drug_interactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_a_id   INTEGER NOT NULL,
      drug_b_id   INTEGER NOT NULL,
      severity    TEXT NOT NULL,
      description TEXT NOT NULL,
      description_ar TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dispensing_log (
      dispense_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER REFERENCES prescriptions(rx_id),
      drug_id       INTEGER NOT NULL REFERENCES drugs(drug_id),
      patient_id    INTEGER NOT NULL REFERENCES patients(patient_id),
      qty_dispensed REAL NOT NULL,
      dispensed_by  INTEGER NOT NULL,
      dispensed_at  TEXT NOT NULL,
      collected_by  INTEGER,
      collected_at  TEXT,
      notes         TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_transactions (
      txn_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_id     INTEGER NOT NULL,
      txn_type    TEXT NOT NULL,
      qty_change  REAL NOT NULL,
      qty_after   REAL NOT NULL,
      batch_no    TEXT,
      expiry_date TEXT,
      performed_by INTEGER NOT NULL,
      performed_at TEXT NOT NULL,
      notes       TEXT
    );
  `);

  // ---- Supply ----
  db.run(`
    CREATE TABLE IF NOT EXISTS supply_items (
      item_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en       TEXT NOT NULL,
      name_ar       TEXT NOT NULL,
      category      TEXT NOT NULL,
      unit          TEXT NOT NULL,
      qr_code_data  TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dept_supply_stock (
      stock_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id       INTEGER NOT NULL,
      dept_id       INTEGER NOT NULL,
      qty           REAL DEFAULT 0,
      min_threshold REAL DEFAULT 5,
      last_updated  TEXT,
      UNIQUE(item_id, dept_id)
    );
  `);

  // (supply_transactions was created here for years but no code path ever
  // read or wrote it — removed; existing DBs keep the empty table harmlessly.)

  // ---- Nursing ----
  db.run(`
    CREATE TABLE IF NOT EXISTS nurse_assignments (
      assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      nurse_id      INTEGER NOT NULL,
      shift         TEXT NOT NULL,
      shift_date    TEXT NOT NULL,
      assigned_by   INTEGER NOT NULL,
      assigned_at   TEXT NOT NULL,
      is_primary    INTEGER DEFAULT 1
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nursing_tasks (
      task_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id INTEGER NOT NULL,
      nurse_id    INTEGER NOT NULL,
      task_type   TEXT NOT NULL,
      task_detail TEXT,
      status      TEXT DEFAULT 'pending',
      due_time    TEXT,
      done_at     TEXT,
      notes       TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vitals_log (
      vitals_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id INTEGER NOT NULL REFERENCES admissions(admission_id),
      recorded_by INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,
      bp_systolic INTEGER,
      bp_diastolic INTEGER,
      heart_rate  INTEGER,
      temperature REAL,
      o2_sat      INTEGER,
      weight_kg   REAL,
      height_cm   REAL,
      rbs         REAL,
      notes       TEXT
    );
  `);

  // ---- Clinical ----
  db.run(`
    CREATE TABLE IF NOT EXISTS consultations (
      consult_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      doctor_id     INTEGER NOT NULL,
      consult_type  TEXT NOT NULL,
      subjective    TEXT,
      objective     TEXT,
      assessment    TEXT,
      plan          TEXT,
      icd10_codes   TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      rx_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL REFERENCES admissions(admission_id),
      doctor_id     INTEGER NOT NULL,
      drug_id       INTEGER NOT NULL REFERENCES drugs(drug_id),
      drug_name     TEXT NOT NULL,
      dose          TEXT NOT NULL,
      route         TEXT NOT NULL,
      frequency     TEXT NOT NULL,
      duration      TEXT,
      start_date    TEXT NOT NULL,
      end_date      TEXT,
      status        TEXT DEFAULT 'active',
      prescribed_at TEXT NOT NULL,
      qr_code_data  TEXT,
      notes         TEXT,
      verified_by   INTEGER,
      verified_at   TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS lab_orders (
      order_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id INTEGER NOT NULL REFERENCES admissions(admission_id),
      doctor_id   INTEGER NOT NULL,
      test_name   TEXT NOT NULL,
      test_code   TEXT,
      category    TEXT,
      subcategory TEXT,
      specimen_type TEXT,
      priority    TEXT DEFAULT 'routine',
      status      TEXT DEFAULT 'ordered',
      ordered_at  TEXT NOT NULL,
      prep_notes  TEXT,
      collected_by INTEGER,
      collected_at TEXT,
      received_by INTEGER,
      received_at TEXT,
      resulted_at TEXT,
      resulted_by INTEGER,
      result_value TEXT,
      result_unit  TEXT,
      result_flag  TEXT,
      result_notes TEXT,
      is_critical  INTEGER DEFAULT 0,
      notes       TEXT
    );
  `);

  // ---- Lab Result Details (for tests with multiple components like CBC) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS lab_result_details (
      detail_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id      INTEGER NOT NULL,
      component_en  TEXT NOT NULL,
      component_ar  TEXT,
      value         TEXT,
      unit          TEXT,
      ref_range     TEXT,
      flag          TEXT DEFAULT 'normal'
    );
  `);

  // ---- Nursing Procedures Log ----
  db.run(`
    CREATE TABLE IF NOT EXISTS nursing_procedure_log (
      log_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      procedure_code TEXT NOT NULL,
      admission_id  INTEGER NOT NULL,
      nurse_id      INTEGER NOT NULL,
      started_at    TEXT NOT NULL,
      completed_at  TEXT,
      steps_completed TEXT,
      notes         TEXT,
      status        TEXT DEFAULT 'in_progress'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_assignments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      doctor_id     INTEGER NOT NULL,
      assigned_by   INTEGER NOT NULL,
      assigned_at   TEXT NOT NULL,
      notes         TEXT
    );
  `);

  // ---- Outpatient Visits (Reception registration) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS outpatient_visits (
      visit_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name_ar TEXT NOT NULL,
      patient_name_en TEXT NOT NULL,
      national_id     TEXT,
      phone           TEXT,
      dob             TEXT,
      gender          TEXT DEFAULT 'male',
      dept_id         INTEGER,
      doctor_id       INTEGER,
      registered_by   INTEGER NOT NULL,
      registered_at   TEXT NOT NULL,
      appointment_time TEXT,
      chief_complaint TEXT,
      visit_type      TEXT DEFAULT 'walk_in',
      payment_type    TEXT DEFAULT 'insurance',
      insurance_company TEXT,
      status          TEXT DEFAULT 'waiting',
      notes           TEXT
    );
  `);

  // ---- Appointments ----
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      appt_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name_ar TEXT NOT NULL,
      patient_name_en TEXT NOT NULL,
      national_id   TEXT,
      phone         TEXT,
      dept_id       INTEGER NOT NULL,
      doctor_id     INTEGER,
      appt_date     TEXT NOT NULL,
      appt_time     TEXT NOT NULL,
      reason        TEXT,
      visit_type    TEXT DEFAULT 'outpatient',
      status        TEXT DEFAULT 'scheduled',
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      notes         TEXT
    );
  `);

  // ---- Billing / Invoices ----
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      invoice_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id      INTEGER,
      patient_name_ar TEXT NOT NULL,
      patient_name_en TEXT NOT NULL,
      national_id   TEXT,
      dept_id       INTEGER,
      visit_date    TEXT NOT NULL,
      subtotal      REAL DEFAULT 0,
      discount      REAL DEFAULT 0,
      total         REAL DEFAULT 0,
      payment_type  TEXT DEFAULT 'insurance',
      insurance_company TEXT,
      status        TEXT DEFAULT 'unpaid',
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      notes         TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      item_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id    INTEGER NOT NULL,
      description_en TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      qty           INTEGER DEFAULT 1,
      unit_price    REAL NOT NULL,
      total_price   REAL NOT NULL
    );
  `);

  // ---- Surgical / OR Management ----
  db.run(`
    CREATE TABLE IF NOT EXISTS surgical_cases (
      case_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id           INTEGER NOT NULL,
      admission_id         INTEGER NOT NULL,
      surgeon_id           INTEGER NOT NULL,
      procedure_name       TEXT NOT NULL,
      anesthesia_type      TEXT NOT NULL,
      or_room              TEXT NOT NULL,
      scheduled_date       TEXT NOT NULL,
      scheduled_time       TEXT NOT NULL,
      estimated_duration_min INTEGER DEFAULT 60,
      pre_op_diagnosis     TEXT,
      consent_signed       INTEGER DEFAULT 0,
      site_marked          INTEGER DEFAULT 0,
      npo_verified         INTEGER DEFAULT 0,
      blood_type_confirmed INTEGER DEFAULT 0,
      allergies_reviewed   INTEGER DEFAULT 0,
      surgical_team_notes  TEXT,
      equipment_notes      TEXT,
      status               TEXT DEFAULT 'scheduled',
      post_op_notes        TEXT,
      complications        TEXT,
      created_by           INTEGER NOT NULL,
      created_at           TEXT NOT NULL
    );
  `);

  // ---- Dietary / Nutrition ----
  db.run(`
    CREATE TABLE IF NOT EXISTS diet_orders (
      order_id             INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id         INTEGER NOT NULL,
      diet_type            TEXT NOT NULL,
      food_allergies       TEXT,
      calorie_target       INTEGER,
      restrictions         TEXT,
      special_instructions TEXT,
      ordered_by           INTEGER NOT NULL,
      ordered_at           TEXT NOT NULL,
      status               TEXT DEFAULT 'active'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS meal_log (
      log_id               INTEGER PRIMARY KEY AUTOINCREMENT,
      diet_order_id        INTEGER NOT NULL,
      admission_id         INTEGER NOT NULL,
      meal_type            TEXT NOT NULL,
      items_served         TEXT,
      intake_pct           INTEGER DEFAULT 0,
      notes                TEXT,
      recorded_by          INTEGER NOT NULL,
      recorded_at          TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nutrition_assessments (
      assessment_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id         INTEGER NOT NULL,
      weight_kg            REAL,
      height_cm            REAL,
      bmi                  REAL,
      nutritional_risk     TEXT DEFAULT 'low',
      assessment_notes     TEXT,
      assessed_by          INTEGER NOT NULL,
      assessed_at          TEXT NOT NULL
    );
  `);

  // ---- Social Work / Case Management ----
  db.run(`
    CREATE TABLE IF NOT EXISTS social_work_cases (
      case_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id         INTEGER NOT NULL,
      patient_id           INTEGER NOT NULL,
      social_worker_id     INTEGER NOT NULL,
      psychosocial_assessment TEXT,
      risk_level           TEXT DEFAULT 'low',
      living_situation     TEXT,
      support_system       TEXT,
      insurance_status     TEXT DEFAULT 'insured',
      discharge_needs      TEXT,
      referrals            TEXT,
      follow_up_needed     INTEGER DEFAULT 0,
      status               TEXT DEFAULT 'open',
      created_at           TEXT NOT NULL,
      updated_at           TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sw_contacts (
      contact_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id              INTEGER NOT NULL,
      contact_type         TEXT NOT NULL,
      contact_date         TEXT NOT NULL,
      notes                TEXT,
      recorded_by          INTEGER NOT NULL,
      recorded_at          TEXT NOT NULL
    );
  `);

  // ---- Extended vitals columns for NEWS2 ----
  db.run(`CREATE TABLE IF NOT EXISTS clinical_assessments (
    assess_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_id  INTEGER NOT NULL,
    assess_type   TEXT NOT NULL,
    score         INTEGER,
    risk_level    TEXT,
    details_json  TEXT,
    assessed_by   INTEGER NOT NULL,
    assessed_at   TEXT NOT NULL
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS fluid_balance (
    fb_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_id  INTEGER NOT NULL,
    type          TEXT NOT NULL,
    category      TEXT NOT NULL,
    amount_ml     REAL NOT NULL,
    recorded_by   INTEGER NOT NULL,
    recorded_at   TEXT NOT NULL,
    shift         TEXT,
    notes         TEXT
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS order_set_log (
    log_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_id  INTEGER NOT NULL,
    set_name      TEXT NOT NULL,
    applied_by    INTEGER NOT NULL,
    applied_at    TEXT NOT NULL
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS code_blue_events (
    event_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id    INTEGER,
    admission_id  INTEGER,
    location      TEXT,
    event_type    TEXT DEFAULT 'code_blue',
    initiated_by  INTEGER NOT NULL,
    initiated_at  TEXT NOT NULL,
    outcome       TEXT,
    duration_min  INTEGER,
    notes         TEXT,
    resolved_at   TEXT
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS home_medications (
    hm_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id    INTEGER NOT NULL,
    admission_id  INTEGER,
    drug_name     TEXT NOT NULL,
    dose          TEXT,
    route         TEXT,
    frequency     TEXT,
    reason        TEXT,
    prescriber    TEXT,
    status        TEXT DEFAULT 'active',
    reconciled    INTEGER DEFAULT 0,
    reconcile_action TEXT,
    reconciled_by INTEGER,
    reconciled_at TEXT,
    recorded_by   INTEGER NOT NULL,
    recorded_at   TEXT NOT NULL
  );`);

  // ---- Medication Administration Record (MAR) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS med_admin_records (
      mar_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER NOT NULL REFERENCES prescriptions(rx_id),
      admission_id    INTEGER NOT NULL REFERENCES admissions(admission_id),
      drug_name       TEXT NOT NULL,
      dose            TEXT NOT NULL,
      route           TEXT NOT NULL,
      scheduled_time  TEXT,
      administered_at TEXT,
      administered_by INTEGER,
      status          TEXT DEFAULT 'pending',
      hold_reason     TEXT,
      notes           TEXT
    );
  `);

  // ---- Critical Lab Acknowledgments ----
  db.run(`
    CREATE TABLE IF NOT EXISTS lab_critical_acks (
      ack_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id    INTEGER NOT NULL UNIQUE,
      doctor_id   INTEGER NOT NULL,
      acked_at    TEXT NOT NULL,
      comments    TEXT
    );
  `);

  // ---- Portal Messages (Patient ↔ Staff) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS portal_messages (
      msg_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL,
      from_type     TEXT NOT NULL,
      from_id       INTEGER,
      subject       TEXT,
      body          TEXT NOT NULL,
      sent_at       TEXT NOT NULL,
      read_at       TEXT
    );
  `);

  // ---- Sepsis Alerts ----
  db.run(`
    CREATE TABLE IF NOT EXISTS sepsis_alerts (
      alert_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      vitals_id     INTEGER,
      qsofa_score   INTEGER,
      news2_score   INTEGER,
      temp          REAL,
      severity      TEXT,
      triggered_at  TEXT NOT NULL,
      acknowledged_by INTEGER,
      acknowledged_at TEXT,
      action_taken    TEXT
    );
  `);

  // ---- Vaccinations ----
  db.run(`
    CREATE TABLE IF NOT EXISTS vaccinations (
      vac_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id      INTEGER NOT NULL,
      vaccine_name    TEXT NOT NULL,
      dose_number     INTEGER,
      administered_at TEXT NOT NULL,
      site            TEXT,
      lot_number      TEXT,
      expiry_date     TEXT,
      administered_by INTEGER,
      next_due_date   TEXT,
      notes           TEXT
    );
  `);

  // ---- Nursing Care Plans (NANDA/NIC/NOC) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS nursing_care_plans (
      plan_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id  INTEGER NOT NULL,
      nanda_code    TEXT NOT NULL,
      nanda_label   TEXT,
      nic_code      TEXT,
      nic_label     TEXT,
      noc_code      TEXT,
      noc_label     TEXT,
      goal_text     TEXT,
      status        TEXT DEFAULT 'active',
      created_by    INTEGER NOT NULL,
      created_at    TEXT NOT NULL,
      resolved_at   TEXT
    );
  `);

  console.log('[DB] All tables created');
}

// ============================================================
// Seed Data
// ============================================================

async function seedData(opts) {
  // demo=false (production install): reference data ONLY — departments, supplies,
  // formulary, interaction table. No default admin, no demo staff, no patients.
  const demo = !(opts && opts.demo === false);
  // ---- Dental specialties (the `departments` table is repurposed as the
  // clinic's specialty list; ids are stable so seeded users/appointments line up) ----
  const depts = [
    [1, 'طب الأسنان العام',          'General Dentistry',              'specialty'],
    [2, 'تقويم الأسنان',             'Orthodontics',                   'specialty'],
    [3, 'علاج الجذور (العصب)',        'Endodontics',                    'specialty'],
    [4, 'جراحة الفم والوجه والفكين',   'Oral & Maxillofacial Surgery',   'specialty'],
    [5, 'أمراض اللثة',               'Periodontics',                   'specialty'],
    [6, 'طب أسنان الأطفال',          'Pediatric Dentistry',            'specialty'],
    [7, 'التعويضات السنية (التركيبات)', 'Prosthodontics',                 'specialty'],
    [10, 'الاستقبال والإدارة',        'Reception & Administration',     'admin'],
    [11, 'تقنية المعلومات',          'IT',                             'admin'],
  ];
  for (const d of depts) {
    db.run('INSERT OR IGNORE INTO departments (dept_id, name_ar, name_en, type) VALUES (?, ?, ?, ?)', d);
  }

  // ---- Default Admin Account (DEMO installs only — production creates its
  // own admin via createFirstAdmin, so no well-known credential ever exists) ----
  const existingAdmin = dbGet('SELECT user_id FROM users WHERE username = ?', ['admin']);
  if (demo && !existingAdmin) {
    const salt = generateSalt();
    const hash = await hashPassword('HIS@2024', salt);
    db.run(`INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ['admin', hash, salt, 'مدير النظام', 'System Administrator', 'it_admin', 11, nowISO()]
    );
  }

  // ---- Supply Items ----
  const supplies = [
    // Syringes
    ['1mL Syringe (Insulin)', 'سرنجة 1 مل (إنسولين)', 'syringe', 'pieces'],
    ['3mL Syringe', 'سرنجة 3 مل', 'syringe', 'pieces'],
    ['5mL Syringe', 'سرنجة 5 مل', 'syringe', 'pieces'],
    ['10mL Syringe', 'سرنجة 10 مل', 'syringe', 'pieces'],
    ['20mL Syringe', 'سرنجة 20 مل', 'syringe', 'pieces'],
    // IV Access
    ['IV Cannula 18G', 'كانيولا وريدية 18G', 'iv_access', 'pieces'],
    ['IV Cannula 20G', 'كانيولا وريدية 20G', 'iv_access', 'pieces'],
    ['IV Cannula 22G', 'كانيولا وريدية 22G', 'iv_access', 'pieces'],
    ['IV Giving Set', 'طقم تنقيط وريدي', 'iv_access', 'pieces'],
    ['IV Extension Set', 'وصلة تمديد وريدية', 'iv_access', 'pieces'],
    // IV Fluids
    ['Normal Saline 0.9% 500mL', 'محلول ملحي 0.9% 500 مل', 'iv_fluid', 'bags'],
    ['Dextrose 5% 500mL', 'ديكستروز 5% 500 مل', 'iv_fluid', 'bags'],
    ["Ringer's Lactate 500mL", 'رينجر لاكتيت 500 مل', 'iv_fluid', 'bags'],
    ['Normal Saline 0.9% 100mL', 'محلول ملحي 0.9% 100 مل', 'iv_fluid', 'bags'],
    // Wound Care
    ['Sterile Gauze 10x10cm', 'شاش معقم 10×10 سم', 'wound_care', 'pieces'],
    ['Sterile Gauze 5x5cm', 'شاش معقم 5×5 سم', 'wound_care', 'pieces'],
    ['Adhesive Dressing', 'ضمادة لاصقة', 'wound_care', 'pieces'],
    ['Elastic Bandage', 'ضمادة مطاطية', 'wound_care', 'rolls'],
    // PPE
    ['Gloves S', 'قفازات S', 'ppe', 'boxes'],
    ['Gloves M', 'قفازات M', 'ppe', 'boxes'],
    ['Gloves L', 'قفازات L', 'ppe', 'boxes'],
    ['Surgical Mask', 'كمامة جراحية', 'ppe', 'pieces'],
    ['N95 Mask', 'كمامة N95', 'ppe', 'pieces'],
    ['Gown', 'ثوب طبي', 'ppe', 'pieces'],
    // Respiratory
    ['Oxygen Mask (Simple)', 'قناع أكسجين (بسيط)', 'respiratory', 'pieces'],
    ['Oxygen Mask (Non-Rebreather)', 'قناع أكسجين (بدون إعادة تنفس)', 'respiratory', 'pieces'],
    ['Nasal Cannula', 'قنية أنفية', 'respiratory', 'pieces'],
    // Catheters
    ['Urinary Catheter 14Fr', 'قسطرة بولية 14Fr', 'other', 'pieces'],
    ['Urinary Catheter 16Fr', 'قسطرة بولية 16Fr', 'other', 'pieces'],
    ['Urinary Catheter 18Fr', 'قسطرة بولية 18Fr', 'other', 'pieces'],
    ['Urine Bag', 'كيس بول', 'other', 'pieces'],
    ['Nasogastric Tube 14Fr', 'أنبوب أنفي معدي 14Fr', 'other', 'pieces'],
    ['Nasogastric Tube 16Fr', 'أنبوب أنفي معدي 16Fr', 'other', 'pieces'],
    ['Suction Catheter', 'قسطرة شفط', 'other', 'pieces'],
    // Antiseptics
    ['Alcohol Swabs', 'مسحات كحولية', 'other', 'boxes'],
    ['Betadine', 'بيتادين', 'other', 'bottles'],
    ['Sterile Water for Injection', 'ماء معقم للحقن', 'other', 'pieces'],
  ];
  for (const s of supplies) {
    db.run('INSERT OR IGNORE INTO supply_items (name_en, name_ar, category, unit) VALUES (?, ?, ?, ?)', s);
  }

  // ---- Common Drugs ----
  const drugs = [
    // Analgesics
    ['Paracetamol 500mg', 'Panadol', 'باراسيتامول 500 ملغ', 'analgesic', 'tablet', 500, 50],
    ['Paracetamol IV 1g/100mL', null, 'باراسيتامول وريدي 1غ', 'analgesic', 'bag', 100, 20],
    ['Ibuprofen 400mg', 'Brufen', 'ابيوبروفين 400 ملغ', 'analgesic', 'tablet', 300, 30],
    ['Tramadol 50mg', null, 'ترامادول 50 ملغ', 'analgesic', 'capsule', 100, 20],
    ['Morphine 10mg/mL', null, 'مورفين 10 ملغ/مل', 'analgesic', 'ampoule', 50, 10],
    // Antibiotics
    ['Amoxicillin 500mg', null, 'أموكسيسيلين 500 ملغ', 'antibiotic', 'capsule', 500, 50],
    ['Amoxicillin/Clavulanate 1g', 'Augmentin', 'أوغمنتين 1 غ', 'antibiotic', 'tablet', 200, 30],
    ['Azithromycin 500mg', 'Zithromax', 'أزيثروميسين 500 ملغ', 'antibiotic', 'tablet', 150, 20],
    ['Ciprofloxacin 500mg', 'Ciprobay', 'سيبروفلوكساسين 500 ملغ', 'antibiotic', 'tablet', 200, 30],
    ['Ceftriaxone 1g', null, 'سيفترياكسون 1 غ', 'antibiotic', 'vial', 200, 30],
    ['Meropenem 1g', null, 'ميروبينم 1 غ', 'antibiotic', 'vial', 100, 20],
    ['Vancomycin 1g', null, 'فانكوميسين 1 غ', 'antibiotic', 'vial', 50, 10],
    ['Metronidazole 500mg', 'Flagyl', 'ميترونيدازول 500 ملغ', 'antibiotic', 'tablet', 300, 30],
    ['Metronidazole IV 500mg', 'Flagyl IV', 'ميترونيدازول وريدي 500 ملغ', 'antibiotic', 'bag', 100, 20],
    // Antihypertensives
    ['Amlodipine 5mg', 'Norvasc', 'أملوديبين 5 ملغ', 'antihypertensive', 'tablet', 300, 30],
    ['Amlodipine 10mg', 'Norvasc', 'أملوديبين 10 ملغ', 'antihypertensive', 'tablet', 200, 30],
    ['Losartan 50mg', 'Cozaar', 'لوسارتان 50 ملغ', 'antihypertensive', 'tablet', 300, 30],
    ['Enalapril 10mg', null, 'إنالابريل 10 ملغ', 'antihypertensive', 'tablet', 200, 30],
    ['Atenolol 50mg', 'Tenormin', 'أتينولول 50 ملغ', 'antihypertensive', 'tablet', 200, 30],
    ['Bisoprolol 5mg', 'Concor', 'بيسوبرولول 5 ملغ', 'antihypertensive', 'tablet', 200, 30],
    ['Furosemide 40mg', 'Lasix', 'فيوروسيمايد 40 ملغ', 'antihypertensive', 'tablet', 300, 30],
    ['Furosemide 20mg/2mL', 'Lasix', 'فيوروسيمايد 20 ملغ/2 مل', 'antihypertensive', 'ampoule', 200, 30],
    // Antidiabetics
    ['Metformin 500mg', 'Glucophage', 'ميتفورمين 500 ملغ', 'antidiabetic', 'tablet', 500, 50],
    ['Metformin 850mg', 'Glucophage', 'ميتفورمين 850 ملغ', 'antidiabetic', 'tablet', 300, 30],
    ['Glimepiride 2mg', 'Amaryl', 'غليمبيريد 2 ملغ', 'antidiabetic', 'tablet', 200, 30],
    ['Insulin Glargine 100IU/mL', 'Lantus', 'إنسولين غلارجين', 'antidiabetic', 'vial', 50, 10],
    ['Insulin Regular 100IU/mL', 'Actrapid', 'إنسولين عادي', 'antidiabetic', 'vial', 50, 10],
    // Cardiac
    ['Aspirin 81mg', null, 'أسبرين 81 ملغ', 'cardiac', 'tablet', 500, 50],
    ['Clopidogrel 75mg', 'Plavix', 'كلوبيدوغريل 75 ملغ', 'cardiac', 'tablet', 200, 30],
    ['Atorvastatin 20mg', 'Lipitor', 'أتورفاستاتين 20 ملغ', 'cardiac', 'tablet', 300, 30],
    ['Nitroglycerin 0.5mg', null, 'نيتروغليسرين 0.5 ملغ', 'cardiac', 'tablet', 100, 20],
    ['Warfarin 5mg', 'Coumadin', 'وارفارين 5 ملغ', 'cardiac', 'tablet', 100, 20],
    ['Enoxaparin 40mg', 'Clexane', 'إنوكسابارين 40 ملغ', 'cardiac', 'ampoule', 200, 30],
    ['Enoxaparin 60mg', 'Clexane', 'إنوكسابارين 60 ملغ', 'cardiac', 'ampoule', 150, 20],
    // Respiratory
    ['Salbutamol Inhaler', 'Ventolin', 'سالبيوتامول بخاخ', 'respiratory', 'inhaler', 100, 20],
    ['Ipratropium Inhaler', 'Atrovent', 'إيبراتروبيوم بخاخ', 'respiratory', 'inhaler', 50, 10],
    ['Salbutamol Nebulizer 5mg/mL', 'Ventolin', 'سالبيوتامول للتبخيرة', 'respiratory', 'vial', 200, 30],
    // GI
    ['Omeprazole 20mg', 'Losec', 'أوميبرازول 20 ملغ', 'gi', 'capsule', 300, 30],
    ['Pantoprazole 40mg', 'Controloc', 'بانتوبرازول 40 ملغ', 'gi', 'tablet', 200, 30],
    ['Pantoprazole IV 40mg', null, 'بانتوبرازول وريدي 40 ملغ', 'gi', 'vial', 100, 20],
    ['Metoclopramide 10mg', 'Primperan', 'ميتوكلوبراميد 10 ملغ', 'gi', 'tablet', 200, 30],
    ['Ondansetron 4mg', 'Zofran', 'أوندانسيترون 4 ملغ', 'gi', 'tablet', 150, 20],
    ['Ondansetron IV 4mg/2mL', 'Zofran', 'أوندانسيترون وريدي 4 ملغ', 'gi', 'ampoule', 100, 20],
    ['Lactulose 200mL', null, 'لاكتيولوز 200 مل', 'gi', 'bottle', 50, 10],
    // Psych / Neuro
    ['Diazepam 5mg', 'Valium', 'ديازيبام 5 ملغ', 'psych', 'tablet', 100, 20],
    ['Haloperidol 5mg', 'Haldol', 'هالوبيريدول 5 ملغ', 'psych', 'tablet', 50, 10],
    ['Phenytoin 100mg', 'Epanutin', 'فينيتوين 100 ملغ', 'psych', 'capsule', 200, 30],
    ['Levetiracetam 500mg', 'Keppra', 'ليفيتيراسيتام 500 ملغ', 'psych', 'tablet', 100, 20],
    // Other
    ['Hydrocortisone 100mg', 'Solu-Cortef', 'هيدروكورتيزون 100 ملغ', 'other', 'vial', 100, 20],
    ['Dexamethasone 8mg/2mL', null, 'ديكساميثازون 8 ملغ', 'other', 'ampoule', 100, 20],
    ['Normal Saline 0.9% 1000mL', null, 'محلول ملحي 1000 مل', 'other', 'bag', 500, 50],
    ['Dextrose 5% 1000mL', null, 'ديكستروز 5% 1000 مل', 'other', 'bag', 300, 30],
    ['Potassium Chloride 20mEq', null, 'بوتاسيوم كلوريد 20 ميلي مكافئ', 'other', 'ampoule', 200, 30],
  ];
  for (const d of drugs) {
    db.run(`INSERT OR IGNORE INTO drugs (name_generic, name_brand, name_ar, category, unit, stock_qty, min_threshold, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [...d, nowISO()]);
  }

  // ---- Common Drug Interactions ----
  // We'll add a few critical ones. In a real system this would be a larger table.
  const interactions = [
    // Warfarin + Aspirin = red
    ['Warfarin 5mg', 'Aspirin 81mg', 'red', 'Increased bleeding risk when combining anticoagulant with antiplatelet', 'خطر نزيف عالي عند الجمع بين مضاد التخثر ومضاد الصفيحات'],
    // Metformin + Contrast Dye (represented as note)
    ['Tramadol 50mg', 'Diazepam 5mg', 'red', 'CNS depression risk: opioid + benzodiazepine can cause respiratory depression', 'خطر تثبيط الجهاز العصبي: الجمع بين الأفيون والبنزوديازيبين قد يسبب توقف التنفس'],
    ['Enalapril 10mg', 'Potassium Chloride 20mEq', 'yellow', 'ACE inhibitor + potassium supplement increases hyperkalemia risk', 'مثبط ACE + مكمل البوتاسيوم يزيد خطر ارتفاع البوتاسيوم'],
    ['Warfarin 5mg', 'Metronidazole 500mg', 'yellow', 'Metronidazole increases warfarin effect — monitor INR closely', 'ميترونيدازول يزيد فعالية الوارفارين — يجب مراقبة INR'],
    ['Ciprofloxacin 500mg', 'Metformin 500mg', 'blue', 'Ciprofloxacin may affect blood glucose when used with metformin', 'سيبروفلوكساسين قد يؤثر على السكر عند استخدامه مع ميتفورمين'],
  ];
  for (const ix of interactions) {
    const rowA = db.exec(`SELECT drug_id FROM drugs WHERE name_generic = ?`, [ix[0]]);
    const rowB = db.exec(`SELECT drug_id FROM drugs WHERE name_generic = ?`, [ix[1]]);
    if (rowA.length && rowA[0].values.length && rowB.length && rowB[0].values.length) {
      db.run(`INSERT OR IGNORE INTO drug_interactions (drug_a_id, drug_b_id, severity, description, description_ar) VALUES (?, ?, ?, ?, ?)`,
        [rowA[0].values[0][0], rowB[0].values[0][0], ix[2], ix[3], ix[4]]);
    }
  }

  // ============================================================
  // SEED DATA — Realistic accounts, patients, clinical data
  // ============================================================

  if (demo) await seedDentalDemo();

  await saveDBToIndexedDB();
  console.log(`[DB] Seed data loaded (${demo ? 'demo' : 'production: reference data only'})`);
}

// Phase-1 minimal demo seed: just the 7 dental-clinic staff logins so every role
// boots and the role-picker works. The rich demo data (patients, odontograms,
// treatment plans, appointments, invoices, recalls) is layered on in Phase 3.
async function seedDentalDemo() {
  if (dbGet("SELECT user_id FROM users WHERE username = 'dr.omar'")) return;
  const now = nowISO();
  async function mkUser(username, password, nameAr, nameEn, role, deptId, spec) {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    db.run(`INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, specialization, is_active, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`, [username, hash, salt, nameAr, nameEn, role, deptId, spec || null, now]);
    return dbLastId();
  }
  // admin / HIS@2024 (it_admin) already created in seedData()
  await mkUser('manager',   'manager123', 'عبدالرحمن الفيصل', 'Abdulrahman Al-Faisal', 'clinic_manager', 10, null);
  await mkUser('dr.omar',   'doctor123',  'د. عمر الراشد',    'Dr. Omar Al-Rashed',    'dentist',        1,  'General Dentistry');
  await mkUser('dr.sara',   'doctor123',  'د. سارة الحمدان',  'Dr. Sara Al-Hamdan',    'specialist',     2,  'Orthodontics');
  await mkUser('hyg.mona',  'nurse123',   'منى الحربي',       'Mona Al-Harbi',         'hygienist',      1,  'Dental Hygiene');
  await mkUser('reception', 'recept123',  'سارة الجهني',      'Sara Al-Juhani',        'receptionist',   10, null);
  console.log('[DB] Dental demo staff seeded (Phase 1 stub)');
}

async function seedHospitalData() {
  // check if seed data already loaded
  const seedCheck = dbGet("SELECT user_id FROM users WHERE username = 'dr.omar'");
  if (seedCheck) return;

  console.log('[DB] Loading hospital seed data...');
  const now = nowISO();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);

  // ── Helper to create a user ──
  async function mkUser(username, password, nameAr, nameEn, role, deptId, spec) {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    db.run(`INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, specialization, is_active, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`, [username, hash, salt, nameAr, nameEn, role, deptId, spec || null, now]);
    return dbLastId();
  }

  // ════════════════════════════════════════════════
  // 1. USER ACCOUNTS  (all passwords shown below)
  // ════════════════════════════════════════════════
  // admin / HIS@2024        → IT Admin         (already exists)
  const managerId   = await mkUser('manager',       'manager123',  'عبدالرحمن الفيصل',     'Abdulrahman Al-Faisal',   'hospital_manager', 11, null);
  const consultId   = await mkUser('dr.ahmed',      'doctor123',   'د. أحمد المنصور',       'Dr. Ahmed Al-Mansour',    'consultant',        2, 'Internal Medicine');
  const consultSurgId = await mkUser('dr.khalid',   'doctor123',   'د. خالد العمري',        'Dr. Khalid Al-Omari',     'consultant',        3, 'General Surgery');
  const doctorId    = await mkUser('dr.sarah',      'doctor123',   'د. سارة الحمدان',       'Dr. Sarah Al-Hamdan',     'doctor',            2, 'Internal Medicine');
  const doctorId2   = await mkUser('dr.majed',      'doctor123',   'د. ماجد التميمي',       'Dr. Majed Al-Tamimi',     'doctor',            3, 'General Surgery');
  const erDocId     = await mkUser('dr.omar',       'doctor123',   'د. عمر الراشد',         'Dr. Omar Al-Rashed',      'emergency_doctor',  1, 'Emergency Medicine');
  const erDocId2    = await mkUser('dr.layla',      'doctor123',   'د. ليلى القاسم',        'Dr. Layla Al-Qasim',      'emergency_doctor',  1, 'Emergency Medicine');
  const tnurseId    = await mkUser('nurse.noura',   'nurse123',    'نورة المطيري',          'Noura Al-Mutairi',        'triage_nurse',      1, null);
  const snurseId    = await mkUser('nurse.fatima',  'nurse123',    'فاطمة الزهراني',        'Fatima Al-Zahrani',       'senior_nurse',      2, null);
  const snurseICUId = await mkUser('nurse.huda',    'nurse123',    'هدى البلوي',            'Huda Al-Balawi',          'senior_nurse',      4, null);
  const nurseId     = await mkUser('nurse.mona',    'nurse123',    'منى الحربي',            'Mona Al-Harbi',           'nurse',             2, null);
  const nurseId2    = await mkUser('nurse.reem',    'nurse123',    'ريم السبيعي',           'Reem Al-Subaie',          'nurse',             2, null);
  const nurseICUId  = await mkUser('nurse.amal',    'nurse123',    'أمل الشمري',            'Amal Al-Shammari',        'nurse',             4, null);
  const pharmId     = await mkUser('pharm.ali',     'pharm123',    'علي الغامدي',           'Ali Al-Ghamdi',           'pharmacist',        9, 'Clinical Pharmacy');
  const labTechId   = await mkUser('lab.nasser',    'lab123',      'ناصر الدوسري',          'Nasser Al-Dosari',        'lab_technician',   13, 'Clinical Laboratory');
  const labTechId2  = await mkUser('lab.sara',      'lab123',      'سارة العنزي',           'Sara Al-Anazi',           'lab_technician',   13, 'Microbiology');
  const radId       = await mkUser('rad.mohammed',  'rad123',      'د. محمد الحارثي',        'Dr. Mohammed Al-Harthi',  'radiologist',      14, 'Diagnostic Radiology');
  const receptionId  = await mkUser('reception.sara',  'recept123',  'سارة الجهني',      'Sara Al-Juhani',      'receptionist',          26, null);
  const dietitianId  = await mkUser('diet.amira',      'diet123',    'أميرة العتيبي',    'Amira Al-Otaibi',     'dietitian',             28, 'Clinical Nutrition');
  const socialWorkerId = await mkUser('sw.hessa',      'social123',  'حصة القحطاني',     'Hessa Al-Qahtani',    'social_worker',         29, 'Medical Social Work');

  // ════════════════════════════════════════════════
  // 2. PATIENTS — 8 realistic cases
  // ════════════════════════════════════════════════

  const patients = [
    // [nameAr, nameEn, nationalId, dob, gender, bloodType, phone, emergencyContact]
    ['أحمد بن سعيد القحطاني', 'Ahmed Al-Qahtani',  '1089567234', '1968-03-15', 'male',   'A+',  '0551234567', 'زوجته: نوف - 0559876543'],
    ['خالد محمد الشهري',      'Khaled Al-Shehri',  '1104892356', '1998-07-22', 'male',   'O+',  '0562345678', 'والده: محمد - 0558765432'],
    ['نورة سعد العتيبي',      'Noura Al-Otaibi',   '1078345612', '1981-11-03', 'female', 'B+',  '0573456789', 'زوجها: سعد - 0557654321'],
    ['عمر يوسف الدوسري',      'Omar Al-Dosari',    '1120456789', '2007-01-30', 'male',   'O-',  '0584567890', 'والدته: هيفاء - 0556543210'],
    ['سارة إبراهيم الغامدي',   'Sarah Al-Ghamdi',   '1056789123', '1956-05-18', 'female', 'AB+', '0595678901', 'ابنها: إبراهيم - 0555432109'],
    ['فاطمة عبدالله المالكي',  'Fatimah Al-Malki',  '1067891234', '1964-09-10', 'female', 'A-',  '0506789012', 'ابنتها: مريم - 0554321098'],
    ['محمد علي الحربي',       'Mohammed Al-Harbi', '1045678912', '1971-12-25', 'male',   'B-',  '0517890123', 'زوجته: عائشة - 0553210987'],
    ['ريم أحمد الزهراني',     'Reem Al-Zahrani',   '1098761234', '1991-04-14', 'female', 'O+',  '0528901234', 'زوجها: أحمد - 0552109876'],
  ];

  // Weight (kg) & eGFR (mL/min) for each patient — drives auto-dose calculator
  // Order: [Ahmed, Khaled, Noura, Omar, Sarah, Fatimah, Mohammed, Reem]
  const patientWeights = [82, 78, 65, 55, 68, 72, 88, 60];
  const patientEgfr    = [55, 88, 75, 95, 42, 60, 28, 90]; // Sarah(CKD3b), Mohammed(CKD4)

  const patientIds = [];
  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    db.run(`INSERT INTO patients (mrn, national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, emergency_contact, registered_by, registered_at, weight_kg, egfr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`HIS-${twoDaysAgo.replace(/-/g,'')}-${String(i+1).padStart(5,'0')}`, p[2], p[0], p[1], p[3], p[4], p[5], p[6], p[7], erDocId, twoDaysAgo + 'T08:00:00.000Z', patientWeights[i], patientEgfr[i]]);
    patientIds.push(dbLastId());
  }

  // ════════════════════════════════════════════════
  // 3. CONDITIONS & ALLERGIES
  // ════════════════════════════════════════════════

  // Patient 0: Ahmed — STEMI (cardiac, hypertension)
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[0], 'cardiac',       'severe',   erDocId, twoDaysAgo+'T08:10:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[0], 'hypertension',  'moderate', erDocId, twoDaysAgo+'T08:10:00Z']);
  db.run("INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_by, added_at) VALUES (?,?,?,?,?,?)", [patientIds[0], 'Penicillin', 'rash', 'moderate', erDocId, twoDaysAgo+'T08:10:00Z']);

  // Patient 1: Khaled — DKA (diabetes_t1)
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[1], 'diabetes_t1', 'severe', erDocId, twoDaysAgo+'T09:00:00Z']);

  // Patient 2: Noura — Pneumonia (asthma)
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[2], 'asthma', 'mild', erDocId, twoDaysAgo+'T10:00:00Z']);
  db.run("INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_by, added_at) VALUES (?,?,?,?,?,?)", [patientIds[2], 'Sulfa drugs', 'anaphylaxis', 'life_threatening', erDocId, twoDaysAgo+'T10:00:00Z']);

  // Patient 3: Omar — Appendicitis (no conditions)

  // Patient 4: Sarah — Stroke (hypertension, cardiac, stroke_history)
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[4], 'hypertension',  'severe',   erDocId, twoDaysAgo+'T11:00:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[4], 'cardiac',       'moderate', erDocId, twoDaysAgo+'T11:00:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[4], 'diabetes_t2',   'moderate', erDocId, twoDaysAgo+'T11:00:00Z']);

  // Patient 5: Fatimah — Heart failure (cardiac, hypertension, diabetes_t2)
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[5], 'cardiac',       'severe',   erDocId, twoDaysAgo+'T12:00:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[5], 'hypertension',  'severe',   erDocId, twoDaysAgo+'T12:00:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[5], 'diabetes_t2',   'moderate', erDocId, twoDaysAgo+'T12:00:00Z']);
  db.run("INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_by, added_at) VALUES (?,?,?,?,?,?)", [patientIds[5], 'ACE Inhibitors', 'swelling', 'severe', erDocId, twoDaysAgo+'T12:00:00Z']);

  // Patient 6: Mohammed — CKD + Hypertension
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[6], 'ckd',          'moderate', erDocId, twoDaysAgo+'T13:00:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[6], 'hypertension', 'moderate', erDocId, twoDaysAgo+'T13:00:00Z']);
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[6], 'diabetes_t2',  'moderate', erDocId, twoDaysAgo+'T13:00:00Z']);

  // Patient 7: Reem — Asthma exacerbation
  db.run("INSERT INTO patient_conditions (patient_id, condition_code, severity, added_by, added_at) VALUES (?,?,?,?,?)", [patientIds[7], 'asthma', 'severe', erDocId, yesterday+'T06:00:00Z']);

  // Demo patient-safety incidents so the manager's review queue isn't empty.
  db.run("INSERT INTO incident_reports (type, severity, occurred_at, location, patient_id, description, immediate_action, reported_by, reported_at, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ['near_miss', 'no_harm', yesterday+'T22:10:00Z', 'Ward B', patientIds[6], 'Heparin drawn up at 10× the intended dose; caught by the second-nurse check before administration.', 'Dose discarded, correct dose prepared and double-checked.', snurseId, yesterday+'T22:20:00Z', 'open']);
  db.run("INSERT INTO incident_reports (type, severity, occurred_at, location, patient_id, description, immediate_action, reported_by, reported_at, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ['fall', 'low', twoDaysAgo+'T03:40:00Z', 'Ward B — bathroom', patientIds[5], 'Patient slipped getting up to the bathroom unassisted overnight; no injury, vitals stable.', 'Patient assessed, fall-risk flag added, bed alarm enabled.', nurseId, twoDaysAgo+'T03:55:00Z', 'under_review']);

  // ════════════════════════════════════════════════
  // 4. ADMISSIONS
  // ════════════════════════════════════════════════

  const admissions = [
    // [patientIdx, deptId, bed, complexity, dietCode, complaint, diagnosis, onVent, postSurg, admitDate]
    [0, 4, 'ICU-1',  5, 'CAR',   'ألم شديد في الصدر منذ ساعة مع تعرق وغثيان',                       'STEMI — Anterior wall ST-elevation myocardial infarction', 0, 0, twoDaysAgo+'T08:15:00Z'],
    [1, 4, 'ICU-2',  4, 'DM',    'تبول كثير وعطش شديد وتقيؤ منذ يومين، سكري نوع 1 غير منتظم',        'DKA — Diabetic Ketoacidosis, pH 7.12, glucose 480',        0, 0, twoDaysAgo+'T09:10:00Z'],
    [2, 2, 'B-204',  3, 'REG',   'كحة مع بلغم منذ 5 أيام وحرارة وضيق تنفس',                          'Community-acquired pneumonia, CURB-65 score 3',            0, 0, twoDaysAgo+'T10:20:00Z'],
    [3, 3, 'S-101',  2, 'NPO',   'ألم حول السرة انتقل للربع السفلي الأيمن منذ 12 ساعة مع فقدان شهية', 'Acute appendicitis — CT confirmed',                        0, 1, twoDaysAgo+'T11:30:00Z'],
    [4, 4, 'ICU-3',  5, 'DM+LS', 'ضعف مفاجئ بالجانب الأيمن وصعوبة كلام منذ ساعتين',                  'Acute ischemic stroke — Left MCA occlusion, NIHSS 14',    0, 0, twoDaysAgo+'T11:45:00Z'],
    [5, 2, 'B-210',  4, 'CAR',   'ضيق تنفس متزايد منذ 3 أيام مع تورم القدمين وعدم القدرة على النوم',  'Acute decompensated heart failure, EF 30%',                0, 0, twoDaysAgo+'T12:30:00Z'],
    [6, 2, 'B-215',  3, 'REN',   'غثيان وإرهاق شديد مع ارتفاع الكرياتينين في العيادة',               'CKD stage 3B exacerbation, Cr 3.2, K+ 5.8',               0, 0, twoDaysAgo+'T13:15:00Z'],
    [7, 2, 'B-220',  2, 'REG',   'ضيق تنفس شديد مع صفير منذ 6 ساعات، لم تستجب للبخاخ',              'Severe asthma exacerbation, SpO2 89%',                    0, 0, yesterday+'T06:20:00Z'],
  ];

  const admissionIds = [];
  for (const a of admissions) {
    db.run(`INSERT INTO admissions (patient_id, dept_id, bed_number, admitted_by, admitted_at, status, complexity_score, diet_code, chief_complaint, initial_diagnosis, on_ventilator, post_surgery)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      [patientIds[a[0]], a[1], a[2], erDocId, a[9], a[3], a[4], a[5], a[6], a[7], a[8]]);
    admissionIds.push(dbLastId());
  }

  // NOTE: Omar (admissionIds[3]) is discharged at the END of seedHospitalData —
  // discharging him here broke EVERY fresh install: the discharge-protection
  // triggers (trg_rx_block_discharged / trg_lab_block_discharged) aborted the
  // later seed INSERTs of his historical prescriptions and labs, initDB threw
  // "Cannot create prescription on a discharged admission", and the app booted
  // with a broken half-seeded database. (Node tests never run seedData, so only
  // a live browser boot caught this.)

  // ════════════════════════════════════════════════
  // 5. CASE ASSIGNMENTS (Consultant → Doctor)
  // ════════════════════════════════════════════════

  // Internal Medicine patients → Dr. Sarah
  db.run("INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?,?,?,?)", [admissionIds[2], doctorId, consultId, twoDaysAgo+'T10:30:00Z']); // Noura pneumonia
  db.run("INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?,?,?,?)", [admissionIds[5], doctorId, consultId, twoDaysAgo+'T12:45:00Z']); // Fatimah HF
  db.run("INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?,?,?,?)", [admissionIds[6], doctorId, consultId, twoDaysAgo+'T13:30:00Z']); // Mohammed CKD
  db.run("INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?,?,?,?)", [admissionIds[7], doctorId, consultId, yesterday+'T06:30:00Z']);   // Reem asthma

  // Surgery patients → Dr. Majed
  db.run("INSERT INTO case_assignments (admission_id, doctor_id, assigned_by, assigned_at) VALUES (?,?,?,?)", [admissionIds[3], doctorId2, consultSurgId, twoDaysAgo+'T11:45:00Z']); // Omar appendicitis

  // ICU patients remain under consultant direct care (no separate doctor assignment; consultant views them)

  // ════════════════════════════════════════════════
  // 6. INITIAL VITALS (recorded by ER doctor or nurse)
  // ════════════════════════════════════════════════

  const vitalsData = [
    // [admIdx, bpS, bpD, hr, temp, o2, rbs, weight, height, time]
    [0, 160, 95,  110, 37.1, 94,  null, 82,  170, twoDaysAgo+'T08:20:00Z'],
    [0, 145, 88,  98,  37.0, 96,  null, null,null, twoDaysAgo+'T12:00:00Z'],
    [0, 130, 80,  85,  36.8, 97,  null, null,null, yesterday+'T06:00:00Z'],
    [0, 125, 78,  80,  36.9, 98,  null, null,null, today+'T06:00:00Z'],
    [1, 100, 60,  120, 37.5, 98,  480,  65,  175, twoDaysAgo+'T09:15:00Z'],
    [1, 110, 65,  105, 37.3, 99,  280,  null,null, twoDaysAgo+'T14:00:00Z'],
    [1, 115, 70,  90,  37.0, 99,  180,  null,null, yesterday+'T06:00:00Z'],
    [1, 118, 72,  82,  36.9, 99,  145,  null,null, today+'T06:00:00Z'],
    [2, 135, 85,  100, 39.2, 91,  null, 70,  160, twoDaysAgo+'T10:25:00Z'],
    [2, 130, 80,  95,  38.5, 93,  null, null,null, twoDaysAgo+'T18:00:00Z'],
    [2, 125, 78,  88,  37.8, 95,  null, null,null, yesterday+'T06:00:00Z'],
    [2, 120, 75,  82,  37.2, 96,  null, null,null, today+'T06:00:00Z'],
    [3, 120, 75,  88,  38.1, 99,  null, 72,  178, twoDaysAgo+'T11:35:00Z'],
    [4, 185,100,  88,  36.8, 96,  210,  60,  155, twoDaysAgo+'T11:50:00Z'],
    [4, 160, 90,  80,  36.9, 97,  180,  null,null, twoDaysAgo+'T18:00:00Z'],
    [4, 150, 85,  78,  37.0, 97,  165,  null,null, yesterday+'T06:00:00Z'],
    [4, 145, 82,  75,  36.8, 98,  150,  null,null, today+'T06:00:00Z'],
    [5, 170,100,  105, 37.0, 88,  220,  95,  158, twoDaysAgo+'T12:35:00Z'],
    [5, 155, 90,  95,  37.0, 92,  200,  null,null, twoDaysAgo+'T18:00:00Z'],
    [5, 140, 85,  88,  36.9, 94,  185,  null,null, yesterday+'T06:00:00Z'],
    [5, 135, 80,  82,  36.8, 95,  170,  null,null, today+'T06:00:00Z'],
    [6, 165, 95,  78,  37.2, 97,  195,  88,  172, twoDaysAgo+'T13:20:00Z'],
    [6, 150, 88,  75,  37.0, 98,  180,  null,null, yesterday+'T06:00:00Z'],
    [6, 142, 82,  72,  36.9, 98,  160,  null,null, today+'T06:00:00Z'],
    [7, 130, 80,  110, 37.8, 89,  null, 58,  162, yesterday+'T06:25:00Z'],
    [7, 125, 78,  95,  37.3, 93,  null, null,null, yesterday+'T12:00:00Z'],
    [7, 120, 75,  85,  37.0, 96,  null, null,null, today+'T06:00:00Z'],
  ];

  // trg_vitals_future rejects rows later than now+1h. A fresh install booted
  // between 00:00 and 05:00 UTC put today's T06:00Z rows in the future and
  // aborted the whole seed — clamp any future seed timestamp to "now".
  const clampSeedTime = (iso) => (new Date(iso) > new Date() ? new Date().toISOString() : iso);
  for (const v of vitalsData) {
    db.run(`INSERT INTO vitals_log (admission_id, recorded_by, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, o2_sat, rbs, weight_kg, height_cm)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [admissionIds[v[0]], nurseICUId, clampSeedTime(v[9]), v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]]);
  }

  // ════════════════════════════════════════════════
  // 7. CONSULTATIONS — SOAP Notes
  // ════════════════════════════════════════════════

  // Ahmed — STEMI initial
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[0], consultId, 'initial',
     'Patient complains of substernal chest pain radiating to left arm for 1 hour, associated with diaphoresis and nausea. Pain score 8/10. History of hypertension on Amlodipine.',
     'BP 160/95, HR 110, SpO2 94%, RR 22. Diaphoretic. S3 gallop heard. ECG: ST elevation in V2-V4 with reciprocal changes in II, III, aVF. Initial troponin 2.8 ng/mL.',
     'STEMI — Anterior wall ST-elevation myocardial infarction. High risk for cardiogenic shock. Killip Class II.',
     '1. Activate cath lab for primary PCI\n2. Aspirin 300mg PO stat\n3. Clopidogrel 600mg PO loading\n4. Heparin 60 U/kg bolus then 12 U/kg/hr\n5. Morphine 4mg IV for pain\n6. Atorvastatin 80mg PO\n7. Cardiac monitoring in ICU\n8. Serial troponin q6h\n9. Echocardiogram in AM',
     twoDaysAgo+'T08:30:00Z']);

  // Ahmed — Follow-up
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[0], consultId, 'follow_up',
     'Patient reports chest pain resolved post-PCI. Mild fatigue. No SOB at rest. Sleeping well with 2 pillows.',
     'BP 130/80, HR 85, SpO2 97%. Clear lungs. No S3. Troponin trending down 1.8 → 0.9. ECG: resolving ST changes. Echo: EF 45%, anterior hypokinesis.',
     'Post-STEMI Day 1. Successful PCI to LAD with DES. EF reduced but stable.',
     '1. Continue dual antiplatelet therapy\n2. Start Bisoprolol 2.5mg daily\n3. Continue Atorvastatin 80mg\n4. Add Ramipril 2.5mg daily\n5. Cardiac rehab referral\n6. Repeat echo in 6 weeks\n7. Plan step-down to ward tomorrow if stable',
     yesterday+'T08:00:00Z']);

  // Khaled — DKA initial
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[1], consultId, 'initial',
     'Patient with known Type 1 DM, reports polyuria, polydipsia, and vomiting for 2 days. Admits to not taking insulin for 3 days. Last meal yesterday. Abdominal pain diffuse.',
     'BP 100/60, HR 120, RR 32 (Kussmaul), SpO2 98%, Temp 37.5. Dry mucous membranes. Fruity breath odor. Diffuse abdominal tenderness. Glasgow 14 (E4V4M6). Labs: glucose 480, pH 7.12, HCO3 8, K+ 5.1, Na+ 132, BUN 32, Cr 1.6, anion gap 28, serum ketones 5.2.',
     'Severe DKA — pH <7.15, anion gap 28, likely precipitated by insulin non-compliance. No infection source identified yet.',
     '1. NS 0.9% 1000mL bolus over 1hr, then 500mL/hr\n2. Insulin regular IV infusion 0.1 U/kg/hr (6.5 U/hr)\n3. KCl 20mEq in each liter when K+ <5.3\n4. Monitor hourly glucose, q2h ABG and BMP\n5. Strict I/O chart\n6. NPO until acidosis resolves\n7. Blood cultures, UA, CXR to rule out infection\n8. Transition to subQ insulin when pH >7.3, AG closes, patient eating\n9. Diabetes educator consult',
     twoDaysAgo+'T09:30:00Z']);

  // Khaled — Follow-up
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[1], consultId, 'follow_up',
     'Patient feeling much better. No more nausea or vomiting. Mild thirst. Wants to eat. Acknowledges insulin non-compliance.',
     'BP 115/70, HR 82, RR 18, SpO2 99%. Alert, oriented x3. Mucous membranes moist. ABG: pH 7.34, HCO3 18, AG 14. Glucose 145. K+ 4.1.',
     'DKA resolving — pH normalizing, anion gap closing. Ready for transition to subQ insulin.',
     '1. Stop insulin drip\n2. Start Lantus 20 units at bedtime\n3. Start NovoRapid sliding scale with meals\n4. Allow diabetic diet\n5. HbA1c: 11.2% — very poor control\n6. Diabetes education mandatory before discharge\n7. Endocrine clinic follow-up in 1 week\n8. Plan discharge tomorrow if stable on subQ',
     yesterday+'T09:00:00Z']);

  // Noura — Pneumonia
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[2], doctorId, 'initial',
     'Patient reports productive cough with yellowish sputum for 5 days, high-grade fever at home, and progressive SOB. History of mild asthma. No recent travel. No sick contacts. Allergic to sulfa drugs (anaphylaxis).',
     'Temp 39.2, HR 100, BP 135/85, RR 26, SpO2 91% on RA. Right lower lobe crackles on auscultation. Dull percussion right base. WBC 18.5K with left shift (bands 12%). CXR: right lower lobe consolidation with air bronchograms. CRP 180. Procalcitonin 4.2.',
     'Community-acquired pneumonia — severe. CURB-65 score 3 (confusion 0, urea pending, RR 26, BP ok, age 45). Port score suggests ICU-level care. Rule out empyema if not responding.',
     '1. Ceftriaxone 1g IV q24h (avoid sulfa — severe allergy)\n2. Azithromycin 500mg IV daily\n3. O2 via nasal cannula 4L/min to keep SpO2 >92%\n4. Paracetamol 1g IV q6h for fever\n5. NS 1000mL over 8hrs\n6. Blood cultures x2 before antibiotics\n7. Sputum culture\n8. Repeat CXR in 48hrs\n9. If no improvement in 48hrs → CT chest to rule out empyema/abscess',
     twoDaysAgo+'T10:45:00Z']);

  // Noura — Day 2 follow-up
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[2], doctorId, 'follow_up',
     'Patient feels slightly better. Cough still productive but less. Fever spikes less frequent. Able to eat small amounts. Sleeping better.',
     'Temp 37.8 (down from 39.2), HR 88, BP 125/78, RR 20, SpO2 95% on 2L NC. Still has crackles RLL but improved. WBC 14.2 (down from 18.5). CRP 95 (down from 180).',
     'CAP improving on current antibiotics. Trending in right direction.',
     '1. Continue Ceftriaxone + Azithromycin\n2. Wean O2 — try off NC if SpO2 >94% on RA\n3. Switch Paracetamol to PO\n4. Encourage oral intake and mobility\n5. Repeat CXR tomorrow\n6. If continues improving, plan IV-to-PO switch and discharge in 2 days',
     yesterday+'T09:30:00Z']);

  // Omar — Appendicitis
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[3], doctorId2, 'initial',
     'Patient reports periumbilical pain that migrated to RLQ over 12 hours. Anorexia since yesterday. One episode of vomiting. No diarrhea. No urinary symptoms. Last meal 8 hours ago.',
     'Temp 38.1, HR 88, BP 120/75. Tender RLQ with guarding. Positive McBurney point and Rovsing sign. Negative psoas sign. WBC 15.2K. CT abdomen: dilated appendix 12mm with fat stranding, no perforation, no abscess.',
     'Acute uncomplicated appendicitis — CT confirmed.',
     '1. NPO\n2. NS IV maintenance\n3. Cefoxitin 2g IV (surgical prophylaxis)\n4. Paracetamol IV 1g q6h for pain\n5. Consent for laparoscopic appendectomy\n6. Schedule for OR — next available slot\n7. Post-op plan: early mobilization, advance diet as tolerated',
     twoDaysAgo+'T12:00:00Z']);

  // Omar — Post-op discharge
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[3], doctorId2, 'discharge',
     'Patient reports minimal pain at port sites. Tolerating regular diet. Passed flatus. Ambulating independently.',
     'Afebrile, HR 72, BP 118/70. Abdomen soft, port sites clean and dry, no erythema. Bowel sounds present.',
     'Post laparoscopic appendectomy Day 1 — uncomplicated recovery.',
     'Discharge instructions:\n1. Paracetamol 500mg PO q6h PRN pain x5 days\n2. Keep wounds dry for 48hrs\n3. Light activity x1 week, no heavy lifting x4 weeks\n4. Follow-up in surgery clinic in 1 week\n5. Return to ER if: fever >38.5, increasing pain, wound redness/drainage, vomiting',
     yesterday+'T15:00:00Z']);

  // Sarah — Stroke
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[4], consultId, 'initial',
     'Patient brought by family with sudden onset right-sided weakness and slurred speech 2 hours ago. Known hypertension and T2DM. Compliance with medications reported as good. No recent illness or trauma. Last known well at 10:00 AM.',
     'BP 185/100, HR 88, SpO2 96%, Temp 36.8. NIHSS 14: left gaze preference, right facial droop, right arm/leg plegia (0/5), global aphasia, hemianopia. CT head: no hemorrhage. CTA: left MCA M1 occlusion. Glucose 210.',
     'Acute ischemic stroke — large vessel occlusion of left MCA. Within thrombolysis and thrombectomy window. High NIHSS score indicates severe deficit.',
     '1. Alteplase 0.9 mg/kg IV (10% bolus, rest over 60 min)\n2. Activate interventional neuroradiology for mechanical thrombectomy\n3. Labetalol 10-20mg IV to keep BP <185/110 during tPA\n4. Neuro checks q15min during tPA, then q1h\n5. NPO until swallow assessment\n6. Continuous cardiac monitoring\n7. Repeat CT head in 24hrs\n8. Hold home antihypertensives x24hrs\n9. DVT prophylaxis after 24hrs\n10. Insulin sliding scale for glucose management',
     twoDaysAgo+'T12:15:00Z']);

  // Fatimah — Heart failure
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[5], doctorId, 'initial',
     'Patient reports progressive dyspnea on exertion over 3 days, now at rest. Bilateral leg swelling worsening. Orthopnea — sleeping with 4 pillows. PND last 2 nights. Known hypertension and T2DM. Allergic to ACE inhibitors (angioedema). Admits dietary indiscretion — eating salty foods.',
     'BP 170/100, HR 105, RR 28, SpO2 88% RA, Temp 37.0. JVP elevated 12cm. Bilateral basal crackles up to mid-zones. S3 gallop. 3+ pitting edema bilateral. Weight 95kg (dry weight 85kg — 10kg fluid overload). BNP 2400. CXR: bilateral pleural effusions, cardiomegaly, cephalization. Echo: EF 30%, severe LV dysfunction, moderate MR.',
     'Acute decompensated heart failure (ADHF) — EF 30%, NYHA Class IV. Likely triggered by dietary sodium indiscretion and possible medication non-compliance. Fluid overloaded ~10L.',
     '1. Furosemide 80mg IV bolus then 40mg IV q8h (target -1.5L/day)\n2. O2 via non-rebreather 15L/min, consider CPAP if not improving\n3. Fluid restrict 1.5L/day, low sodium diet (cardiac diet)\n4. Daily weights\n5. Strict I/O monitoring\n6. Losartan 50mg daily (ARB — cannot use ACE due to allergy)\n7. Bisoprolol 2.5mg daily (start low)\n8. Spironolactone 25mg daily\n9. Metformin hold — recheck renal function\n10. Cardiology consult for device therapy evaluation',
     twoDaysAgo+'T13:00:00Z']);

  // Mohammed — CKD
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[6], doctorId, 'initial',
     'Patient referred from clinic with worsening kidney function. Reports fatigue, nausea, poor appetite for 1 week. Decreased urine output last 2 days. Known CKD stage 3B, hypertension, T2DM. On Metformin, Amlodipine, Losartan.',
     'BP 165/95, HR 78, SpO2 97%, Temp 37.2. Pallor noted. No edema. Labs: Cr 3.2 (baseline 1.8), BUN 45, K+ 5.8, HCO3 16, Hgb 9.2, phosphate 5.5, calcium 8.0. UA: protein 3+, no casts. Renal US: bilateral small kidneys, no obstruction.',
     'CKD stage 3B acute exacerbation — possible AKI on CKD. Hyperkalemia requiring urgent treatment. Metabolic acidosis. Likely prerenal component — review medications.',
     '1. Calcium gluconate 10% 10mL IV over 10 min (cardiac protection)\n2. Insulin 10U + D50 50mL IV (shift K+ intracellularly)\n3. Kayexalate 30g PO\n4. IV NS 500mL over 4hrs (cautious volume)\n5. STOP Metformin (renal function impaired)\n6. STOP Losartan temporarily (AKI)\n7. Continue Amlodipine for BP\n8. Renal diet (low K+, low phosphorus)\n9. Nephrology consult\n10. Recheck BMP in 4hrs',
     twoDaysAgo+'T13:45:00Z']);

  // Reem — Asthma
  db.run(`INSERT INTO consultations (admission_id, doctor_id, consult_type, subjective, objective, assessment, plan, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[7], doctorId, 'initial',
     'Patient reports severe SOB and chest tightness for 6 hours. Used Ventolin inhaler 8 puffs with no relief. Wheezing worse than usual. Triggered by dusty environment yesterday. No fever. Known asthma since childhood, usually well-controlled on Seretide.',
     'BP 130/80, HR 110, RR 30, SpO2 89% RA, Temp 37.8. In respiratory distress, using accessory muscles. Diffuse bilateral wheezing. Prolonged expiratory phase. No stridor. Peak flow 35% predicted (120 L/min). ABG: pH 7.38, pCO2 42 (normal — ominous sign suggesting fatigue).',
     'Severe asthma exacerbation — near-fatal features (normal pCO2 despite tachypnea suggests respiratory muscle fatigue). Requires aggressive treatment and close monitoring.',
     '1. Salbutamol nebulizer 5mg back-to-back x3, then q1h\n2. Ipratropium nebulizer 500mcg q4h\n3. Hydrocortisone 200mg IV stat, then 100mg IV q6h\n4. O2 via non-rebreather to keep SpO2 >92%\n5. Magnesium sulfate 2g IV over 20min (one-time)\n6. Continuous SpO2 monitoring\n7. Repeat ABG in 2hrs — if pCO2 rising, alert ICU for possible intubation\n8. Peak flow q2h\n9. CXR to rule out pneumothorax\n10. IV fluids NS 1000mL over 8hrs',
     yesterday+'T06:45:00Z']);

  // ════════════════════════════════════════════════
  // 8. PRESCRIPTIONS — realistic drug orders
  // ════════════════════════════════════════════════

  function getDrugId(name) {
    const r = dbGet('SELECT drug_id FROM drugs WHERE name_generic = ?', [name]);
    return r ? r.drug_id : 1;
  }

  const rxData = [
    // Ahmed — STEMI
    [0, consultId, 'Aspirin 81mg', '81mg', 'oral', 'once_daily', 'ongoing'],
    [0, consultId, 'Clopidogrel 75mg', '75mg', 'oral', 'once_daily', '14_days'],
    [0, consultId, 'Atorvastatin 20mg', '80mg', 'oral', 'once_daily', 'ongoing'],
    [0, consultId, 'Bisoprolol 5mg', '2.5mg', 'oral', 'once_daily', 'ongoing'],
    [0, consultId, 'Enoxaparin 60mg', '60mg', 'sc', 'every_12h', '5_days'],
    [0, consultId, 'Pantoprazole 40mg', '40mg', 'oral', 'once_daily', 'ongoing'],
    // Khaled — DKA
    [1, consultId, 'Insulin Regular 100IU/mL', '0.1 U/kg/hr (6.5 U/hr)', 'iv', 'once', 'until_review'],
    [1, consultId, 'Potassium Chloride 20mEq', '20mEq per liter', 'iv', 'every_6h', 'until_review'],
    [1, consultId, 'Normal Saline 0.9% 1000mL', '1000mL', 'iv', 'every_8h', '3_days'],
    [1, consultId, 'Ondansetron 4mg', '4mg', 'iv', 'every_8h', '3_days'],
    // Noura — Pneumonia
    [2, doctorId, 'Ceftriaxone 1g', '1g', 'iv', 'once_daily', '7_days'],
    [2, doctorId, 'Azithromycin 500mg', '500mg', 'iv', 'once_daily', '5_days'],
    [2, doctorId, 'Paracetamol IV 1g/100mL', '1g', 'iv', 'every_6h', '3_days'],
    [2, doctorId, 'Salbutamol Nebulizer 5mg/mL', '5mg', 'inhaled', 'every_6h', '7_days'],
    // Omar — Appendicitis (pre-op)
    [3, doctorId2, 'Paracetamol IV 1g/100mL', '1g', 'iv', 'every_6h', '3_days'],
    // Sarah — Stroke
    [4, consultId, 'Aspirin 81mg', '81mg', 'oral', 'once_daily', 'ongoing'],
    [4, consultId, 'Atorvastatin 20mg', '40mg', 'oral', 'once_daily', 'ongoing'],
    [4, consultId, 'Amlodipine 10mg', '10mg', 'oral', 'once_daily', 'ongoing'],
    [4, consultId, 'Metformin 500mg', '500mg', 'oral', 'twice_daily', 'ongoing'],
    [4, consultId, 'Enoxaparin 40mg', '40mg', 'sc', 'once_daily', 'until_review'],
    [4, consultId, 'Pantoprazole 40mg', '40mg', 'oral', 'once_daily', 'ongoing'],
    // Fatimah — Heart failure
    [5, doctorId, 'Furosemide 40mg', '80mg', 'iv', 'three_times_daily', 'until_review'],
    [5, doctorId, 'Losartan 50mg', '50mg', 'oral', 'once_daily', 'ongoing'],
    [5, doctorId, 'Bisoprolol 5mg', '2.5mg', 'oral', 'once_daily', 'ongoing'],
    [5, doctorId, 'Omeprazole 20mg', '20mg', 'oral', 'once_daily', 'ongoing'],
    // Mohammed — CKD
    [6, doctorId, 'Amlodipine 10mg', '10mg', 'oral', 'once_daily', 'ongoing'],
    [6, doctorId, 'Furosemide 40mg', '40mg', 'oral', 'once_daily', 'until_review'],
    // Reem — Asthma
    [7, doctorId, 'Salbutamol Nebulizer 5mg/mL', '5mg', 'inhaled', 'every_6h', '5_days'],
    [7, doctorId, 'Hydrocortisone 100mg', '100mg', 'iv', 'every_6h', '3_days'],
    [7, doctorId, 'Pantoprazole IV 40mg', '40mg', 'iv', 'once_daily', '3_days'],
  ];

  for (const rx of rxData) {
    const drugId = getDrugId(rx[2]);
    db.run(`INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, duration, start_date, status, prescribed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [admissionIds[rx[0]], rx[1], drugId, rx[2], rx[3], rx[4], rx[5], rx[6], twoDaysAgo, twoDaysAgo+'T09:00:00Z']);
  }

  // ════════════════════════════════════════════════
  // 9. LAB ORDERS — with some results
  // ════════════════════════════════════════════════

  const labData = [
    // Ahmed
    [0, consultId, 'Troponin', 'TROP', 'stat', 'resulted', '2.8', 'ng/mL', 'critical', twoDaysAgo+'T08:30:00Z'],
    [0, consultId, 'Troponin (serial #2)', 'TROP', 'stat', 'resulted', '1.8', 'ng/mL', 'high', twoDaysAgo+'T14:00:00Z'],
    [0, consultId, 'Troponin (serial #3)', 'TROP', 'stat', 'resulted', '0.9', 'ng/mL', 'high', yesterday+'T06:00:00Z'],
    [0, consultId, 'Complete Blood Count (CBC)', 'CBC', 'stat', 'resulted', 'WBC 12.1, Hgb 14.2, Plt 245', '', 'normal', twoDaysAgo+'T08:30:00Z'],
    [0, consultId, 'Coagulation (PT/INR/PTT)', 'COAG', 'stat', 'resulted', 'PT 12.5, INR 1.1, PTT 28', '', 'normal', twoDaysAgo+'T08:30:00Z'],
    [0, consultId, 'Lipid Panel', 'LIPID', 'routine', 'resulted', 'TC 280, LDL 185, HDL 35, TG 300', 'mg/dL', 'high', yesterday+'T06:00:00Z'],
    [0, consultId, 'BNP / NT-proBNP', 'BNP', 'stat', 'resulted', '850', 'pg/mL', 'high', twoDaysAgo+'T08:30:00Z'],
    // Khaled
    [1, consultId, 'Arterial Blood Gas (ABG)', 'ABG', 'stat', 'resulted', 'pH 7.12, pCO2 20, HCO3 8, BE -18', '', 'critical', twoDaysAgo+'T09:15:00Z'],
    [1, consultId, 'Basic Metabolic Panel (BMP)', 'BMP', 'stat', 'resulted', 'Na 132, K 5.1, Cl 98, CO2 8, BUN 32, Cr 1.6, Glu 480', '', 'critical', twoDaysAgo+'T09:15:00Z'],
    [1, consultId, 'HbA1c', 'HBA1C', 'routine', 'resulted', '11.2', '%', 'critical', twoDaysAgo+'T09:15:00Z'],
    [1, consultId, 'ABG #2', 'ABG', 'stat', 'resulted', 'pH 7.28, pCO2 28, HCO3 14, BE -10', '', 'high', twoDaysAgo+'T14:00:00Z'],
    [1, consultId, 'ABG #3', 'ABG', 'stat', 'resulted', 'pH 7.34, pCO2 32, HCO3 18, BE -6', '', 'normal', yesterday+'T06:00:00Z'],
    [1, consultId, 'Complete Blood Count (CBC)', 'CBC', 'routine', 'resulted', 'WBC 11.5, Hgb 15.0, Plt 310', '', 'normal', twoDaysAgo+'T09:15:00Z'],
    // Noura
    [2, doctorId, 'Complete Blood Count (CBC)', 'CBC', 'stat', 'resulted', 'WBC 18.5, Bands 12%, Hgb 11.8, Plt 350', '', 'high', twoDaysAgo+'T10:30:00Z'],
    [2, doctorId, 'C-Reactive Protein (CRP)', 'CRP', 'stat', 'resulted', '180', 'mg/L', 'critical', twoDaysAgo+'T10:30:00Z'],
    [2, doctorId, 'Procalcitonin', 'PCT', 'stat', 'resulted', '4.2', 'ng/mL', 'high', twoDaysAgo+'T10:30:00Z'],
    [2, doctorId, 'Blood Culture', 'BCX', 'stat', 'resulted', 'Streptococcus pneumoniae — sensitive to ceftriaxone', '', 'high', yesterday+'T12:00:00Z'],
    [2, doctorId, 'CRP #2', 'CRP', 'routine', 'resulted', '95', 'mg/L', 'high', yesterday+'T10:00:00Z'],
    [2, doctorId, 'CBC #2', 'CBC', 'routine', 'resulted', 'WBC 14.2, Hgb 11.5, Plt 380', '', 'high', yesterday+'T10:00:00Z'],
    // Omar
    [3, doctorId2, 'Complete Blood Count (CBC)', 'CBC', 'stat', 'resulted', 'WBC 15.2, Hgb 14.8, Plt 290', '', 'high', twoDaysAgo+'T11:40:00Z'],
    [3, doctorId2, 'C-Reactive Protein (CRP)', 'CRP', 'stat', 'resulted', '85', 'mg/L', 'high', twoDaysAgo+'T11:40:00Z'],
    [3, doctorId2, 'Urinalysis', 'UA', 'routine', 'resulted', 'Normal — no WBC, no RBC, no bacteria', '', 'normal', twoDaysAgo+'T11:40:00Z'],
    // Sarah
    [4, consultId, 'Complete Blood Count (CBC)', 'CBC', 'stat', 'resulted', 'WBC 9.8, Hgb 12.0, Plt 220', '', 'normal', twoDaysAgo+'T12:00:00Z'],
    [4, consultId, 'Coagulation (PT/INR/PTT)', 'COAG', 'stat', 'resulted', 'PT 13.0, INR 1.0, PTT 30', '', 'normal', twoDaysAgo+'T12:00:00Z'],
    [4, consultId, 'Lipid Panel', 'LIPID', 'routine', 'resulted', 'TC 250, LDL 160, HDL 40, TG 250', 'mg/dL', 'high', twoDaysAgo+'T12:00:00Z'],
    [4, consultId, 'HbA1c', 'HBA1C', 'routine', 'resulted', '7.8', '%', 'high', twoDaysAgo+'T12:00:00Z'],
    [4, consultId, 'Random Blood Sugar (RBS)', 'RBS', 'stat', 'resulted', '210', 'mg/dL', 'high', twoDaysAgo+'T12:00:00Z'],
    // Fatimah
    [5, doctorId, 'BNP / NT-proBNP', 'BNP', 'stat', 'resulted', '2400', 'pg/mL', 'critical', twoDaysAgo+'T12:45:00Z'],
    [5, doctorId, 'Renal Function Tests (RFT)', 'RFT', 'stat', 'resulted', 'Cr 1.4, BUN 28, GFR 45', '', 'high', twoDaysAgo+'T12:45:00Z'],
    [5, doctorId, 'Electrolytes (Na, K, Cl)', 'LYTE', 'stat', 'resulted', 'Na 136, K 4.5, Cl 100', 'mEq/L', 'normal', twoDaysAgo+'T12:45:00Z'],
    [5, doctorId, 'HbA1c', 'HBA1C', 'routine', 'resulted', '8.5', '%', 'high', twoDaysAgo+'T12:45:00Z'],
    // Mohammed
    [6, doctorId, 'Renal Function Tests (RFT)', 'RFT', 'stat', 'resulted', 'Cr 3.2, BUN 45, GFR 22', '', 'critical', twoDaysAgo+'T13:30:00Z'],
    [6, doctorId, 'Electrolytes (Na, K, Cl)', 'LYTE', 'stat', 'resulted', 'Na 138, K 5.8, Cl 104', 'mEq/L', 'critical', twoDaysAgo+'T13:30:00Z'],
    [6, doctorId, 'Phosphate', 'PHOS', 'routine', 'resulted', '5.5', 'mg/dL', 'high', twoDaysAgo+'T13:30:00Z'],
    [6, doctorId, 'Calcium', 'CA', 'routine', 'resulted', '8.0', 'mg/dL', 'low', twoDaysAgo+'T13:30:00Z'],
    [6, doctorId, 'Complete Blood Count (CBC)', 'CBC', 'stat', 'resulted', 'WBC 8.5, Hgb 9.2, Plt 195', '', 'low', twoDaysAgo+'T13:30:00Z'],
    [6, doctorId, 'RFT #2', 'RFT', 'stat', 'resulted', 'Cr 2.8, BUN 38, GFR 26', '', 'high', yesterday+'T06:00:00Z'],
    [6, doctorId, 'K+ recheck', 'LYTE', 'stat', 'resulted', 'K 4.8', 'mEq/L', 'normal', yesterday+'T06:00:00Z'],
    // Reem
    [7, doctorId, 'Arterial Blood Gas (ABG)', 'ABG', 'stat', 'resulted', 'pH 7.38, pCO2 42, HCO3 24', '', 'normal', yesterday+'T06:30:00Z'],
    [7, doctorId, 'Complete Blood Count (CBC)', 'CBC', 'routine', 'resulted', 'WBC 10.2, Hgb 13.5, Plt 280, Eosinophils 8%', '', 'normal', yesterday+'T06:30:00Z'],
    [7, doctorId, 'ABG #2', 'ABG', 'stat', 'resulted', 'pH 7.40, pCO2 38, HCO3 24', '', 'normal', yesterday+'T14:00:00Z'],
  ];

  for (const l of labData) {
    const isCritical = (l[8] && l[8].includes('critical')) ? 1 : 0;
    db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, priority, status, ordered_at, resulted_at, result_value, result_unit, result_flag, is_critical)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [admissionIds[l[0]], l[1], l[2], l[3], l[4], l[5], l[9], l[5]==='resulted' ? l[9] : null, l[6], l[7], l[8], isCritical]);
  }

  // ════════════════════════════════════════════════
  // 10. NURSE ASSIGNMENTS
  // ════════════════════════════════════════════════

  // Internal medicine patients (dept 2) → nurses Mona, Reem
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[2], nurseId,  'morning', today, snurseId, today+'T06:00:00Z']);
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[5], nurseId,  'morning', today, snurseId, today+'T06:00:00Z']);
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[6], nurseId2, 'morning', today, snurseId, today+'T06:00:00Z']);
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[7], nurseId2, 'morning', today, snurseId, today+'T06:00:00Z']);

  // ICU patients → nurse Amal
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[0], nurseICUId, 'morning', today, snurseICUId, today+'T06:00:00Z']);
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[1], nurseICUId, 'morning', today, snurseICUId, today+'T06:00:00Z']);
  db.run("INSERT INTO nurse_assignments (admission_id, nurse_id, shift, shift_date, assigned_by, assigned_at) VALUES (?,?,?,?,?,?)", [admissionIds[4], nurseICUId, 'morning', today, snurseICUId, today+'T06:00:00Z']);

  // ════════════════════════════════════════════════
  // 11. NURSING TASKS — completed tasks from yesterday
  // ════════════════════════════════════════════════

  const taskData = [
    [2, nurseId,  'vitals_check',     'BP 125/78, HR 88, Temp 37.8, SpO2 95%',          yesterday+'T07:00:00Z'],
    [2, nurseId,  'medication_given',  'Ceftriaxone 1g IV administered, site checked OK', yesterday+'T08:00:00Z'],
    [2, nurseId,  'fluid_intake',      '200mL water PO + 500mL NS IV',                   yesterday+'T10:00:00Z'],
    [2, nurseId,  'vitals_check',     'BP 120/75, HR 82, Temp 37.2, SpO2 96%',           yesterday+'T14:00:00Z'],
    [2, nurseId,  'wound_care',       'IV site left antecubital — clean, no redness',     yesterday+'T14:30:00Z'],
    [2, nurseId,  'medication_given',  'Azithromycin 500mg IV administered',               yesterday+'T16:00:00Z'],
    [2, nurseId,  'urine_output',     '1800mL in 8hr shift',                              yesterday+'T14:00:00Z'],
    [2, nurseId,  'patient_education','Discussed importance of completing full antibiotic course. Patient understood.', yesterday+'T15:00:00Z'],

    [5, nurseId,  'vitals_check',     'BP 140/85, HR 88, SpO2 94%, Weight 92kg (-3kg)', yesterday+'T07:00:00Z'],
    [5, nurseId,  'medication_given',  'Furosemide 80mg IV given',                       yesterday+'T08:00:00Z'],
    [5, nurseId,  'fluid_intake',      'Fluid restricted: 300mL water PO total this shift', yesterday+'T14:00:00Z'],
    [5, nurseId,  'urine_output',     '2400mL — excellent diuresis',                     yesterday+'T14:00:00Z'],
    [5, nurseId,  'repositioning',     'Elevated HOB 45 degrees, pillows under arms for comfort', yesterday+'T10:00:00Z'],

    [0, nurseICUId, 'vitals_check',    'BP 130/80, HR 85, SpO2 97%, ECG: NSR',           yesterday+'T07:00:00Z'],
    [0, nurseICUId, 'medication_given', 'Enoxaparin 60mg SC given, rotated injection site',yesterday+'T08:00:00Z'],
    [0, nurseICUId, 'iv_check',        'Right radial arterial line — site clean, waveform good', yesterday+'T10:00:00Z'],
    [0, nurseICUId, 'repositioning',    'Turned to left lateral, skin intact, no pressure areas', yesterday+'T12:00:00Z'],

    [1, nurseICUId, 'blood_sugar_check','Glucose 180 — insulin drip at 4 U/hr',          yesterday+'T07:00:00Z'],
    [1, nurseICUId, 'blood_sugar_check','Glucose 145 — insulin drip at 3 U/hr',          yesterday+'T10:00:00Z'],
    [1, nurseICUId, 'fluid_intake',    'NS 0.45% running at 250mL/hr + KCl 20mEq/L',    yesterday+'T08:00:00Z'],
    [1, nurseICUId, 'vitals_check',    'BP 115/70, HR 82, Temp 37.0, GCS 15',            yesterday+'T14:00:00Z'],
    [1, nurseICUId, 'patient_education','Insulin injection technique reviewed with patient. Return demonstration done.', yesterday+'T15:00:00Z'],

    [4, nurseICUId, 'vitals_check',    'BP 150/85, HR 78, SpO2 97%. NIHSS 12 (slight improvement from 14)', yesterday+'T07:00:00Z'],
    [4, nurseICUId, 'repositioning',    'Turned to right lateral. HOB 30 degrees. Skin intact.', yesterday+'T08:00:00Z'],
    [4, nurseICUId, 'hygiene',         'Full bed bath given. Oral care with foam swabs (NPO).', yesterday+'T09:00:00Z'],
    [4, nurseICUId, 'blood_sugar_check','Glucose 165 — sliding scale insulin 4U SC given', yesterday+'T12:00:00Z'],
  ];

  for (const tk of taskData) {
    db.run("INSERT INTO nursing_tasks (admission_id, nurse_id, task_type, task_detail, status, done_at, notes) VALUES (?,?,?,?,?,?,?)",
      [admissionIds[tk[0]], tk[1], tk[2], tk[3], 'done', tk[4], tk[3]]);
  }

  // Handover note
  db.run("INSERT INTO nursing_tasks (admission_id, nurse_id, task_type, task_detail, status, done_at, notes) VALUES (?,?,?,?,?,?,?)",
    [admissionIds[2], nurseId, 'handover_note',
     'SBAR Handover:\nS: Noura Al-Otaibi, Room B-204, CAP Day 2 on Ceftriaxone+Azithromycin\nB: 45F, asthmatic, sulfa-allergic. Admitted with RLL pneumonia, CURB-65=3.\nA: Improving — fever down from 39.2→37.2, WBC trending down, SpO2 96% on 2L NC (was 91% on RA). Eating small amounts.\nR: Continue current antibiotics. Wean O2 — try room air trial. Repeat CXR scheduled for tomorrow. May step down to oral antibiotics if continues improving.',
     'done', yesterday+'T14:30:00Z',
     'End of shift handover — patient improving well']);

  // ════════════════════════════════════════════════
  // 12. DISPENSING LOG — pharmacist dispensed some meds
  // ════════════════════════════════════════════════

  db.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at, notes) VALUES (?,?,?,?,?,?,?)",
    [1, getDrugId('Aspirin 81mg'), patientIds[0], 30, pharmId, twoDaysAgo+'T09:30:00Z', 'Verified: no contraindication for post-STEMI']);
  db.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at, notes) VALUES (?,?,?,?,?,?,?)",
    [3, getDrugId('Atorvastatin 20mg'), patientIds[0], 30, pharmId, twoDaysAgo+'T09:30:00Z', 'High-intensity statin for ACS']);
  db.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at, notes) VALUES (?,?,?,?,?,?,?)",
    [11, getDrugId('Ceftriaxone 1g'), patientIds[2], 7, pharmId, twoDaysAgo+'T11:00:00Z', 'Sulfa-allergic patient — ceftriaxone safe']);
  db.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at, notes) VALUES (?,?,?,?,?,?,?)",
    [12, getDrugId('Azithromycin 500mg'), patientIds[2], 5, pharmId, twoDaysAgo+'T11:00:00Z', null]);
  db.run("INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at, notes) VALUES (?,?,?,?,?,?,?)",
    [22, getDrugId('Furosemide 40mg'), patientIds[5], 10, pharmId, twoDaysAgo+'T13:30:00Z', 'Large dose — heart failure protocol']);

  // ════════════════════════════════════════════════
  // 14. Additional Drug Interactions
  // ════════════════════════════════════════════════

  const moreInteractions = [
    ['Clopidogrel 75mg', 'Omeprazole 20mg', 'yellow', 'Omeprazole reduces clopidogrel efficacy via CYP2C19 inhibition — use pantoprazole instead', 'أوميبرازول يقلل فعالية كلوبيدوغريل — استخدم بانتوبرازول بدلاً منه'],
    ['Enoxaparin 60mg', 'Aspirin 81mg', 'yellow', 'Increased bleeding risk with concurrent anticoagulant + antiplatelet — monitor for bleeding', 'زيادة خطر النزيف عند الجمع بين مضاد التخثر ومضاد الصفيحات'],
    ['Furosemide 40mg', 'Metformin 500mg', 'yellow', 'Furosemide may worsen renal function — monitor Metformin dose with changing GFR', 'فيوروسيمايد قد يؤثر على الكلى — راقب جرعة ميتفورمين'],
  ];
  for (const ix of moreInteractions) {
    const rowA = dbGet('SELECT drug_id FROM drugs WHERE name_generic = ?', [ix[0]]);
    const rowB = dbGet('SELECT drug_id FROM drugs WHERE name_generic = ?', [ix[1]]);
    if (rowA && rowB) {
      db.run('INSERT OR IGNORE INTO drug_interactions (drug_a_id, drug_b_id, severity, description, description_ar) VALUES (?, ?, ?, ?, ?)',
        [rowA.drug_id, rowB.drug_id, ix[2], ix[3], ix[4]]);
    }
  }

  // ════════════════════════════════════════════════
  // LAB ORDERS — Various workflow states
  // ════════════════════════════════════════════════

  // Patient 1 (Ahmed - STEMI/ICU) — some labs resulted, some pending
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at, received_by, received_at, resulted_at, resulted_by, result_value, result_flag, notes)
    VALUES (1, ${doctorId}, 'Troponin I/T', 'TROP', 'blood', 'chemistry_cardiac', 'blood', 'stat', 'resulted', '${twoDaysAgo}T08:30:00Z', 'STAT. Repeat at 3h and 6h if initial negative.', ${nurseId}, '${twoDaysAgo}T08:35:00Z', ${labTechId}, '${twoDaysAgo}T08:40:00Z', '${twoDaysAgo}T09:00:00Z', ${labTechId}, '2.5 ng/mL', 'critical_high', 'Critical value — physician notified')`);
  const tropOrderId = dbLastId();
  db.run(`INSERT INTO lab_result_details (order_id, component_en, component_ar, value, unit, ref_range, flag) VALUES
    (${tropOrderId}, 'Troponin I', 'تروبونين I', '2.5', 'ng/mL', '<0.04', 'critical_high')`);

  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at, received_by, received_at, resulted_at, resulted_by, result_value, result_flag)
    VALUES (1, ${doctorId}, 'Complete Blood Count (CBC)', 'CBC', 'blood', 'hematology', 'blood', 'urgent', 'resulted', '${twoDaysAgo}T08:30:00Z', '', ${nurseId}, '${twoDaysAgo}T08:35:00Z', ${labTechId}, '${twoDaysAgo}T08:40:00Z', '${twoDaysAgo}T09:15:00Z', ${labTechId}, 'See details', 'normal')`);
  const cbcOrderId = dbLastId();
  db.run(`INSERT INTO lab_result_details (order_id, component_en, component_ar, value, unit, ref_range, flag) VALUES
    (${cbcOrderId}, 'WBC', 'كريات بيضاء', '8.2', 'x10³/µL', '4.5-11.0', 'normal'),
    (${cbcOrderId}, 'RBC', 'كريات حمراء', '4.8', 'x10⁶/µL', '4.5-5.5', 'normal'),
    (${cbcOrderId}, 'Hemoglobin', 'هيموغلوبين', '14.2', 'g/dL', '13.5-17.5', 'normal'),
    (${cbcOrderId}, 'Platelets', 'صفائح دموية', '245', 'x10³/µL', '150-400', 'normal')`);

  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at, received_by, received_at, resulted_at, resulted_by, result_value, result_flag)
    VALUES (1, ${doctorId}, 'Lipid Panel', 'LIPID', 'blood', 'chemistry_metabolic', 'blood', 'routine', 'resulted', '${yesterday}T07:00:00Z', 'Fasting 9-12 hours recommended', ${nurseId}, '${yesterday}T07:05:00Z', ${labTechId}, '${yesterday}T07:10:00Z', '${yesterday}T10:00:00Z', ${labTechId}, 'See details', 'high')`);
  const lipidOrderId = dbLastId();
  db.run(`INSERT INTO lab_result_details (order_id, component_en, component_ar, value, unit, ref_range, flag) VALUES
    (${lipidOrderId}, 'Total Cholesterol', 'كوليسترول كلي', '265', 'mg/dL', '<200', 'high'),
    (${lipidOrderId}, 'LDL', 'LDL', '178', 'mg/dL', '<100', 'high'),
    (${lipidOrderId}, 'HDL', 'HDL', '38', 'mg/dL', '>40', 'low'),
    (${lipidOrderId}, 'Triglycerides', 'دهون ثلاثية', '210', 'mg/dL', '<150', 'high')`);

  // Patient 2 (Khaled - DKA) — some collected, awaiting lab
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at)
    VALUES (2, ${doctorId}, 'HbA1c', 'HBA1C', 'blood', 'chemistry_metabolic', 'blood', 'routine', 'collected', '${yesterday}T09:00:00Z', 'No fasting required', ${nurseICUId}, '${yesterday}T09:10:00Z')`);

  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at, received_by, received_at, resulted_at, resulted_by, result_value, result_flag)
    VALUES (2, ${doctorId}, 'Arterial Blood Gas (ABG)', 'ABG', 'blood', 'blood_gas', 'arterial_blood', 'stat', 'resulted', '${twoDaysAgo}T10:00:00Z', 'Note FiO2 and ventilator settings.', ${nurseICUId}, '${twoDaysAgo}T10:05:00Z', ${labTechId}, '${twoDaysAgo}T10:10:00Z', '${twoDaysAgo}T10:25:00Z', ${labTechId}, 'See details', 'low')`);
  const abgOrderId = dbLastId();
  db.run(`INSERT INTO lab_result_details (order_id, component_en, component_ar, value, unit, ref_range, flag) VALUES
    (${abgOrderId}, 'pH', 'pH', '7.18', '', '7.35-7.45', 'critical_low'),
    (${abgOrderId}, 'pCO2', 'pCO2', '22', 'mmHg', '35-45', 'low'),
    (${abgOrderId}, 'HCO3', 'بيكربونات', '10', 'mEq/L', '22-26', 'critical_low'),
    (${abgOrderId}, 'Base Excess', 'فائض القاعدة', '-16', 'mEq/L', '-2 to +2', 'critical_low')`);

  // Patient 3 (Noura - Pneumonia) — orders just placed, pending collection
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes)
    VALUES (3, ${doctorId}, 'C-Reactive Protein (CRP)', 'CRP', 'blood', 'chemistry_inflammatory', 'blood', 'urgent', 'ordered', '${now}', '')`);
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes)
    VALUES (3, ${doctorId}, 'Sputum Culture', 'SPUTCX', 'microbiology', 'culture', 'sputum', 'routine', 'ordered', '${now}', 'Deep cough specimen. Early morning preferred.')`);
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes)
    VALUES (3, ${doctorId}, 'Chest X-Ray (PA/Lateral)', 'CXR', 'radiology', 'xray', 'imaging', 'urgent', 'ordered', '${now}', 'Remove jewelry and metal.')`);

  // Patient 5 (Sarah - Stroke) — received by lab, pending results
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at, received_by, received_at)
    VALUES (5, ${doctorId}, 'Coagulation (PT/INR/PTT)', 'PT_INR', 'blood', 'coagulation', 'blood', 'stat', 'received', '${yesterday}T14:00:00Z', 'Note current anticoagulant medications', ${nurseICUId}, '${yesterday}T14:05:00Z', ${labTechId}, '${yesterday}T14:15:00Z')`);
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, prep_notes, collected_by, collected_at, received_by, received_at)
    VALUES (5, ${doctorId}, 'CT Head (non-contrast)', 'CT_HEAD', 'radiology', 'ct', 'imaging', 'stat', 'received', '${yesterday}T14:00:00Z', 'Remove earrings, hairpins.', ${nurseICUId}, '${yesterday}T14:10:00Z', ${radId}, '${yesterday}T14:20:00Z')`);

  // Patient 7 (Mohammed - CKD) — renal panel resulted
  db.run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, test_code, category, subcategory, specimen_type, priority, status, ordered_at, collected_by, collected_at, received_by, received_at, resulted_at, resulted_by, result_value, result_flag)
    VALUES (7, ${doctorId}, 'Renal Function Tests (RFT)', 'RFT', 'blood', 'chemistry_renal', 'blood', 'routine', 'resulted', '${twoDaysAgo}T07:00:00Z', ${nurseId}, '${twoDaysAgo}T07:10:00Z', ${labTechId}, '${twoDaysAgo}T07:20:00Z', '${twoDaysAgo}T09:00:00Z', ${labTechId}, 'See details', 'high')`);
  const rftOrderId = dbLastId();
  db.run(`INSERT INTO lab_result_details (order_id, component_en, component_ar, value, unit, ref_range, flag) VALUES
    (${rftOrderId}, 'BUN', 'يوريا', '45', 'mg/dL', '7-20', 'high'),
    (${rftOrderId}, 'Creatinine', 'كرياتينين', '3.8', 'mg/dL', '0.7-1.3', 'critical_high'),
    (${rftOrderId}, 'eGFR', 'معدل الترشيح', '18', 'mL/min', '>90', 'critical_low')`);

  // Nursing procedure log entries
  db.run(`INSERT INTO nursing_procedure_log (procedure_code, admission_id, nurse_id, started_at, completed_at, steps_completed, status)
    VALUES ('IV_CANNULATION', 1, ${nurseId}, '${twoDaysAgo}T08:20:00Z', '${twoDaysAgo}T08:30:00Z', '${JSON.stringify(new Array(16).fill(true))}', 'completed')`);
  db.run(`INSERT INTO nursing_procedure_log (procedure_code, admission_id, nurse_id, started_at, completed_at, steps_completed, status)
    VALUES ('VITALS_CHECK', 3, ${nurseId}, '${yesterday}T08:00:00Z', '${yesterday}T08:10:00Z', '${JSON.stringify(new Array(11).fill(true))}', 'completed')`);
  db.run(`INSERT INTO nursing_procedure_log (procedure_code, admission_id, nurse_id, started_at, completed_at, steps_completed, status)
    VALUES ('VENIPUNCTURE', 1, ${nurseId}, '${twoDaysAgo}T08:35:00Z', '${twoDaysAgo}T08:45:00Z', '${JSON.stringify(new Array(12).fill(true))}', 'completed')`);

  console.log('[DB] Lab orders and procedure logs loaded');

  // ---- Seed Outpatient Visits ----
  const visitNow = nowISO();
  const visits = [
    ['أحمد السالم', 'Ahmed Al-Salem', '1098765432', '0501234567', '1985-03-12', 'male', 2, null, receptionId, visitNow, null, 'صداع متكرر منذ أسبوع', 'walk_in', 'insurance', 'BUPA', 'waiting', null],
    ['فاطمة العمري', 'Fatimah Al-Omari', '1187654321', '0559876543', '1992-07-22', 'female', 6, null, receptionId, visitNow, null, 'متابعة ما بعد الولادة', 'appointment', 'insurance', 'Tawuniya', 'in_progress', null],
    ['خالد النمر', 'Khaled Al-Namar', '1076543210', '0531122334', '1978-11-05', 'male', 7, null, receptionId, visitNow, null, 'ألم في الركبة اليسرى', 'walk_in', 'cash', null, 'waiting', null],
    ['ريم الشمري', 'Reem Al-Shammari', '1165432109', '0549988776', '2000-01-30', 'female', 15, null, receptionId, visitNow, null, 'طفح جلدي مجهول السبب', 'walk_in', 'insurance', 'MedGulf', 'done', null],
    ['محمد البقمي', 'Mohammed Al-Baqami', '1054321098', '0512233445', '1960-09-18', 'male', 20, null, receptionId, visitNow, null, 'غسيل كلى اليوم', 'appointment', 'insurance', 'BUPA', 'waiting', 'مريض منتظم للغسيل'],
    ['نوف الحربي', 'Nouf Al-Harbi', '1143210987', '0577788990', '1995-06-14', 'female', 18, null, receptionId, visitNow, null, 'قلق وتوتر شديد', 'appointment', 'insurance', 'Tawuniya', 'waiting', null],
    ['عبدالله الزهراني', 'Abdullah Al-Zahrani', '1032109876', '0523344556', '1970-04-25', 'male', 16, null, receptionId, visitNow, null, 'انسداد في الأذن وطنين', 'walk_in', 'cash', null, 'waiting', null],
  ];
  for (const v of visits) {
    db.run(`INSERT INTO outpatient_visits
      (patient_name_ar, patient_name_en, national_id, phone, dob, gender, dept_id, doctor_id, registered_by, registered_at, appointment_time, chief_complaint, visit_type, payment_type, insurance_company, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, v);
  }

  // ---- Seed Appointments ----
  const apptBase = new Date(); apptBase.setDate(apptBase.getDate() + 1);
  const apptDay1 = apptBase.toISOString().substring(0,10);
  apptBase.setDate(apptBase.getDate() + 1);
  const apptDay2 = apptBase.toISOString().substring(0,10);

  [
    [apptDay1,'09:00','سلطان المالكي',   'Sultan Al-Malki',   '1067432198','0551122334', 2, doctorId,  'متابعة ضغط الدم'],
    [apptDay1,'10:30','منيرة الحسيني',  'Munira Al-Husseini','1089234567','0562233445', 2, doctorId2, 'ألم بطن'],
    [apptDay1,'11:00','فيصل القرني',    'Faisal Al-Qarni',   '1078901234','0573344556', 7, null,      'ألم ركبة'],
    [apptDay2,'09:30','نوف العتيبي',    'Nouf Al-Otaibi',    '1056712345','0584455667', 6, null,      'متابعة ولادة'],
    [apptDay2,'10:00','راشد الدوسري',   'Rashed Al-Dosari',  '1098765432','0595566778', 8, null,      'التبول المؤلم'],
  ].forEach(a => {
    db.run(`INSERT INTO appointments (appt_date, appt_time, patient_name_ar, patient_name_en, national_id, phone, dept_id, doctor_id, reason, created_by, created_at, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'scheduled')`,
      [a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8], receptionId, nowISO()]);
  });

  console.log('[DB] Outpatient visits and appointment records loaded');

  // ════════════════════════════════════════════════
  // 10. SURGICAL CASES
  // ════════════════════════════════════════════════

  // Omar (patient 3) — Laparoscopic Appendectomy (completed)
  db.run(`INSERT INTO surgical_cases (patient_id, admission_id, surgeon_id, procedure_name, anesthesia_type, or_room, scheduled_date, scheduled_time, estimated_duration_min, pre_op_diagnosis, consent_signed, site_marked, npo_verified, blood_type_confirmed, allergies_reviewed, surgical_team_notes, status, post_op_notes, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [patientIds[3], admissionIds[3], consultSurgId, 'Laparoscopic Appendectomy', 'General', 'OR-1', twoDaysAgo, '14:00', 90, 'Acute appendicitis — CT confirmed', 1, 1, 1, 1, 1, 'Standard laparoscopic set, 3 ports. Prophylactic antibiotics given.', 'completed', 'Appendix removed intact, no perforation. Estimated blood loss 20mL. Patient tolerated procedure well. Moved to recovery.', consultSurgId, twoDaysAgo+'T12:30:00Z']);

  // Ahmed (patient 0) — Coronary Angiography (scheduled)
  db.run(`INSERT INTO surgical_cases (patient_id, admission_id, surgeon_id, procedure_name, anesthesia_type, or_room, scheduled_date, scheduled_time, estimated_duration_min, pre_op_diagnosis, consent_signed, site_marked, npo_verified, blood_type_confirmed, allergies_reviewed, status, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [patientIds[0], admissionIds[0], consultId, 'Coronary Angiography + possible PCI', 'Local', 'OR-2', today, '10:00', 120, 'STEMI — Anterior wall ST-elevation myocardial infarction', 1, 0, 1, 1, 1, 'scheduled', consultId, yesterday+'T10:00:00Z']);

  console.log('[DB] Surgical cases loaded');

  // ════════════════════════════════════════════════
  // 11. DIET ORDERS & MEAL LOGS
  // ════════════════════════════════════════════════

  // Mohammed (patient 6) — Renal diet
  db.run(`INSERT INTO diet_orders (admission_id, diet_type, food_allergies, calorie_target, restrictions, special_instructions, ordered_by, ordered_at, status)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [admissionIds[6], 'Renal', null, 1800, 'Low potassium, low phosphorus, fluid restricted 1.5L/day', 'No bananas, oranges, nuts, dairy. Monitor K+ daily.', doctorId, twoDaysAgo+'T14:00:00Z', 'active']);

  // Ahmed (patient 0) — Cardiac diet
  db.run(`INSERT INTO diet_orders (admission_id, diet_type, food_allergies, calorie_target, restrictions, special_instructions, ordered_by, ordered_at, status)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [admissionIds[0], 'Cardiac', 'Penicillin (drug, not food)', 2000, 'Low fat, low sodium (<2g/day)', 'No fried foods, no caffeine. Heart-healthy meals.', consultId, twoDaysAgo+'T09:00:00Z', 'active']);

  // Khaled (patient 1) — Diabetic diet
  db.run(`INSERT INTO diet_orders (admission_id, diet_type, food_allergies, calorie_target, restrictions, special_instructions, ordered_by, ordered_at, status)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [admissionIds[1], 'Diabetic', null, 1800, 'Controlled carbs, no sugar, no sweets', 'Small frequent meals. Monitor blood glucose before each meal.', consultId, yesterday+'T10:00:00Z', 'active']);

  // Meal logs for Mohammed
  db.run(`INSERT INTO meal_log (diet_order_id, admission_id, meal_type, items_served, intake_pct, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?,?,?)`, [1, admissionIds[6], 'breakfast', 'White rice porridge, boiled egg, apple juice (low-K)', 75, 'Patient ate well', dietitianId, yesterday+'T08:00:00Z']);
  db.run(`INSERT INTO meal_log (diet_order_id, admission_id, meal_type, items_served, intake_pct, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?,?,?)`, [1, admissionIds[6], 'lunch', 'Grilled chicken, white rice, cooked carrots, water', 50, 'Patient reports nausea, ate half portion', dietitianId, yesterday+'T13:00:00Z']);
  db.run(`INSERT INTO meal_log (diet_order_id, admission_id, meal_type, items_served, intake_pct, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?,?,?)`, [1, admissionIds[6], 'dinner', 'Vegetable soup, bread, baked fish, herbal tea', 75, 'Appetite improving', dietitianId, yesterday+'T19:00:00Z']);

  // Nutrition assessment for Mohammed
  db.run(`INSERT INTO nutrition_assessments (admission_id, weight_kg, height_cm, bmi, nutritional_risk, assessment_notes, assessed_by, assessed_at)
    VALUES (?,?,?,?,?,?,?,?)`,
    [admissionIds[6], 88, 172, 29.8, 'high', 'CKD patient with poor appetite and nausea. Weight stable. BMI overweight category. High nutritional risk due to renal dietary restrictions and reduced oral intake. Recommend oral nutritional supplements between meals. Monitor weight daily.', dietitianId, yesterday+'T09:00:00Z']);

  console.log('[DB] Diet orders and meal logs loaded');

  // ════════════════════════════════════════════════
  // 12. SOCIAL WORK CASES
  // ════════════════════════════════════════════════

  // Sarah (patient 4) — 67yo stroke, needs discharge planning
  db.run(`INSERT INTO social_work_cases (admission_id, patient_id, social_worker_id, psychosocial_assessment, risk_level, living_situation, support_system, insurance_status, discharge_needs, referrals, follow_up_needed, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [admissionIds[4], patientIds[4], socialWorkerId, 'Patient is a 67-year-old woman with acute ischemic stroke resulting in right-sided hemiplegia and global aphasia. Lives with her son Ibrahim. Previously independent with ADLs. Son is primary caregiver but works full-time. Patient appears anxious about loss of independence. Financial situation stable with government insurance coverage.', 'high', 'with_family', 'moderate', 'insured', 'Home modifications needed (wheelchair ramp, grab bars in bathroom). Home health nursing 3x/week. Speech therapy outpatient 2x/week. Physical therapy outpatient 3x/week. Family caregiver training for son.', 'Physical Therapy, Speech Therapy, Home Health Services, Occupational Therapy', 1, 'in_progress', twoDaysAgo+'T14:00:00Z', yesterday+'T10:00:00Z']);

  // Fatimah (patient 5) — heart failure, needs home care
  db.run(`INSERT INTO social_work_cases (admission_id, patient_id, social_worker_id, psychosocial_assessment, risk_level, living_situation, support_system, insurance_status, discharge_needs, referrals, follow_up_needed, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [admissionIds[5], patientIds[5], socialWorkerId, 'Patient is a 59-year-old woman with decompensated heart failure, EF 30%. Lives with daughter Maryam. Reports difficulty managing complex medication regimen (8 daily medications). History of dietary non-compliance (salt). Daughter willing to assist but needs education on heart failure management. Patient shows signs of mild depression related to chronic illness limitations.', 'medium', 'with_family', 'strong', 'insured', 'Medication management education for patient and daughter. Dietary counseling (low-sodium). Home health aide for daily weight monitoring and medication reminders. Cardiology follow-up within 1 week. Depression screening follow-up with psychiatry.', 'Cardiac Rehabilitation, Psychiatry (depression screening), Home Health Aide, Dietary Counseling', 1, 'open', yesterday+'T09:00:00Z', null]);

  // Contact logs
  db.run(`INSERT INTO sw_contacts (case_id, contact_type, contact_date, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?)`, [1, 'face_to_face', twoDaysAgo+'T14:00:00Z', 'Initial psychosocial assessment completed. Met with patient and son Ibrahim at bedside. Discussed rehabilitation options, home modification needs, and discharge timeline. Son expressed concern about balancing work and caregiving.', socialWorkerId, twoDaysAgo+'T15:00:00Z']);
  db.run(`INSERT INTO sw_contacts (case_id, contact_type, contact_date, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?)`, [1, 'phone', yesterday+'T10:00:00Z', 'Called home health agency to arrange nursing visits 3x/week post-discharge. Confirmed insurance coverage for home modifications. Son will arrange contractor for bathroom grab bars and wheelchair ramp.', socialWorkerId, yesterday+'T10:30:00Z']);
  db.run(`INSERT INTO sw_contacts (case_id, contact_type, contact_date, notes, recorded_by, recorded_at)
    VALUES (?,?,?,?,?,?)`, [2, 'face_to_face', yesterday+'T09:00:00Z', 'Initial assessment completed. Patient tearful when discussing limitations imposed by heart failure. Daughter Maryam present and actively engaged. Discussed home care options, cardiac rehabilitation programs, and importance of medication compliance. Provided written materials on heart failure management.', socialWorkerId, yesterday+'T09:30:00Z']);

  console.log('[DB] Social work cases loaded');

  // ════════════════════════════════════════════════
  // 11. ANALYTICS HISTORICAL DATA — past discharges, sepsis alerts, etc.
  // ════════════════════════════════════════════════

  // Generate 30 days of past admissions+discharges spread across departments
  // to make analytics dashboards meaningful
  const historicalAdmissions = [
    // [days_ago_admitted, days_stayed, dept_id, name_ar, name_en, dob, diagnosis_en, risk_level, risk_score]
    [45, 5, 2, 'علي محمود', 'Ali Mahmoud', '1958-04-10', 'Community-acquired pneumonia', 'medium', 6],
    [42, 3, 2, 'حسن عبدالعزيز', 'Hassan Abdulaziz', '1972-11-22', 'Acute gastroenteritis', 'low', 2],
    [38, 7, 4, 'مريم سعد', 'Maryam Saad', '1955-07-15', 'Septic shock - urinary source', 'high', 11],
    [35, 4, 3, 'سعد علي', 'Saad Ali', '1980-02-08', 'Appendectomy', 'low', 1],
    [33, 12, 4, 'يوسف خالد', 'Yousef Khaled', '1948-09-19', 'COPD exacerbation requiring intubation', 'high', 10],
    [30, 2, 2, 'هدى محمد', 'Huda Mohammed', '1990-03-25', 'Acute migraine', 'low', 0],
    [28, 6, 2, 'فهد ناصر', 'Fahad Nasser', '1965-12-01', 'Heart failure exacerbation', 'medium', 8],
    [25, 5, 4, 'خديجة الزهراني', 'Khadija Al-Zahrani', '1952-08-14', 'STEMI s/p PCI', 'medium', 7],
    [22, 3, 6, 'بسمة عبدالله', 'Basma Abdullah', '1995-01-30', 'Normal vaginal delivery', 'low', 1],
    [20, 8, 4, 'إبراهيم القحطاني', 'Ibrahim Al-Qahtani', '1949-06-22', 'Acute ischemic stroke', 'high', 12],
    [18, 4, 3, 'عبدالرحمن الفيصل', 'Abdulrahman Al-Faisal', '1968-10-17', 'Cholecystectomy', 'low', 2],
    [16, 6, 2, 'منى الحارثي', 'Mona Al-Harithi', '1973-05-09', 'DKA', 'medium', 6],
    [14, 4, 2, 'سلمى الدوسري', 'Salma Al-Dosari', '1985-12-12', 'Pyelonephritis', 'low', 3],
    [12, 5, 4, 'محمود السبيعي', 'Mahmoud Al-Subaie', '1947-03-08', 'NSTEMI s/p PCI', 'high', 9],
    [10, 3, 2, 'لمى الغامدي', 'Lama Al-Ghamdi', '1992-09-04', 'Acute bronchitis', 'low', 0],
    [8,  6, 4, 'ناصر العتيبي', 'Nasser Al-Otaibi', '1956-11-28', 'Sepsis - pneumonia', 'medium', 7],
    [6,  2, 2, 'هاجر السلمي', 'Hajar Al-Sulami', '1978-07-15', 'Cellulitis right leg', 'low', 1],
    [4,  3, 3, 'وليد المطيري', 'Waleed Al-Mutairi', '1962-04-20', 'Inguinal hernia repair', 'low', 2],
    [2,  1, 2, 'دانا الزهراني', 'Dana Al-Zahrani', '2001-08-25', 'Acute appendicitis (medical mgmt)', 'low', 0],
  ];

  for (const h of historicalAdmissions) {
    const [daysAgo, stayedDays, deptId, nameAr, nameEn, dob, dx, riskLevel, riskScore] = h;
    const admittedAt = new Date(Date.now() - daysAgo * 86400 * 1000).toISOString();
    const dischargedAt = new Date(Date.now() - (daysAgo - stayedDays) * 86400 * 1000).toISOString();

    // Insert patient
    const mrn = `HIS-HIST-${String(daysAgo).padStart(3,'0')}${String(deptId).padStart(2,'0')}`;
    db.run(`INSERT INTO patients (mrn, national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, emergency_contact, registered_by, registered_at, weight_kg, egfr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mrn, '1000000' + daysAgo, nameAr, nameEn, dob, 'unknown', 'O+', '05XXXXXXXX', null, receptionId, admittedAt,
       70 + Math.round(Math.random() * 20), 60 + Math.round(Math.random() * 40)]);
    const pId = dbLastId();

    // Insert admission
    db.run(`INSERT INTO admissions (patient_id, dept_id, bed_number, admitted_by, admitted_at, discharged_at, status, chief_complaint, initial_diagnosis, readmission_risk_score, readmission_risk_level)
      VALUES (?, ?, ?, ?, ?, ?, 'discharged', ?, ?, ?, ?)`,
      [pId, deptId, 'B-' + (200 + Math.floor(Math.random() * 30)), erDocId, admittedAt, dischargedAt, dx, dx, riskScore, riskLevel]);
  }

  // Generate ~12 sepsis alerts spread over 30 days
  const sepsisDays = [38, 33, 28, 25, 20, 18, 14, 10, 8, 6, 4, 2];
  for (const d of sepsisDays) {
    const ts = new Date(Date.now() - d * 86400 * 1000 - Math.random() * 12 * 3600 * 1000).toISOString();
    const ackOffset = Math.round(5 + Math.random() * 45); // 5-50 min ack time
    const ackTs = new Date(new Date(ts).getTime() + ackOffset * 60000).toISOString();
    const severity = Math.random() > 0.5 ? 'high' : 'moderate';
    db.run(`INSERT INTO sepsis_alerts (admission_id, vitals_id, qsofa_score, news2_score, temp, severity, triggered_at, acknowledged_by, acknowledged_at, action_taken)
      VALUES (1, NULL, ?, ?, ?, ?, ?, ?, ?, 'workup_initiated')`,
      [1 + Math.floor(Math.random()*3), 5 + Math.floor(Math.random()*4), 37 + Math.random()*3, severity, ts, doctorId || consultId, ackTs]);
  }

  // Generate ~5 code blue events spread over 30 days
  const codeBlueDays = [30, 22, 15, 9, 3];
  for (const d of codeBlueDays) {
    const ts = new Date(Date.now() - d * 86400 * 1000).toISOString();
    const resolvedTs = new Date(new Date(ts).getTime() + (20 + Math.random()*15) * 60000).toISOString();
    db.run(`INSERT INTO code_blue_events (patient_id, admission_id, location, event_type, initiated_by, initiated_at, outcome, duration_min, resolved_at, notes)
      VALUES (?, ?, ?, 'code_blue', ?, ?, ?, ?, ?, ?)`,
      [1, 1, 'ICU-1', nurseId, ts, Math.random() > 0.5 ? 'ROSC' : 'death', 20 + Math.floor(Math.random()*15), resolvedTs, 'Resuscitation completed per ACLS protocol']);
  }

  console.log('[DB] Historical analytics data seeded');

  // Discharge patient 3 (Omar — appendicitis, post-surgery) LAST, after all his
  // historical clinical rows are in — the rx/lab discharge-protection triggers
  // are BEFORE INSERT, so the order admit → orders → discharge mirrors reality
  // and keeps the seed trigger-clean.
  db.run("UPDATE admissions SET status = 'discharged', discharged_at = ? WHERE admission_id = ?", [yesterday+'T16:00:00Z', admissionIds[3]]);

  console.log('[DB] Hospital data initialized successfully');
}

// ============================================================
// IndexedDB Persistence
// ============================================================

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('HIS_Storage', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('databases');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ------------------------------------------------------------
// Persist coalescing (perf) + backup rotation (durability)
//
// Coalescing: db.export() serializes the ENTIRE database, so we (1) skip the
// write when nothing changed since the last save, and (2) never run two writes
// at once — a burst of mutations collapses into one write and concurrent callers
// await the same in-flight promise; the while-loop re-flushes if a mutation
// lands mid-write, so an awaited save returns only after the latest data is on disk.
//
// Rotation: "current" is rewritten every save (crash safety + latest). A few
// GENERATIONAL snapshots (minute/hour/day) are refreshed only once their cadence
// has elapsed, all in ONE atomic transaction — so a burst of bad saves (e.g. an
// accidental mass-delete that then autosaves repeatedly) can only clobber
// "current", while the older snapshots preserve good states for a recovery
// window. On load we try the newest readable copy and fall back to older ones.
// Cost: a few DB copies in IndexedDB. (A console-capable insider can still wipe
// everything; this defends against accidental / burst / torn-write corruption,
// not deliberate sabotage — that is unsolvable in a client-only sandbox.)
// ------------------------------------------------------------
const DB_META_KEY = 'meta';
const DB_CURRENT_KEY = 'db_current';
const DB_SNAPSHOT_TIERS = [
  { key: 'db_snap_min',  spacingMs: 60 * 1000 },          // refreshed at most ~1 min old
  { key: 'db_snap_hour', spacingMs: 60 * 60 * 1000 },     // ~1 hour old
  { key: 'db_snap_day',  spacingMs: 24 * 60 * 60 * 1000 } // ~1 day old
];
const DB_LEGACY_KEYS = ['main', 'db_0', 'db_1', 'db_2']; // pre-v2 keys cleaned up on migrate
let _dbDirty = true;           // true at boot so the first save always persists
let _savePromise = null;       // in-flight save shared by concurrent callers
let _dbSaved = {};             // meta.saved map: storage key -> last-write epoch ms

// Force the next save to persist even when no dbRun happened — e.g. after
// toggling encryption, which changes how the blob is written, not its contents.
function markDbDirty() { _dbDirty = true; }

// Force the next save to rewrite EVERY generational snapshot, not just
// "current". Toggling encryption MUST call this: otherwise hour/day tiers keep
// the old format until their cadence elapses — after a disable, stale
// encrypted tiers would re-trigger the boot unlock prompt (whose only escape
// is a device wipe, and the passphrase may be long forgotten); after an
// enable, stale PLAINTEXT tiers would defeat encryption-at-rest entirely.
function resetSnapshotCadence() { _dbSaved = {}; }

// Storage adapter over the 'databases' object store. Extracted so the rotation
// and recovery logic can be unit-tested against an in-memory mock.
const idbStore = {
  async get(key) {
    const idb = await openIDB();
    return new Promise((resolve) => {
      const tx = idb.transaction('databases', 'readonly');
      const req = tx.objectStore('databases').get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => resolve(null);
    });
  },
  // Atomically apply puts ([key,val]) and deletes (key) in ONE transaction.
  async batch(puts, deletes) {
    const idb = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction('databases', 'readwrite');
      const store = tx.objectStore('databases');
      (puts || []).forEach(([k, v]) => store.put(v, k));
      (deletes || []).forEach((k) => store.delete(k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async clear() {
    const idb = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction('databases', 'readwrite');
      tx.objectStore('databases').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

// Persist the blob: always (over)write "current", and refresh each generational
// snapshot whose cadence has elapsed — all in ONE atomic transaction, dropping
// any pre-v2 keys. Returns the updated saved-timestamps map.
async function _persistBlobTiered(store, toStore, prevSaved, now, tiers) {
  if (now == null) now = Date.now();          // 0 is a valid epoch — don't treat it as missing
  if (tiers == null) tiers = DB_SNAPSHOT_TIERS;
  const saved = Object.assign({}, prevSaved);
  const puts = [[DB_CURRENT_KEY, toStore]];
  saved[DB_CURRENT_KEY] = now;
  for (const tier of tiers) {
    if (saved[tier.key] == null || (now - saved[tier.key]) >= tier.spacingMs) {
      puts.push([tier.key, toStore]);
      saved[tier.key] = now;
    }
  }
  puts.push([DB_META_KEY, { v: 2, saved }]);
  await store.batch(puts, DB_LEGACY_KEYS);
  return saved;
}

// Per-connection safety pragmas. CRITICAL: sql.js db.export() closes and
// reopens the underlying handle, which silently RESETS every per-connection
// pragma — so a single auto-save used to disarm secure_delete (PHI remanence:
// deleted-row bytes persisted to IndexedDB again) for the rest of the session.
// Called at boot (initDB) AND immediately after every db.export().
//   - secure_delete: zero freed pages on DELETE so exported blobs carry no
//     deleted-PHI remnants (see the remanence note at the boot VACUUM).
//   - foreign_keys: SQLite leaves FKs OFF per connection, so in browser mode
//     every REFERENCES clause was decorative — a dangling admission_id/drug_id/
//     patient_id write succeeded silently (the server sets and re-asserts this
//     for its own connection; the browser never did). Applied AFTER the seed:
//     the seed is owner-controlled, ordered data already asserted by
//     test_seed.js, while runtime writes are where a bad id can come from.
// try/catch per pragma — an old sql.js build without support degrades to the
// previous behavior instead of failing boot.
function _reassertConnectionPragmas() {
  try { db.run('PRAGMA secure_delete = ON'); } catch (e) {}
  try { db.run('PRAGMA foreign_keys = ON'); } catch (e) {}
}

async function saveDBToIndexedDB() {
  if (SERVER_MODE) return;                 // the central server persists every write itself
  if (!db) return;
  if (!_dbDirty) return;                  // nothing changed since the last save
  if (_savePromise) return _savePromise;  // coalesce: wait on the in-flight write
  _savePromise = (async () => {
    try {
      while (_dbDirty) {
        // Multi-tab clobber detection: each tab holds its own sql.js copy and
        // this full-DB write is last-writer-wins. If the store's "current"
        // stamp is newer than OUR last write, another tab persisted since —
        // their committed changes are about to be overwritten. We cannot merge
        // blobs; the honest move is to warn loudly so staff stop split-tab
        // editing (server mode has no such hazard — one shared DB).
        if (_dbSaved[DB_CURRENT_KEY] != null) {
          try {
            const meta = await idbStore.get(DB_META_KEY);
            if (meta && meta.v === 2 && meta.saved && meta.saved[DB_CURRENT_KEY] != null
                && meta.saved[DB_CURRENT_KEY] > _dbSaved[DB_CURRENT_KEY]) {
              console.warn('[DB] another tab wrote this database since our last save — its changes are being overwritten');
              if (typeof showError === 'function') {
                const ar = (typeof currentLanguage === 'function' && currentLanguage() === 'ar');
                showError(ar ? 'تحذير: تبويب آخر حفظ تغييرات على قاعدة البيانات — استخدم تبويباً واحداً فقط للإدخال.'
                             : 'WARNING: another tab saved changes to this database — use ONE tab for data entry.');
              }
            }
          } catch (e) { /* detection is best-effort; never block the save */ }
        }
        _dbDirty = false;                 // snapshot point: db.export() below is synchronous
        const data = db.export();
        _reassertConnectionPragmas();     // export() reopens the handle — pragmas reset
        // Encrypt at rest when a device passphrase is active (see crypto-store.js).
        // Only the persisted blob is encrypted; the in-memory DB stays plaintext.
        const encrypted = (typeof encIsActive === 'function' && encIsActive());
        const toStore = encrypted ? await encEncrypt(data) : data.buffer;
        _dbSaved = await _persistBlobTiered(idbStore, toStore, _dbSaved);
        // if a mutation re-dirtied the DB during the await, loop and flush again
      }
    } catch (e) {
      // The snapshot never landed. Without this, _dbDirty stayed false and every
      // later save no-opped — in-memory changes silently died with the tab.
      _dbDirty = true;
      console.error('[DB] save failed — data is still only in memory; will retry on next save', e);
      if (typeof showError === 'function') {
        const ar = (typeof currentLanguage === 'function' && currentLanguage() === 'ar');
        showError(ar ? 'فشل حفظ قاعدة البيانات — التغييرات في الذاكرة فقط. لا تغلق التبويب وحاول مجدداً.'
                     : 'Database save FAILED — changes are only in memory. Do not close this tab; retrying on next save.');
      }
    } finally {
      _savePromise = null;
    }
  })();
  return _savePromise;
}

// Collect saved versions newest-first, across v2 generational snapshots, the
// legacy v1 ring, and the pre-rotation single key.
async function _collectDbCandidates(store, meta) {
  if (meta === undefined) meta = await store.get(DB_META_KEY);
  const out = [];
  if (meta && meta.v === 2 && meta.saved) {
    const keys = Object.keys(meta.saved).filter(k => meta.saved[k] != null);
    keys.sort((a, b) => meta.saved[b] - meta.saved[a]);   // newest first
    for (const k of keys) {
      const value = await store.get(k);
      if (value != null) out.push({ key: k, value });
    }
  } else if (meta && typeof meta.current === 'number') {  // legacy v1 ring
    const N = meta.ring || 3;
    for (let i = 0; i < N; i++) {
      const slot = (meta.current - i + N) % N;
      const value = await store.get('db_' + slot);
      if (value != null) out.push({ key: 'db_' + slot, value });
    }
  }
  const legacy = await store.get('main');                 // pre-rotation single key
  if (legacy != null) out.push({ key: 'main', value: legacy });
  return out;
}

// Load the newest readable database version, transparently unlocking encryption
// and falling back to an older backup if the newest copy is unreadable.
// Returns an opened SQL.Database, or null (caller then seeds a fresh DB).
async function loadDatabaseWithRecovery(SQL, store) {
  store = store || idbStore;
  let meta, candidates;
  try {
    meta = await store.get(DB_META_KEY);
    candidates = await _collectDbCandidates(store, meta);
  } catch (e) { return null; }
  if (!candidates.length) return null;
  // Resume the generational cadence; {} for legacy installs forces a full
  // snapshot set on the next save (which also drops the old keys).
  _dbSaved = (meta && meta.v === 2 && meta.saved) ? meta.saved : {};

  // Unlock LAZILY: prompt only when an envelope must actually be read, not
  // because any candidate anywhere is one. After disabling encryption, stale
  // hour/day snapshot tiers can still be envelopes while the newest copy is
  // plaintext — those must not re-lock the app at boot (the unlock prompt's
  // only escape is a full device wipe, and the passphrase may be long
  // forgotten). If the newer copies all fail to open, we still prompt before
  // falling back to an encrypted tier, so nothing recoverable is given up.
  let unlockTried = false;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      let bytes;
      if ((typeof encIsEnvelope === 'function') && encIsEnvelope(c.value)) {
        if (!unlockTried) {
          unlockTried = true;
          const ok = (typeof encBootUnlockMulti === 'function') ? await encBootUnlockMulti(candidates) : false;
          if (!ok) { await wipeLocalDatabase(store); return null; }   // user chose reset
        }
        bytes = await encDecrypt(c.value);     // throws if key wrong / bytes corrupt
      } else {
        bytes = new Uint8Array(c.value);
      }
      const opened = new SQL.Database(bytes);  // may not validate until first real read
      opened.exec('SELECT count(*) FROM sqlite_master');  // force a header/schema read so a corrupt-but-openable blob is rejected here
      if (i > 0) {
        console.warn('[DB] newest copy unreadable; recovered from backup', c.key);
        if (typeof showError === 'function') {
          const ar = (typeof currentLanguage === 'function' && currentLanguage() === 'ar');
          showError(ar ? 'تم استرجاع نسخة احتياطية سابقة (تعذّر قراءة أحدث نسخة).'
                       : 'Recovered an earlier backup — the most recent copy was unreadable.');
        }
      }
      return opened;
    } catch (e) {
      console.warn('[DB] version failed, trying older backup:', c.key, e && e.message);
    }
  }
  console.error('[DB] all local database copies are unreadable');
  if (typeof showError === 'function') {
    const ar = (typeof currentLanguage === 'function' && currentLanguage() === 'ar');
    showError(ar ? 'تعذّر قراءة جميع نسخ قاعدة البيانات المحلية.' : 'All local database copies are unreadable.');
  }
  return null;
}

// Drop ALL persisted versions (encryption "reset" escape hatch / forgotten
// passphrase). The caller then seeds a fresh DB.
async function wipeLocalDatabase(store) {
  try { await (store || idbStore).clear(); } catch (e) {}
  // The store is empty — stale in-memory cadence stamps would otherwise make
  // the next save skip "due" generational tiers and write meta entries that
  // point at keys the wipe just deleted.
  _dbSaved = {};
}

// ============================================================
// Download / Restore Backup
// ============================================================

function downloadBackup() {
  if (!db) return;
  const data = db.export();
  _reassertConnectionPragmas();   // export() reopens the handle — pragmas reset
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HIS_backup_${new Date().toISOString().slice(0,10)}.sqlite`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(t('db_saved'));
}

function restoreBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: f => `vendor/${f}`
        });
        // Validate into a TEMP handle first: a corrupt or wrong file must not
        // replace the live db and then get persisted. Same probe as
        // loadDatabaseWithRecovery, plus a core-table check so a random valid
        // SQLite file can't wipe a hospital DB. Older stored tiers are left
        // as-is — they are the pre-restore safety net.
        let candidate = null;
        try {
          candidate = new SQL.Database(new Uint8Array(reader.result));
          candidate.exec('SELECT count(*) FROM sqlite_master');
          const probe = candidate.exec("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('patients','users','admissions')");
          if (!probe.length || probe[0].values[0][0] < 3) throw new Error('missing core tables');
        } catch (e) {
          if (candidate) { try { candidate.close(); } catch (e2) {} }
          const ar = (typeof currentLanguage === 'function' && currentLanguage() === 'ar');
          showError(ar ? 'الملف ليس نسخة احتياطية صالحة من OpenWard — لم يتم تغيير قاعدة البيانات الحالية.'
                       : 'Not a valid OpenWard backup — the current database was NOT changed.');
          reject(e);
          return;
        }
        if (db) { try { db.close(); } catch (e) {} }
        db = candidate;
        _reassertConnectionPragmas();   // brand-new connection — pragmas are at defaults
        _dbDirty = true;   // brand-new db instance — force a persist
        await saveDBToIndexedDB();
        showSuccess(t('db_loaded'));
        resolve();
      } catch (e) {
        showError(t('error_generic'));
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// Query Helpers
// ============================================================

/**
 * Run a SELECT query and return array of objects
 * @param {string} sql
 * @param {Array} [params]
 * @returns {object[]}
 */
function dbAll(sql, params) {
  if (SERVER_MODE) return _serverSql('query', sql, params).rows;
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

/**
 * Run a SELECT query and return first row as object, or null
 * @param {string} sql
 * @param {Array} [params]
 * @returns {object|null}
 */
function dbGet(sql, params) {
  const rows = dbAll(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Run INSERT/UPDATE/DELETE and return changes info
 * @param {string} sql
 * @param {Array} [params]
 */
function dbRun(sql, params) {
  if (SERVER_MODE) {
    const r = _serverSql('exec', sql, params);
    _serverLastId = r.lastId;
    _serverLastChanges = r.changes || 0;
    return;
  }
  db.run(sql, params);
  _localLastChanges = db.getRowsModified();
  _dbDirty = true;   // mark for the next persist (see saveDBToIndexedDB)
}

// Rows affected by the most recent dbRun — lets guarded UPDATEs ("... AND
// status='active'") detect that they lost a race instead of proceeding.
let _localLastChanges = 0;
let _serverLastChanges = 0;
function dbChanges() {
  return (typeof SERVER_MODE !== 'undefined' && SERVER_MODE) ? _serverLastChanges : _localLastChanges;
}

/**
 * Get the last inserted rowid
 * @returns {number}
 */
function dbLastId() {
  if (SERVER_MODE) return _serverLastId;   // captured from the last exec response
  const r = db.exec('SELECT last_insert_rowid() as id');
  return r[0].values[0][0];
}

// Node test harness only (the browser has no `module`):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadDatabaseWithRecovery, _persistBlobTiered, _collectDbCandidates, wipeLocalDatabase,
    resetSnapshotCadence,
    DB_SNAPSHOT_TIERS, DB_CURRENT_KEY, DB_META_KEY,
    // Build the schema exactly as a brand-new install does — createAllTables()
    // plus the shared migrations — on a caller-provided sql.js DB. Lets the
    // fresh-DB boot test prove a clean install has every column the router uses.
    __buildFreshSchemaForTest(sqlDb) { db = sqlDb; createAllTables(); applySchemaMigrations(); return db; },
  };
}
