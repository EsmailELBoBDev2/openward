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
    // Dental: prescriptions are patient-linked (no inpatient admission).
    try { db.run('ALTER TABLE prescriptions ADD COLUMN patient_id INTEGER'); } catch(e) {}
    // Dental: tie scheduling/billing rows to a patient record + an operatory (chair).
    try { db.run('ALTER TABLE appointments ADD COLUMN patient_id INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE appointments ADD COLUMN operatory_id INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE appointments ADD COLUMN procedure_code TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE outpatient_visits ADD COLUMN patient_id INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE outpatient_visits ADD COLUMN operatory_id INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE invoices ADD COLUMN patient_id INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE invoices ADD COLUMN paid_amount REAL DEFAULT 0'); } catch(e) {}
    try { db.run('ALTER TABLE invoices ADD COLUMN proof_attach_id INTEGER'); } catch(e) {}
    // Dental: patient gets a clinic branch + a free-text clinical notes field.
    try { db.run('ALTER TABLE patients ADD COLUMN branch TEXT'); } catch(e) {}
    try { db.run('ALTER TABLE patients ADD COLUMN notes TEXT'); } catch(e) {}
    // OpenSmile dental tables (settings, odontogram, perio, procedures, plans, chairs, recalls).
    createDentalTables();
    // MAR + critical ack migrations
    // Fix seed data: set is_critical=1 for any resulted lab with a critical flag
    try { db.run(`UPDATE lab_orders SET is_critical = 1 WHERE (result_flag LIKE '%critical%') AND status = 'resulted' AND is_critical = 0`); } catch(e) {}
    // Vitals extended fields for NEWS2
    try { db.run('ALTER TABLE vitals_log ADD COLUMN resp_rate INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN on_o2 INTEGER DEFAULT 0'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN consciousness TEXT DEFAULT "alert"'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN news2_score INTEGER'); } catch(e) {}
    try { db.run('ALTER TABLE vitals_log ADD COLUMN qsofa_score INTEGER'); } catch(e) {}
    // Clinical assessment scales
    // Fluid balance I&O
    // Order set instances
    // Order-set meds with no formulary match: a clinician must prescribe them
    // manually. Tracked here (not as a fake nurse task) so they stay visible and
    // actionable instead of vanishing.
    try { db.run("ALTER TABLE order_set_exceptions ADD COLUMN item_type TEXT DEFAULT 'med'"); } catch(e) {}
    // Code Blue events
    // Home medications (medication reconciliation)
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
    // ---- Nursing care plans (NANDA/NIC/NOC) ----
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
    try { db.run('CREATE INDEX IF NOT EXISTS idx_rx_admission_status ON prescriptions(admission_id, status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_audit_action_ts ON audit_log(action_type, timestamp DESC)'); } catch(e) {}
    // Hot-path indices for per-render worklist/chart queries (profiled against the
    // actual WHERE/ORDER-BY shapes in router.js):
    //  - vitals chart + "latest vitals" + NEWS2 trend: WHERE admission_id ORDER BY recorded_at
    //  - nurse task lists / "overdue": WHERE admission_id AND status
    //  - patient-portal unread badge + inbox: WHERE patient_id AND from_type
    //  - admissions worklists by department: WHERE status AND dept_id
    //  - MAR due/given lookups: WHERE admission_id (+ status)
    try { db.run('CREATE INDEX IF NOT EXISTS idx_portal_msg_patient ON portal_messages(patient_id, from_type)'); } catch(e) {}
    // Hot-path indices, round 2 (verified against the WHERE/JOIN/ORDER-BY
    // shapes actually used in router.js):
    //  - consultations: last/first note per admission (rounds, chart, discharge)
    //  - case_assignments: doctor worklists (WHERE doctor_id) + joins ON admission_id
    //  - nurse_assignments: my-patients (WHERE nurse_id, shift_date) + joins ON admission_id
    //  - med_admin_records: "last administration" per prescription (MAR view + correlated subqueries)
    //  - appointments: date-range lists, per-doctor schedule, per-patient lookups
    //  - sw_contacts / fluid_balance / lab_critical_acks: per-row joins batched in render views
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appt_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, appt_date)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_appt_natid ON appointments(national_id)'); } catch(e) {}
    // Round 3 (EXPLAIN QUERY PLAN sweep over all 286 SQL literals): the only
    // full scans left on GROWTH tables that a one-line index fixes. Verified
    // each flips SCAN -> SEARCH against the seeded schema.
    try { db.run('CREATE INDEX IF NOT EXISTS idx_patients_natid ON patients(national_id)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions(status)'); } catch(e) {}
    try { db.run('CREATE INDEX IF NOT EXISTS idx_patients_dupcheck ON patients(full_name_ar, phone)'); } catch(e) {}

    // Triggers (CHECK constraints can't be added via ALTER in SQLite; use triggers)
    // NOTE: use datetime() to normalize both sides (ISO 8601 with T → SQLite space format)
    // Without this, string comparison of '2026-05-23T08:00:00Z' vs '2026-05-23 09:00:00' fails because 'T'(84) > ' '(32)
    // Same datetime() normalization as vitals
    // D2 fix: block new orders on discharged admissions (schema defense).
    // COALESCE closes the NULL-skip: a NONEXISTENT admission_id made the status
    // subquery NULL, and NULL = 'discharged' is NULL (not true), so a dangling
    // order slipped through wherever FKs are off (browser mode). A missing
    // admission now reads as '' which is <> 'active' → ABORT. DROP first so
    // existing databases get the replacement (CREATE IF NOT EXISTS never would).
    try { db.run('DROP TRIGGER IF EXISTS trg_rx_block_discharged'); } catch(e) {}
    try { db.run('DROP TRIGGER IF EXISTS trg_lab_block_discharged'); } catch(e) {}
    // G5 fix: enforce doctor role on prescriptions at DB level
    // COALESCE closes the NULL hole: a NONEXISTENT doctor_id made the subquery
    // return NULL, and NULL NOT IN (...) is NULL (not true), so the trigger
    // silently allowed the insert. Missing user now reads as role '' → ABORT.
    // DROP first: CREATE IF NOT EXISTS never replaces the pre-fix trigger on
    // existing databases (idempotent — runs every boot).
    try { db.run('DROP TRIGGER IF EXISTS trg_rx_doctor_role'); } catch(e) {}
    try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_rx_doctor_role BEFORE INSERT ON prescriptions FOR EACH ROW
      WHEN COALESCE((SELECT role FROM users WHERE user_id = NEW.doctor_id), '') NOT IN ('dentist','specialist')
      BEGIN
        SELECT RAISE(ABORT, 'doctor_id must reference a user with a dentist role');
      END`); } catch(e) {}
    // RBAC at the data layer (role-alignment pass): the browser gates views by
    // role and the server gates /api by its CAN matrix, but the shared SQL
    // bridge is coarse-trust by design — these triggers make the highest-
    // stakes actor columns refuse a wrong-role user id in BOTH modes
    // (server/server.js reuses this exact schema builder). Same COALESCE
    // pattern as trg_rx_doctor_role: a NONEXISTENT user id reads as role ''
    // and aborts instead of NULL-skipping.
    // D4 fix: limit lab result_value text length (prevent garbage / overflow)

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
    // ---- Nosocomial (hospital-acquired) infections ----

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
// OpenSmile dental tables (called from applySchemaMigrations, which runs for
// BOTH fresh and restored DBs — so every install gets the dental domain).
// Tooth numbering is FDI / ISO-3950 two-digit (11–48 permanent, 51–85 primary).
// ============================================================
function createDentalTables() {
  // Clinic settings — key/value (branch default, lab & owner WhatsApp numbers,
  // debug flag, …). One row per key; values are short strings/JSON.
  try { db.run(`CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`); } catch(e) {}

  // Operatories (treatment chairs / rooms)
  try { db.run(`CREATE TABLE IF NOT EXISTS operatories (
    operatory_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    active  INTEGER DEFAULT 1
  )`); } catch(e) {}

  // Procedure catalog (replaces the hospital lab/radiology catalog).
  // category: diagnostic | preventive | restorative | endodontic | periodontic
  //         | oral_surgery | prosthodontic | orthodontic | cosmetic
  try { db.run(`CREATE TABLE IF NOT EXISTS procedures (
    procedure_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT UNIQUE NOT NULL,
    name_en       TEXT NOT NULL,
    name_ar       TEXT NOT NULL,
    category      TEXT NOT NULL,
    default_price REAL DEFAULT 0,
    duration_min  INTEGER DEFAULT 30,
    tooth_specific INTEGER DEFAULT 1,
    active        INTEGER DEFAULT 1
  )`); } catch(e) {}

  // Odontogram: one row per charting event for a (patient, tooth).
  // status: sound | caries | filled | crown | bridge | implant | missing
  //       | rct | to_extract | sealant | veneer | fracture | impacted
  try { db.run(`CREATE TABLE IF NOT EXISTS odontogram (
    chart_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  INTEGER NOT NULL REFERENCES patients(patient_id),
    tooth_fdi   INTEGER NOT NULL,
    surfaces    TEXT,
    status      TEXT NOT NULL,
    note        TEXT,
    charted_by  INTEGER,
    charted_at  TEXT NOT NULL
  )`); } catch(e) {}

  // Periodontal chart: 6-site probing depths per tooth.
  try { db.run(`CREATE TABLE IF NOT EXISTS perio_chart (
    perio_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  INTEGER NOT NULL REFERENCES patients(patient_id),
    tooth_fdi   INTEGER NOT NULL,
    pockets     TEXT,
    bleeding    TEXT,
    recession   INTEGER,
    mobility    INTEGER,
    charted_by  INTEGER,
    charted_at  TEXT NOT NULL
  )`); } catch(e) {}

  // Treatment plans + their line items (one item = one procedure on one tooth).
  try { db.run(`CREATE TABLE IF NOT EXISTS treatment_plans (
    plan_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  INTEGER NOT NULL REFERENCES patients(patient_id),
    title_en    TEXT,
    title_ar    TEXT,
    status      TEXT DEFAULT 'proposed',
    dentist_id  INTEGER,
    created_at  TEXT NOT NULL,
    notes       TEXT
  )`); } catch(e) {}

  try { db.run(`CREATE TABLE IF NOT EXISTS treatment_plan_items (
    item_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id          INTEGER NOT NULL REFERENCES treatment_plans(plan_id),
    patient_id       INTEGER NOT NULL REFERENCES patients(patient_id),
    procedure_code   TEXT,
    procedure_name_en TEXT,
    procedure_name_ar TEXT,
    tooth_fdi        INTEGER,
    surfaces         TEXT,
    price            REAL DEFAULT 0,
    status           TEXT DEFAULT 'planned',
    phase            INTEGER DEFAULT 1,
    dentist_id       INTEGER,
    appointment_id   INTEGER,
    completed_at     TEXT,
    created_at       TEXT NOT NULL
  )`); } catch(e) {}

  // Recalls (recare): preventive checkup / perio maintenance reminders.
  try { db.run(`CREATE TABLE IF NOT EXISTS recalls (
    recall_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  INTEGER NOT NULL REFERENCES patients(patient_id),
    type        TEXT DEFAULT 'checkup',
    due_date    TEXT NOT NULL,
    status      TEXT DEFAULT 'due',
    created_at  TEXT NOT NULL,
    notes       TEXT
  )`); } catch(e) {}

  // Indexes
  try { db.run('CREATE INDEX IF NOT EXISTS idx_odontogram_patient ON odontogram(patient_id, tooth_fdi)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_perio_patient ON perio_chart(patient_id, tooth_fdi)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tplans_patient ON treatment_plans(patient_id, status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tpitems_plan ON treatment_plan_items(plan_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tpitems_patient ON treatment_plan_items(patient_id, status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_recalls_due ON recalls(status, due_date)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_procedures_cat ON procedures(category)'); } catch(e) {}

  // Defense-in-depth: only clinical staff may author chart/perio entries.
  try { db.run('DROP TRIGGER IF EXISTS trg_chart_author'); } catch(e) {}
  try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_chart_author BEFORE INSERT ON odontogram FOR EACH ROW
    WHEN NEW.charted_by IS NOT NULL AND COALESCE((SELECT role FROM users WHERE user_id = NEW.charted_by), '') NOT IN ('dentist','specialist','hygienist')
    BEGIN SELECT RAISE(ABORT, 'odontogram.charted_by must be clinical staff'); END`); } catch(e) {}
  try { db.run('DROP TRIGGER IF EXISTS trg_plan_author'); } catch(e) {}
  try { db.run(`CREATE TRIGGER IF NOT EXISTS trg_plan_author BEFORE INSERT ON treatment_plans FOR EACH ROW
    WHEN NEW.dentist_id IS NOT NULL AND COALESCE((SELECT role FROM users WHERE user_id = NEW.dentist_id), '') NOT IN ('dentist','specialist')
    BEGIN SELECT RAISE(ABORT, 'treatment_plans.dentist_id must be a dentist'); END`); } catch(e) {}
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



  // ---- Supply ----


  // (supply_transactions was created here for years but no code path ever
  // read or wrote it — removed; existing DBs keep the empty table harmlessly.)

  // ---- Nursing ----



  // ---- Clinical ----

  db.run(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      rx_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER REFERENCES patients(patient_id),
      admission_id  INTEGER,
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


  // ---- Lab Result Details (for tests with multiple components like CBC) ----

  // ---- Nursing Procedures Log ----


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

  // ---- Dietary / Nutrition ----



  // ---- Social Work / Case Management ----


  // ---- Extended vitals columns for NEWS2 ----





  // ---- Medication Administration Record (MAR) ----

  // ---- Critical Lab Acknowledgments ----

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

  // ---- Vaccinations ----

  // ---- Nursing Care Plans (NANDA/NIC/NOC) ----

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

  // ---- Dental formulary ----
  // What a dental clinic actually prescribes/keeps chairside, plus a few common
  // patient HOME meds (anticoagulants/bisphosphonate) kept so the bleeding /
  // MRONJ contraindication checks have something to match against.
  // [name_generic, name_brand, name_ar, category, unit, stock_qty, min_threshold]
  const drugs = [
    // Antibiotics
    ['Amoxicillin 500mg', null, 'أموكسيسيلين 500 ملغ', 'antibiotic', 'capsule', 500, 50],
    ['Amoxicillin/Clavulanate 1g', 'Augmentin', 'أوغمنتين 1 غ', 'antibiotic', 'tablet', 200, 30],
    ['Metronidazole 500mg', 'Flagyl', 'ميترونيدازول 500 ملغ', 'antibiotic', 'tablet', 300, 30],
    ['Clindamycin 300mg', 'Dalacin C', 'كليندامايسين 300 ملغ', 'antibiotic', 'capsule', 200, 30],
    ['Azithromycin 500mg', 'Zithromax', 'أزيثروميسين 500 ملغ', 'antibiotic', 'tablet', 150, 20],
    ['Penicillin V 500mg', null, 'بنسلين V 500 ملغ', 'antibiotic', 'tablet', 100, 20],
    // Analgesics / anti-inflammatory
    ['Ibuprofen 400mg', 'Brufen', 'ايبوبروفين 400 ملغ', 'analgesic', 'tablet', 400, 50],
    ['Paracetamol 500mg', 'Panadol', 'باراسيتامول 500 ملغ', 'analgesic', 'tablet', 500, 50],
    ['Diclofenac 50mg', 'Voltaren', 'ديكلوفيناك 50 ملغ', 'analgesic', 'tablet', 200, 30],
    ['Naproxen 500mg', null, 'نابروكسين 500 ملغ', 'analgesic', 'tablet', 150, 20],
    ['Tramadol 50mg', null, 'ترامادول 50 ملغ', 'analgesic', 'capsule', 60, 20],
    ['Dexamethasone 0.5mg', null, 'ديكساميثازون 0.5 ملغ', 'corticosteroid', 'tablet', 100, 20],
    // Topical / antiseptic mouth care
    ['Chlorhexidine 0.12% Mouthwash', 'Peridex', 'غسول كلورهيكسيدين 0.12%', 'antiseptic', 'bottle', 100, 20],
    ['Benzydamine Mouthwash', 'Difflam', 'غسول بنزيدامين', 'antiseptic', 'bottle', 80, 20],
    ['Lidocaine 2% + Epinephrine', null, 'ليدوكايين 2% + أدرينالين', 'local_anesthetic', 'cartridge', 500, 100],
    ['Articaine 4% + Epinephrine', 'Septanest', 'أرتيكايين 4% + أدرينالين', 'local_anesthetic', 'cartridge', 400, 100],
    // Antifungal (oral candidiasis)
    ['Nystatin Oral Suspension', null, 'نيستاتين معلق فموي', 'antifungal', 'bottle', 50, 10],
    ['Fluconazole 150mg', 'Diflucan', 'فلوكونازول 150 ملغ', 'antifungal', 'capsule', 50, 10],
    // Anxiolytic (dental anxiety / pre-op)
    ['Diazepam 5mg', 'Valium', 'ديازيبام 5 ملغ', 'anxiolytic', 'tablet', 60, 20],
    // Common patient HOME meds (not dispensed here — reference for safety checks)
    ['Warfarin 5mg', 'Coumadin', 'وارفارين 5 ملغ', 'anticoagulant', 'tablet', 0, 0],
    ['Aspirin 81mg', null, 'أسبرين 81 ملغ', 'antiplatelet', 'tablet', 0, 0],
    ['Clopidogrel 75mg', 'Plavix', 'كلوبيدوغريل 75 ملغ', 'antiplatelet', 'tablet', 0, 0],
    ['Alendronate 70mg', 'Fosamax', 'أليندرونات 70 ملغ', 'bisphosphonate', 'tablet', 0, 0],
  ];
  for (const d of drugs) {
    db.run(`INSERT OR IGNORE INTO drugs (name_generic, name_brand, name_ar, category, unit, stock_qty, min_threshold, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [...d, nowISO()]);
  }

  // ---- Drug interactions relevant to dentistry (mostly post-op analgesic vs.
  // patient anticoagulant bleeding risk). AI-drafted demo content — needs a
  // dentist/pharmacist sign-off before real use. ----
  const interactions = [
    ['Ibuprofen 400mg', 'Warfarin 5mg', 'red', 'NSAID + warfarin sharply raises bleeding risk — avoid; prefer paracetamol post-op', 'مضاد الالتهاب + وارفارين يرفع خطر النزيف بشدة — يُفضّل الباراسيتامول بعد العملية'],
    ['Diclofenac 50mg', 'Warfarin 5mg', 'red', 'NSAID + warfarin sharply raises bleeding risk — avoid', 'مضاد الالتهاب + وارفارين يرفع خطر النزيف بشدة — تجنّب'],
    ['Naproxen 500mg', 'Warfarin 5mg', 'red', 'NSAID + warfarin sharply raises bleeding risk — avoid', 'مضاد الالتهاب + وارفارين يرفع خطر النزيف بشدة — تجنّب'],
    ['Metronidazole 500mg', 'Warfarin 5mg', 'yellow', 'Metronidazole potentiates warfarin — monitor INR closely', 'ميترونيدازول يقوّي مفعول الوارفارين — راقب INR عن قرب'],
    ['Azithromycin 500mg', 'Warfarin 5mg', 'yellow', 'Macrolide may raise INR — monitor for bleeding', 'الماكروليد قد يرفع INR — راقب علامات النزيف'],
    ['Ibuprofen 400mg', 'Aspirin 81mg', 'yellow', 'NSAID can blunt aspirin cardioprotection and add GI/bleeding risk', 'مضاد الالتهاب قد يقلّل حماية الأسبرين ويزيد خطر النزيف المعدي'],
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

// OpenSmile demo seed — a full fictional dental clinic so every screen and the
// guided tour have realistic data. All names/records are invented (no real PHI).
async function seedDentalDemo() {
  if (dbGet("SELECT user_id FROM users WHERE username = 'dr.saeed'")) return;
  const now = nowISO();
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); // n days from today
  const at = (d, t) => `${d}T${t}:00.000Z`;

  async function mkUser(username, password, nameAr, nameEn, role, deptId, spec) {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    db.run(`INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, specialization, is_active, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`, [username, hash, salt, nameAr, nameEn, role, deptId, spec || null, now]);
    return dbLastId();
  }

  // ── 1. Staff (admin / HIS@2024 already created in seedData) ──
  const managerId = await mkUser('manager',   'manager123', 'عبدالرحمن الفيصل', 'Abdulrahman Al-Faisal', 'clinic_manager', 10, null);
  const omarId    = await mkUser('dr.saeed',   'doctor123',  'د. سعيد الراشد',    'Dr. Saeed Al-Rashed',    'dentist',        1,  'General Dentistry');
  const saraId    = await mkUser('dr.sara',   'doctor123',  'د. سارة الحمدان',  'Dr. Sara Al-Hamdan',    'specialist',     2,  'Orthodontics');
  const khalidId  = await mkUser('dr.khalid', 'doctor123',  'د. خالد العمري',   'Dr. Khalid Al-Omari',   'specialist',     4,  'Oral & Maxillofacial Surgery');
  const monaId    = await mkUser('hyg.mona',  'nurse123',   'منى الحربي',       'Mona Al-Harbi',         'hygienist',      1,  'Dental Hygiene');
  const recepId   = await mkUser('reception', 'recept123',  'سارة الجهني',      'Sara Al-Juhani',        'receptionist',   10, null);

  // ── 2. Operatories (chairs) ──
  const ops = [['Chair 1', 'كرسي ١'], ['Chair 2', 'كرسي ٢'], ['Surgery Suite', 'غرفة الجراحة']];
  for (const [en, ar] of ops) db.run('INSERT INTO operatories (name_en, name_ar, active) VALUES (?, ?, 1)', [en, ar]);

  // ── 3. Procedure catalog (ADA-style codes; prices in SAR; AI-drafted demo) ──
  const PROC = [
    // [code, en, ar, category, price, durationMin, toothSpecific]
    ['D0120', 'Periodic Oral Exam', 'فحص دوري', 'diagnostic', 80, 15, 0],
    ['D0140', 'Limited Problem-Focused Exam', 'فحص محدود', 'diagnostic', 100, 15, 0],
    ['D0150', 'Comprehensive Oral Exam', 'فحص شامل', 'diagnostic', 150, 30, 0],
    ['D0220', 'Periapical X-ray', 'أشعة ذروية', 'diagnostic', 50, 10, 1],
    ['D0274', 'Bitewing X-rays (4 films)', 'أشعة عضّ', 'diagnostic', 90, 10, 0],
    ['D0330', 'Panoramic X-ray', 'أشعة بانوراما', 'diagnostic', 150, 15, 0],
    ['D1110', 'Prophylaxis — Adult (Cleaning)', 'تنظيف أسنان — بالغ', 'preventive', 200, 45, 0],
    ['D1120', 'Prophylaxis — Child', 'تنظيف أسنان — طفل', 'preventive', 150, 30, 0],
    ['D1206', 'Topical Fluoride Varnish', 'طلاء فلورايد', 'preventive', 80, 15, 0],
    ['D1351', 'Sealant (per tooth)', 'حشوة وقائية (سيلانت)', 'preventive', 90, 20, 1],
    ['D2140', 'Amalgam Filling — 1 surface', 'حشوة أملغم — سطح', 'restorative', 180, 30, 1],
    ['D2330', 'Composite Filling — Anterior', 'حشوة كمبوزيت — أمامية', 'restorative', 220, 40, 1],
    ['D2391', 'Composite Filling — Posterior 1 surf', 'حشوة كمبوزيت — خلفية', 'restorative', 250, 45, 1],
    ['D2392', 'Composite Filling — Posterior 2 surf', 'حشوة كمبوزيت — سطحين', 'restorative', 320, 50, 1],
    ['D2740', 'Porcelain Crown', 'تاج خزفي', 'prosthodontic', 1500, 60, 1],
    ['D2950', 'Core Buildup', 'بناء قلب السن', 'restorative', 350, 45, 1],
    ['D3310', 'Root Canal — Anterior', 'علاج عصب — أمامي', 'endodontic', 900, 60, 1],
    ['D3320', 'Root Canal — Premolar', 'علاج عصب — ضاحك', 'endodontic', 1100, 75, 1],
    ['D3330', 'Root Canal — Molar', 'علاج عصب — طاحن', 'endodontic', 1400, 90, 1],
    ['D4341', 'Scaling & Root Planing (per quadrant)', 'تنظيف عميق (ربع فم)', 'periodontic', 400, 45, 0],
    ['D4910', 'Periodontal Maintenance', 'صيانة لثة', 'periodontic', 250, 45, 0],
    ['D7140', 'Simple Extraction', 'خلع بسيط', 'oral_surgery', 250, 30, 1],
    ['D7210', 'Surgical Extraction', 'خلع جراحي', 'oral_surgery', 500, 45, 1],
    ['D7240', 'Impacted Wisdom Tooth Removal', 'خلع ضرس عقل منطمر', 'oral_surgery', 900, 60, 1],
    ['D5110', 'Complete Denture — Upper', 'طقم كامل — علوي', 'prosthodontic', 3000, 90, 0],
    ['D6010', 'Implant Placement', 'زراعة سن', 'prosthodontic', 4000, 90, 1],
    ['D6240', 'Bridge Pontic (per unit)', 'جسر (وحدة)', 'prosthodontic', 1400, 60, 1],
    ['D8080', 'Comprehensive Orthodontics', 'تقويم أسنان شامل', 'orthodontic', 8000, 30, 0],
    ['D8210', 'Removable Orthodontic Appliance', 'جهاز تقويم متحرك', 'orthodontic', 1200, 30, 0],
    ['D9972', 'External Bleaching (Whitening)', 'تبييض أسنان', 'cosmetic', 800, 60, 0],
    ['D2962', 'Porcelain Veneer', 'فينير خزفي', 'cosmetic', 1800, 60, 1],
  ];
  const PRICE = {}, PNAME = {};
  for (const [code, en, ar, cat, price, dur, ts] of PROC) {
    db.run('INSERT OR IGNORE INTO procedures (code, name_en, name_ar, category, default_price, duration_min, tooth_specific) VALUES (?,?,?,?,?,?,?)', [code, en, ar, cat, price, dur, ts]);
    PRICE[code] = price; PNAME[code] = { en, ar };
  }

  // ── 4. Patients + their clinical data ──
  // [nameAr, nameEn, natId, dob, gender, blood, phone, regDaysAgo, portal]
  const patients = [
    ['أحمد القحطاني',  'Ahmed Al-Qahtani', '1089567234', '1979-03-15', 'male',   'A+', '0551234567', 420, 1],
    ['نورة العتيبي',   'Noura Al-Otaibi',  '1104892356', '1996-07-22', 'female', 'O+', '0562345678', 300, 0],
    ['خالد الشهري',    'Khalid Al-Shehri', '1098765432', '1990-11-03', 'male',   'B+', '0553456789', 180, 0],
    ['فاطمة الزهراني', 'Fatima Al-Zahrani','1076543210', '1962-01-28', 'female', 'A-', '0564567890', 365, 0],
    ['عبدالله الدوسري','Abdullah Al-Dosari','1122334455','2017-05-19', 'male',   'O+', '0555678901', 90,  0],
    ['مريم الحربي',    'Mariam Al-Harbi',  '1066778899', '1971-09-09', 'female', 'AB+','0566789012', 240, 0],
    ['سعد المطيري',    'Saad Al-Mutairi',  '1033445566', '1988-12-12', 'male',   'B-', '0557890123', 150, 0],
    ['هند القرني',     'Hind Al-Qarni',    '1100112233', '2003-02-14', 'female', 'O+', '0568901234', 60,  0],
    ['يوسف الغامدي',   'Yousef Al-Ghamdi', '1055667788', '1968-06-30', 'male',   'A+', '0559012345', 200, 0],
    ['ليلى السبيعي',   'Layla Al-Subaie',  '1011223344', '1985-10-05', 'female', 'AB-','0560123456', 110, 0],
  ];
  const pid = [];
  const demoBranches = ['tagamo3', 'roxy', 'qoba'];
  patients.forEach((p, i) => {
    const reg = day(-p[7]);
    const mrn = `OS-${reg.replace(/-/g, '')}-${String(i + 1).padStart(5, '0')}`;
    db.run(`INSERT INTO patients (mrn, national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, branch, registered_by, registered_at, portal_enabled)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [mrn, p[2], p[0], p[1], p[3], p[4], p[5], p[6], demoBranches[i % 3], recepId, at(reg, '09:00'), p[8]]);
    pid.push(dbLastId());
  });
  // default clinic settings for the demo
  setSetting('default_branch', 'tagamo3');
  setSetting('clinic_name', 'OpenSmile Dental');

  // helpers ----------------------------------------------------------------
  const cond = (i, code, dispEn, cat) => db.run('INSERT INTO patient_conditions (patient_id, condition_code, category, display, status, added_by, added_at) VALUES (?,?,?,?,?,?,?)', [pid[i], code, cat || 'chronic', dispEn, 'active', omarId, now]);
  const allergy = (i, allergen, reaction, sev) => db.run('INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, added_by, added_at) VALUES (?,?,?,?,?,?)', [pid[i], allergen, reaction, sev, monaId, now]);
  const flag = (i, en, ar, color) => db.run('INSERT INTO patient_flags (patient_id, label_en, label_ar, color, created_by, created_at, active) VALUES (?,?,?,?,?,?,1)', [pid[i], en, ar, color, omarId, now]);
  const chart = (i, tooth, status, surfaces, note, by) => db.run('INSERT INTO odontogram (patient_id, tooth_fdi, surfaces, status, note, charted_by, charted_at) VALUES (?,?,?,?,?,?,?)', [pid[i], tooth, surfaces || null, status, note || null, by || omarId, now]);
  const recall = (i, type, dueDays, status) => db.run('INSERT INTO recalls (patient_id, type, due_date, status, created_at) VALUES (?,?,?,?,?)', [pid[i], type, day(dueDays), status || 'due', now]);
  const rx = (i, drugName, dose, route, freq, dur, by) => {
    const d = dbGet('SELECT drug_id FROM drugs WHERE name_generic = ?', [drugName]);
    db.run(`INSERT INTO prescriptions (patient_id, admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, duration, start_date, status, prescribed_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`, [pid[i], by || omarId, d ? d.drug_id : null, drugName, dose, route, freq, dur, day(0), now]);
  };
  function plan(i, titleEn, titleAr, status, dentistId) {
    db.run('INSERT INTO treatment_plans (patient_id, title_en, title_ar, status, dentist_id, created_at) VALUES (?,?,?,?,?,?)', [pid[i], titleEn, titleAr, status, dentistId || omarId, now]);
    return dbLastId();
  }
  const planItem = (planId, i, code, tooth, surfaces, status, dentistId, completedDays) =>
    db.run(`INSERT INTO treatment_plan_items (plan_id, patient_id, procedure_code, procedure_name_en, procedure_name_ar, tooth_fdi, surfaces, price, status, dentist_id, completed_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [planId, pid[i], code, PNAME[code].en, PNAME[code].ar, tooth || null, surfaces || null, PRICE[code], status, dentistId || omarId, status === 'completed' ? at(day(completedDays || 0), '10:00') : null, now]);
  function appt(i, deptId, doctorId, dDays, time, code, status, opId) {
    const p = patients[i];
    db.run(`INSERT INTO appointments (patient_id, patient_name_ar, patient_name_en, national_id, phone, dept_id, doctor_id, operatory_id, appt_date, appt_time, reason, procedure_code, visit_type, status, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [pid[i], p[0], p[1], p[2], p[6], deptId, doctorId, opId || 1, day(dDays), time, code ? PNAME[code].en : 'Checkup', code || null, 'dental', status, recepId, now]);
    return dbLastId();
  }
  function visit(i, deptId, doctorId, time, complaint, status, opId) {
    const p = patients[i];
    db.run(`INSERT INTO outpatient_visits (patient_id, patient_name_ar, patient_name_en, national_id, phone, dob, gender, dept_id, doctor_id, operatory_id, registered_by, registered_at, appointment_time, chief_complaint, visit_type, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [pid[i], p[0], p[1], p[2], p[6], p[3], p[4], deptId, doctorId, opId || 1, recepId, at(day(0), '08:30'), time, complaint, 'walk_in', status]);
    return dbLastId();
  }
  function invoice(i, visitDays, items, paymentType, status) {
    const p = patients[i];
    let subtotal = 0; items.forEach(it => subtotal += PRICE[it] || 0);
    const discount = 0, total = subtotal - discount;
    const paid = status === 'paid' ? total : (status === 'partial' ? Math.round(total / 2) : 0);
    db.run(`INSERT INTO invoices (patient_id, patient_name_ar, patient_name_en, national_id, dept_id, visit_date, subtotal, discount, total, paid_amount, payment_type, status, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [pid[i], p[0], p[1], p[2], 1, day(visitDays), subtotal, discount, total, paid, paymentType, status, recepId, now]);
    const invId = dbLastId();
    items.forEach(code => db.run('INSERT INTO invoice_items (invoice_id, description_en, description_ar, qty, unit_price, total_price) VALUES (?,?,?,?,?,?)', [invId, PNAME[code].en, PNAME[code].ar, 1, PRICE[code], PRICE[code]]));
    return invId;
  }

  // ── Patient 0: Ahmed — AFib on warfarin, penicillin allergy, needs an extraction (bleeding + allergy story). Portal patient. ──
  cond(0, 'I48.0', 'Atrial fibrillation', 'chronic');
  cond(0, 'I10', 'Hypertension', 'chronic');
  allergy(0, 'Penicillin', 'Rash and facial swelling', 'severe');
  flag(0, 'On anticoagulant (Warfarin)', 'يتناول مميّع دم (وارفارين)', 'danger');
  chart(0, 46, 'caries', 'O', 'Deep caries, symptomatic'); chart(0, 36, 'filled', 'MO', '');
  chart(0, 26, 'crown', null, 'PFM crown 2019'); chart(0, 16, 'rct', null, 'RCT + crown');
  let pl0 = plan(0, 'Caries management & hygiene', 'علاج التسوّس والتنظيف', 'in_progress', omarId);
  planItem(pl0, 0, 'D0150', null, null, 'completed', omarId, -7);
  planItem(pl0, 0, 'D1110', null, null, 'completed', omarId, -7);
  planItem(pl0, 0, 'D2391', 46, 'O', 'planned', omarId);
  rx(0, 'Clindamycin 300mg', '300 mg', 'PO', 'TID', '5 days', omarId); // penicillin-allergic → clindamycin
  appt(0, 1, omarId, -7, '09:00', 'D0150', 'completed', 1);
  appt(0, 1, omarId, 2, '11:30', 'D2391', 'scheduled', 1);
  invoice(0, -7, ['D0150', 'D1110'], 'insurance', 'paid');
  recall(0, 'checkup', 170, 'due');

  // ── Patient 1: Noura — orthodontics (specialist), latex allergy ──
  allergy(1, 'Latex', 'Contact dermatitis', 'moderate');
  chart(1, 13, 'sound', null, 'Crowding'); chart(1, 23, 'sound', null, 'Crowding');
  let pl1 = plan(1, 'Comprehensive orthodontics', 'تقويم شامل', 'accepted', saraId);
  planItem(pl1, 1, 'D0330', null, null, 'completed', saraId, -14);
  planItem(pl1, 1, 'D8080', null, null, 'in_progress', saraId);
  appt(1, 2, saraId, -14, '10:00', 'D0150', 'completed', 2);
  appt(1, 2, saraId, 0, '10:00', 'D8080', 'checked_in', 2); // TODAY
  invoice(1, -14, ['D0150', 'D0330'], 'cash', 'paid');
  visit(1, 2, saraId, '10:00', 'Orthodontic adjustment', 'waiting', 2);

  // ── Patient 2: Khalid — pulpitis, needs molar root canal ──
  cond(2, 'K04.0', 'Pulpitis', 'acute');
  chart(2, 46, 'caries', 'OD', 'Irreversible pulpitis');
  let pl2 = plan(2, 'Endodontic treatment 46', 'علاج عصب 46', 'in_progress', omarId);
  planItem(pl2, 2, 'D3330', 46, null, 'in_progress', omarId);
  planItem(pl2, 2, 'D2740', 46, null, 'planned', omarId);
  rx(2, 'Amoxicillin 500mg', '500 mg', 'PO', 'TID', '5 days', omarId);
  rx(2, 'Ibuprofen 400mg', '400 mg', 'PO', 'TID PRN', '3 days', omarId);
  appt(2, 1, omarId, 0, '12:00', 'D3330', 'scheduled', 1); // TODAY
  visit(2, 1, omarId, '12:00', 'Severe toothache lower right', 'waiting', 1);
  recall(2, 'checkup', -5, 'due');

  // ── Patient 3: Fatima — diabetic, on bisphosphonate (MRONJ flag), perio maintenance ──
  cond(3, 'E11.9', 'Type 2 diabetes', 'chronic');
  cond(3, 'M81.0', 'Osteoporosis (on alendronate)', 'chronic');
  flag(3, 'Bisphosphonate — MRONJ risk before extraction', 'بيسفوسفونات — خطر تنخّر الفك قبل الخلع', 'danger');
  chart(3, 47, 'missing', null, ''); chart(3, 37, 'missing', null, '');
  chart(3, 16, 'caries', 'M', '');
  let pl3 = plan(3, 'Perio maintenance + filling', 'صيانة لثة وحشوة', 'in_progress', omarId);
  planItem(pl3, 3, 'D4910', null, null, 'completed', omarId, -3);
  planItem(pl3, 3, 'D2330', 16, 'M', 'planned', omarId);
  db.run('INSERT INTO perio_chart (patient_id, tooth_fdi, pockets, bleeding, recession, mobility, charted_by, charted_at) VALUES (?,?,?,?,?,?,?,?)', [pid[3], 16, '3,2,4,5,3,3', '0,0,1,1,0,0', 2, 1, monaId, now]);
  db.run('INSERT INTO perio_chart (patient_id, tooth_fdi, pockets, bleeding, recession, mobility, charted_by, charted_at) VALUES (?,?,?,?,?,?,?,?)', [pid[3], 26, '4,3,5,6,4,3', '1,0,1,1,1,0', 3, 2, monaId, now]);
  appt(3, 5, omarId, -3, '09:30', 'D4910', 'completed', 1);
  appt(3, 1, omarId, 7, '09:30', 'D2330', 'scheduled', 1);
  invoice(3, -3, ['D4910'], 'insurance', 'paid');
  recall(3, 'perio_maintenance', 25, 'due');

  // ── Patient 4: Abdullah (child) — sealants + fluoride, pediatric ──
  flag(4, 'Pediatric patient', 'مريض أطفال', 'info');
  chart(4, 16, 'sealant', null, ''); chart(4, 26, 'sealant', null, '');
  chart(4, 36, 'caries', 'O', 'Early caries');
  let pl4 = plan(4, 'Preventive — child', 'وقائي — طفل', 'proposed', omarId);
  planItem(pl4, 4, 'D1120', null, null, 'completed', omarId, -30);
  planItem(pl4, 4, 'D1351', 46, null, 'planned', omarId);
  planItem(pl4, 4, 'D2391', 36, 'O', 'planned', omarId);
  appt(4, 6, omarId, -30, '14:00', 'D1120', 'completed', 1);
  invoice(4, -30, ['D1120', 'D1206'], 'cash', 'paid');
  recall(4, 'checkup', 40, 'due');

  // ── Patient 5: Mariam — crown + bridge prosthodontics ──
  chart(5, 24, 'missing', null, ''); chart(5, 25, 'to_extract', null, 'Non-restorable');
  chart(5, 14, 'crown', null, 'Bridge abutment');
  let pl5 = plan(5, 'Bridge 24-25 + crown', 'جسر وتاج', 'accepted', omarId);
  planItem(pl5, 5, 'D7140', 25, null, 'planned', omarId);
  planItem(pl5, 5, 'D6240', 24, null, 'planned', omarId);
  planItem(pl5, 5, 'D2740', 14, null, 'planned', omarId);
  appt(5, 1, omarId, 3, '13:00', 'D7140', 'scheduled', 1);
  recall(5, 'checkup', 5, 'due');

  // ── Patient 6: Saad — cosmetic (whitening + veneers) ──
  chart(6, 11, 'veneer', null, 'Planned'); chart(6, 21, 'veneer', null, 'Planned');
  let pl6 = plan(6, 'Smile makeover', 'تجميل الابتسامة', 'proposed', omarId);
  planItem(pl6, 6, 'D9972', null, null, 'planned', omarId);
  planItem(pl6, 6, 'D2962', 11, null, 'planned', omarId);
  planItem(pl6, 6, 'D2962', 21, null, 'planned', omarId);
  appt(6, 1, omarId, 5, '15:00', 'D9972', 'scheduled', 1);

  // ── Patient 7: Hind — impacted wisdom teeth (oral surgery specialist) ──
  chart(7, 38, 'impacted', null, 'Mesioangular impaction'); chart(7, 48, 'impacted', null, '');
  let pl7 = plan(7, 'Wisdom teeth removal', 'خلع ضروس العقل', 'accepted', khalidId);
  planItem(pl7, 7, 'D7240', 38, null, 'planned', khalidId);
  planItem(pl7, 7, 'D7240', 48, null, 'planned', khalidId);
  rx(7, 'Amoxicillin/Clavulanate 1g', '1 g', 'PO', 'BID', '5 days', khalidId);
  appt(7, 4, khalidId, 1, '11:00', 'D7240', 'scheduled', 3);
  invoice(7, -2, ['D0140', 'D0330'], 'insurance', 'partial');

  // ── Patient 8: Yousef — missing molar, implant; hypertensive ──
  cond(8, 'I10', 'Hypertension', 'chronic');
  chart(8, 46, 'missing', null, 'Lost 2024'); chart(8, 36, 'filled', 'O', '');
  let pl8 = plan(8, 'Implant 46', 'زراعة 46', 'accepted', khalidId);
  planItem(pl8, 8, 'D6010', 46, null, 'planned', khalidId);
  planItem(pl8, 8, 'D2740', 46, null, 'planned', khalidId);
  appt(8, 4, khalidId, 4, '10:30', 'D6010', 'scheduled', 3);
  recall(8, 'checkup', -2, 'due');

  // ── Patient 9: Layla — routine checkup + cleaning, recall ──
  chart(9, 36, 'filled', 'O', ''); chart(9, 46, 'sound', null, '');
  let pl9 = plan(9, 'Routine care', 'رعاية روتينية', 'completed', omarId);
  planItem(pl9, 9, 'D0120', null, null, 'completed', omarId, -1);
  planItem(pl9, 9, 'D1110', null, null, 'completed', omarId, -1);
  appt(9, 1, omarId, 0, '08:30', 'D0120', 'completed', 1); // TODAY completed
  invoice(9, -1, ['D0120', 'D1110', 'D0274'], 'card', 'paid');
  recall(9, 'checkup', 180, 'scheduled');

  console.log('[DB] OpenSmile dental demo seeded — ' + pid.length + ' patients, ' + PROC.length + ' procedures');
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

// ---- Clinic settings (key/value) ----
function getSetting(key, dflt) {
  try { const r = dbGet('SELECT value FROM settings WHERE key = ?', [key]); return (r && r.value != null) ? r.value : (dflt !== undefined ? dflt : null); }
  catch (e) { return dflt !== undefined ? dflt : null; }
}
function setSetting(key, value) {
  try { dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value == null ? null : String(value)]); }
  catch (e) { try { dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value == null ? null : String(value)]); } catch (e2) {} }
}

// The clinic's three branches (extensible). value = stable key stored on patients.branch.
const BRANCHES = [
  { key: 'tagamo3',  en: '5th Settlement (Tagamo3)', ar: 'التجمع الخامس' },
  { key: 'roxy',     en: 'Roxy (Heliopolis)',        ar: 'روكسي - مصر الجديدة' },
  { key: 'qoba',     en: 'Hadayek El-Qobba',         ar: 'حدائق القبة' },
];
function branchLabel(key, lang) { const b = BRANCHES.find(x => x.key === key); return b ? (lang === 'ar' ? b.ar : b.en) : (key || ''); }

// Normalize an Egyptian WhatsApp/phone number to E.164 with the +20 prefix
// (WhatsApp click-to-chat / wa.me wants digits only, country code first, no +).
function normalizeEgPhone(raw) {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);          // local trunk 0
  d = d.replace(/^20/, '');                        // guard double-prefix
  return d ? '20' + d : '';                        // wa.me form: 20XXXXXXXXXX
}
function egDisplay(raw) { const d = normalizeEgPhone(raw); return d ? '+' + d : ''; }

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
