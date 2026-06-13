'use strict';
/*
 * OpenWard LAN server — slice 1 of the browser-only → central-server migration.
 *
 * WHAT THIS IS: one process on the hospital PC that OWNS a single SQLite database
 * and exposes a JSON /api. Every workstation's browser talks to this /api, so all
 * clients read/write the SAME database (fixing the "each browser has its own
 * IndexedDB" problem). The server validates, enforces auth/RBAC, audits, and is
 * the single source of truth.
 *
 * Run it (on the hospital PC):
 *     node server/server.js          # loopback default: http://127.0.0.1:8080
 *     HOST=0.0.0.0 HTTPS_KEY=k.pem HTTPS_CERT=c.pem node server/server.js   # LAN (TLS)
 *   (plain HTTP is refused off-loopback unless OPENWARD_INSECURE_HTTP=1)
 *
 * Zero npm dependencies: Node built-ins (http, fs, crypto) + the vendored sql.js.
 * SQLite lives in server/data/openward.sqlite; the HMAC audit key lives in
 * server/data/audit.key (OUTSIDE the DB, so a DB-only tamper can't forge the
 * chain). ONE process owns the file — never point two servers at it, and never
 * put the file on SMB/NFS (see SQLite locking notes).
 *
 * SCOPE (honest): this slice implements server auth (HttpOnly cookie sessions),
 * RBAC, HMAC-chained audit, and a core set of endpoints (login/me/logout,
 * patients, admissions/beds, vitals). The full client UI still has many flows on
 * the old in-browser DB; those get migrated to /api in following slices. See
 * server/README.md. NOTE: LAN HTTP is cleartext — put this behind HTTPS (local CA)
 * before any real PHI; Web Crypto on the client also needs a secure context.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.OPENWARD_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'openward.sqlite');
const KEY_FILE = path.join(DATA_DIR, 'audit.key');
const HOST = process.env.HOST || '127.0.0.1';   // safe default: loopback. Set HOST=0.0.0.0 (+ HTTPS) for LAN.
const PORT = parseInt(process.env.PORT || '8080', 10);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';   // only then is X-Forwarded-For believed
const DEMO = process.env.OPENWARD_DEMO === '1';        // seed demo accounts ONLY when set
const HTTPS_KEY = process.env.HTTPS_KEY || '';         // path to TLS key (set both to enable HTTPS)
const HTTPS_CERT = process.env.HTTPS_CERT || '';
let IS_HTTPS = false;                                  // set in start()
let setupToken = null;                                  // one-time first-run token (in memory; printed to console)

const initSqlJs = require(path.join(ROOT, 'vendor', 'sql-wasm.js'));
const dbjs = require(path.join(ROOT, 'js', 'db.js'));     // reuse schema builder (createAllTables + migrations)
const u = require(path.join(ROOT, 'js', 'utils.js'));     // reuse hashPassword/verifyPassword (PBKDF2)
const allergyCheck = require(path.join(ROOT, 'js', 'allergy-check.js')); // SAME class-aware allergy matcher as the browser
const fhir = require(path.join(ROOT, 'js', 'fhir-map.js')); // pure row -> FHIR R4 resource mappers

let db = null;            // the one central sql.js Database
let auditKey = null;      // HMAC key, loaded from disk (outside the DB)
let dbWriteVersion = 1;   // bumped on every shared-DB write so other devices know to refresh

// ---- real-time change push (SSE) --------------------------------------------
// Every logged-in workstation holds one EventSource on /api/events; when any
// device writes data, bumpDbVersion() pushes the new version to all of them so
// their screens refresh in ~real time instead of waiting out the poll interval.
// The version-poll endpoint stays as the fallback for clients whose stream
// dropped (EventSource auto-reconnects, and the browser also keeps a slow poll).
const _sseClients = new Set();
function bumpDbVersion() {
  dbWriteVersion++;
  const payload = `data: {"version":${dbWriteVersion}}\n\n`;
  for (const c of _sseClients) {
    try { c.write(payload); } catch (e) { _sseClients.delete(c); }
  }
}
// Heartbeat comment every 25s so idle proxies/firewalls don't reap the sockets.
// unref(): never holds the test process open.
const _sseHeartbeat = setInterval(() => {
  for (const c of _sseClients) { try { c.write(':hb\n\n'); } catch (e) { _sseClients.delete(c); } }
}, 25000);
if (_sseHeartbeat.unref) _sseHeartbeat.unref();
// Per-IP failed-login sliding window (in-memory). The DB lockout is per-ACCOUNT
// (5 fails / 15 min), so one LAN host could spray 5 bad passwords at every
// username and lock the whole hospital out, or enumerate accounts unthrottled.
// 30 failures / 15 min per source IP closes both; loopback is exempt so a
// misbehaving reverse proxy without TRUST_PROXY can't lock out everyone at once.
const ipLoginFails = new Map();   // ip -> [failure timestamps ms]
const IP_FAIL_LIMIT = 30, IP_FAIL_WINDOW_MS = 15 * 60 * 1000;
function ipThrottled(ip) {
  const cutoff = Date.now() - IP_FAIL_WINDOW_MS;
  const recent = (ipLoginFails.get(ip) || []).filter(t => t > cutoff);
  if (recent.length) ipLoginFails.set(ip, recent); else ipLoginFails.delete(ip);
  return recent.length >= IP_FAIL_LIMIT;
}
function recordIpFail(ip) {
  const cutoff = Date.now() - IP_FAIL_WINDOW_MS;
  const recent = (ipLoginFails.get(ip) || []).filter(t => t > cutoff);
  recent.push(Date.now());
  ipLoginFails.set(ip, recent);
  // bound memory if something sprays from many spoofed XFF values
  if (ipLoginFails.size > 10000) { for (const k of ipLoginFails.keys()) { ipLoginFails.delete(k); if (ipLoginFails.size <= 5000) break; } }
}
// First-touch PHI-read audit for the shared-DB bridge: one durable audit row the
// first time a session reads each PHI table (auditing every bridge query would
// write dozens of rows per page render). Keys are `${session_id}:${table}`;
// bounded by live-sessions × PHI-table-count, reset on server restart.
const BRIDGE_PHI_TABLES = ['patients', 'admissions', 'vitals', 'prescriptions', 'lab_orders',
  'med_admin_records', 'patient_allergies', 'patient_conditions', 'appointments',
  'consultations', 'sw_contacts', 'fluid_balance', 'nursing_assessments'];
const bridgePhiAudited = new Set();

// ---- tiny DB helpers over sql.js -------------------------------------------
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try { stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
  finally { stmt.free(); }
}
function get(sql, params = []) { const r = all(sql, params); return r.length ? r[0] : null; }
function run(sql, params = []) { db.run(sql, params); }
function lastId() { const r = get('SELECT last_insert_rowid() AS id'); return r ? r.id : null; }
// Run fn() inside one SQL transaction (clinical write + its audit row commit
// together, or roll back together). Caller persists after a successful return.
function withTx(fn) {
  run('BEGIN IMMEDIATE');
  try { const r = fn(); run('COMMIT'); return r; }
  catch (e) { try { run('ROLLBACK'); } catch (_) {} throw e; }
}
let _persistTimer = null;
function writeDbAtomic() {                  // temp file + rename: a crash mid-write can't corrupt the live DB
  const tmp = DB_FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  // sql.js export() RESETS per-connection pragmas — re-assert them or FK/secure_delete
  // silently switch off after the first save.
  try { db.run('PRAGMA foreign_keys = ON'); } catch (e) {}
  try { db.run('PRAGMA secure_delete = ON'); } catch (e) {}
  fs.renameSync(tmp, DB_FILE);             // rename is atomic on the same filesystem
}
function persist() {                       // debounced write-to-disk
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => { _persistTimer = null; writeDbAtomic(); }, 50);
}
function persistNow() { if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; } writeDbAtomic(); }

// ---- backups (HIPAA contingency planning: a data backup plan is mandatory) ---
// DB_FILE is always a CONSISTENT snapshot (writeDbAtomic = tmp + atomic rename),
// so a backup is a plain copy taken right after a flush. Same-disk backups only
// survive app bugs, not disk death — point OPENWARD_BACKUP_DIR at a second disk
// or a synced/offsite folder for real disaster recovery (3-2-1: 3 copies,
// 2 media, 1 offsite).
const BACKUP_DIR = process.env.OPENWARD_BACKUP_DIR || path.join(DATA_DIR, 'backups');
const BACKUP_HOURS = Number(process.env.OPENWARD_BACKUP_HOURS ?? 24);   // 0 disables scheduled backups
const BACKUP_KEEP = Math.max(1, Number(process.env.OPENWARD_BACKUP_KEEP) || 30);
function runBackup() {
  persistNow();                              // flush pending writes so the copy is current
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dest = path.join(BACKUP_DIR, `openward-${stamp}.sqlite`);
  const tmp = dest + '.tmp';
  fs.copyFileSync(DB_FILE, tmp);
  try { fs.chmodSync(tmp, 0o600); } catch (e) {}   // backups hold the same PHI as the live DB
  fs.renameSync(tmp, dest);
  const have = fs.readdirSync(BACKUP_DIR).filter(f => /^openward-.+\.sqlite$/.test(f)).sort();
  for (const f of have.slice(0, Math.max(0, have.length - BACKUP_KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return dest;
}
function scheduleBackups() {
  if (!(BACKUP_HOURS > 0)) { console.log('[backup] scheduled backups DISABLED (OPENWARD_BACKUP_HOURS=0)'); return; }
  const tick = () => { try { console.log(`[backup] wrote ${runBackup()}`); } catch (e) { console.error('[backup] FAILED:', e.message); } };
  tick();                                    // one at every boot — restarts are the riskiest moment
  setInterval(tick, BACKUP_HOURS * 3600 * 1000).unref();
}

// ---- audit (HMAC chain, key outside the DB) --------------------------------
function auditHash(prev, row) {
  // HMAC must cover EVERY persisted audit field, or an insider could alter an
  // uncovered column (ip, patient name/mrn, role, dept) without breaking the chain.
  const canon = JSON.stringify([
    row.timestamp, row.user_id, row.user_name_en, row.user_name_ar, row.user_role,
    row.dept_id || '', row.patient_id || '', row.patient_name || '', row.patient_mrn || '',
    row.action_type, row.action_detail, row.ip_address || '', prev || '',
  ]);
  return crypto.createHmac('sha256', auditKey).update(canon).digest('hex');
}
function clientIp(req) {
  if (!req) return '';
  // Only believe X-Forwarded-For when explicitly behind a trusted proxy; otherwise
  // any client could spoof it. Default to the real socket address.
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function audit(actor, actionType, detail, req, patient) {
  const prev = get('SELECT row_hash FROM audit_log ORDER BY log_id DESC LIMIT 1');
  const prevHash = prev ? prev.row_hash : null;
  const ip = clientIp(req);
  const row = {
    timestamp: new Date().toISOString(),
    user_id: actor ? actor.user_id : 0,
    user_name_en: actor ? (actor.full_name_en || '') : 'system',
    user_name_ar: actor ? (actor.full_name_ar || '') : 'system',
    user_role: actor ? actor.role : 'system',
    dept_id: actor ? (actor.department_id || null) : null,
    action_type: actionType, action_detail: detail,
    patient_id: patient ? patient.patient_id : null,
    patient_name: patient ? (patient.full_name_en || patient.full_name_ar) : null,
    patient_mrn: patient ? patient.mrn : null,
    ip_address: ip,
  };
  row.row_hash = auditHash(prevHash, row);
  run(`INSERT INTO audit_log (timestamp,user_id,user_name_en,user_name_ar,user_role,dept_id,patient_id,patient_name,patient_mrn,action_type,action_detail,ip_address,prev_hash,row_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.timestamp, row.user_id, row.user_name_en, row.user_name_ar, row.user_role, row.dept_id,
     row.patient_id, row.patient_name, row.patient_mrn, row.action_type, row.action_detail, row.ip_address, prevHash, row.row_hash]);
}
// Durable audit for PHI/security events — flushes to disk immediately so a crash
// can't drop the record.
function auditNow(actor, actionType, detail, req, patient) { audit(actor, actionType, detail, req, patient); persistNow(); }

// ---- RBAC (server-authoritative) -------------------------------------------
// Clinicians who may read clinical charts/meds. NOT it_admin/hospital_manager —
// they are oversight (demographics/beds/audit), not a care team, so they don't get
// chart/med access by default.
const CLINICAL = ['consultant', 'doctor', 'emergency_doctor', 'triage_nurse', 'senior_nurse', 'nurse'];
const CAN = {
  register_patient: ['emergency_doctor', 'triage_nurse', 'receptionist', 'it_admin'],
  // demographics (list + basic detail) — oversight + clinicians + receptionist
  view_patients:    ['it_admin', 'hospital_manager', ...CLINICAL, 'receptionist'],
  view_chart:       CLINICAL,                            // vitals/clinical chart (NOT receptionist)
  view_meds:        CLINICAL,                            // prescriptions
  record_vitals:    ['nurse', 'senior_nurse', 'triage_nurse', 'doctor', 'emergency_doctor'],
  view_beds:        ['it_admin', 'hospital_manager', 'consultant', 'doctor', 'senior_nurse', 'nurse', 'emergency_doctor', 'triage_nurse'],
  prescribe:        ['doctor', 'consultant', 'emergency_doctor'],
  order_labs:       ['doctor', 'consultant', 'emergency_doctor'],
  administer_meds:  ['nurse', 'senior_nurse', 'triage_nurse', 'doctor', 'emergency_doctor'],  // record a dose given/held (MAR) at the bedside
  dispense_meds:    ['pharmacist'],                      // pharmacy: dispense against an Rx and decrement central stock
  enter_lab_result: ['lab_technician'],                 // lab: post a result to an order
  discharge_patient:['doctor', 'consultant', 'emergency_doctor'],  // stop active meds + free the bed
  view_audit:       ['it_admin', 'hospital_manager'],   // full audit log is oversight-only (a consultant would see every dept's PHI access)
  manage_users:     ['it_admin'],                       // staff/department administration
};
// Roles a staff account may have (mirrors the client ROLES map; 'patient' is not a staff role).
const VALID_ROLES = new Set(['it_admin', 'hospital_manager', 'consultant', 'doctor', 'emergency_doctor', 'triage_nurse', 'senior_nurse', 'nurse', 'pharmacist', 'lab_technician', 'radiologist', 'receptionist', 'dietitian', 'social_worker']);
function can(role, action) { return (CAN[action] || []).includes(role); }
// usernames are case-insensitive: normalize on store AND lookup (schema UNIQUE is
// case-sensitive, so 'admin' and 'Admin' would otherwise both be insertable).
function normUser(s) { return String(s || '').trim().toLowerCase(); }
// Oversight roles see every patient; everyone else is scoped to their department's
// active admissions (minimum-necessary access).
const ALL_PATIENTS_ROLES = ['it_admin', 'hospital_manager'];
// patient row behind an admission (for attaching patient context to write audits)
function patientOfAdmission(aid) {
  return get('SELECT p.* FROM patients p JOIN admissions a ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [aid]) || null;
}
// Central admission-access gate: oversight sees all; everyone else only their
// department's admissions. Used by every endpoint that reads/writes an admission,
// so scoping can't be bypassed via beds/vitals/orders.
function canAccessAdmission(actor, role, admissionId) {
  if (ALL_PATIENTS_ROLES.includes(role)) return true;
  const a = get('SELECT dept_id FROM admissions WHERE admission_id = ?', [admissionId]);
  return !!(a && actor && a.dept_id === actor.department_id);
}
// Patient-level access gate (same minimum-necessary rule as /api/patients/:id):
// oversight sees everyone; everyone else only patients with an ACTIVE admission in
// their department. Used by the FHIR facade so it can never leak a chart the
// dedicated endpoints would have refused.
function canAccessPatient(actor, role, patientId) {
  if (ALL_PATIENTS_ROLES.includes(role)) return true;
  if (!actor) return false;
  return !!get("SELECT 1 AS ok FROM admissions WHERE patient_id = ? AND status = 'active' AND dept_id = ? LIMIT 1", [patientId, actor.department_id]);
}

// ---- FHIR R4 read facade ----------------------------------------------------
// parse the query string into {key:value} (FHIR search params live in the query)
function fhirParams(req) {
  const out = {};
  for (const kv of (String(req.url || '').split('?')[1] || '').split('&')) {
    if (!kv) continue;
    const i = kv.indexOf('=');
    const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
    const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}
// every FHIR read of PHI is audited with patient context (these are coarse,
// per-request external pulls — unlike the high-volume bridge reads — so we record
// each one rather than only the first per session).
function auditFhir(actor, req, resourceType, patientId, mode) {
  const patient = patientId ? get('SELECT * FROM patients WHERE patient_id = ?', [patientId]) : null;
  audit(actor, 'FHIR_READ', `FHIR ${resourceType} ${mode}${patientId ? ' for patient ' + patientId : ''}`, req, patient);
  persist();
}
function handleFhirRead(req, res, actor, role, resourceType, idPart) {
  if (!fhir.SUPPORTED.includes(resourceType)) return sendFhir(res, 404, fhir.operationOutcome('error', 'not-supported', `resource type "${resourceType}" is not supported`));
  // demographics need view_patients; clinical resources additionally need view_chart
  const needsChart = resourceType !== 'Patient';
  if (!can(role, 'view_patients') || (needsChart && !can(role, 'view_chart'))) {
    return sendFhir(res, 403, fhir.operationOutcome('error', 'forbidden', `insufficient permission to read ${resourceType}`));
  }
  const q = fhirParams(req);

  // ---- resolve the target patient ----
  let patientId = null;
  if (resourceType === 'Patient') {
    if (idPart) patientId = parseInt(idPart, 10) || null;
    else if (q.identifier) {                    // ?identifier=[system|]MRN
      const mrn = q.identifier.includes('|') ? q.identifier.split('|').pop() : q.identifier;
      const p = get('SELECT patient_id FROM patients WHERE mrn = ?', [mrn]);
      if (!p) return sendFhir(res, 200, fhir.searchBundle([]));   // search semantics: no match = empty searchset
      patientId = p.patient_id;
    }
    // else: scoped Patient list (handled below)
  } else {
    const pref = q.patient || '';
    patientId = parseInt(pref.includes('/') ? pref.split('/').pop() : pref, 10) || null;
    if (!patientId) return sendFhir(res, 400, fhir.operationOutcome('error', 'required', `${resourceType} search requires a "patient" parameter (e.g. ?patient=123)`));
  }

  // ---- Patient search with no id/identifier: department-scoped list ----
  if (resourceType === 'Patient' && patientId == null) {
    const rows = ALL_PATIENTS_ROLES.includes(role)
      ? all('SELECT * FROM patients ORDER BY patient_id DESC LIMIT 500')
      : all(`SELECT DISTINCT p.* FROM patients p JOIN admissions a ON a.patient_id = p.patient_id
             WHERE a.status='active' AND a.dept_id = ? ORDER BY p.patient_id DESC LIMIT 500`, [actor.department_id]);
    rows.forEach(r => { delete r.portal_password_hash; delete r.portal_salt; });
    auditFhir(actor, req, 'Patient', null, `search (scope ${ALL_PATIENTS_ROLES.includes(role) ? 'all' : 'dept ' + actor.department_id})`);
    return sendFhir(res, 200, fhir.searchBundle(rows.map(fhir.patientResource)));
  }

  // ---- single-patient target: must exist + be accessible ----
  if (!get('SELECT patient_id FROM patients WHERE patient_id = ?', [patientId])) {
    if (resourceType === 'Patient' && idPart) return sendFhir(res, 404, fhir.operationOutcome('error', 'not-found', `no Patient with id ${patientId}`));
    return sendFhir(res, 200, fhir.searchBundle([]));   // a search that matches nothing
  }
  if (!canAccessPatient(actor, role, patientId)) {
    auditNow(actor, 'FHIR_DENIED', `Blocked FHIR ${resourceType} read for out-of-department patient ${patientId}`, req);
    return sendFhir(res, 403, fhir.operationOutcome('error', 'forbidden', 'patient is not in your department'));
  }

  let payload;
  switch (resourceType) {
    case 'Patient': {
      const p = get('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
      delete p.portal_password_hash; delete p.portal_salt;
      payload = idPart ? fhir.patientResource(p) : fhir.searchBundle([fhir.patientResource(p)]);
      break;
    }
    case 'Condition':
      payload = fhir.searchBundle(all('SELECT * FROM patient_conditions WHERE patient_id = ? ORDER BY id', [patientId]).map(fhir.conditionResource));
      break;
    case 'AllergyIntolerance':
      payload = fhir.searchBundle(all('SELECT * FROM patient_allergies WHERE patient_id = ? ORDER BY id', [patientId]).map(fhir.allergyResource));
      break;
    case 'MedicationRequest':
      payload = fhir.searchBundle(all(`SELECT rx.* FROM prescriptions rx JOIN admissions a ON a.admission_id = rx.admission_id
                                       WHERE a.patient_id = ? ORDER BY rx.rx_id DESC`, [patientId]).map(r => fhir.medicationRequestResource(r, patientId)));
      break;
    case 'Observation': {
      const vitals = all(`SELECT v.* FROM vitals_log v JOIN admissions a ON a.admission_id = v.admission_id
                          WHERE a.patient_id = ? ORDER BY v.vitals_id DESC LIMIT 200`, [patientId]);
      const labs = all(`SELECT d.*, lo.admission_id AS admission_id, COALESCE(lo.resulted_at, lo.ordered_at) AS effective
                        FROM lab_result_details d JOIN lab_orders lo ON lo.order_id = d.order_id
                        JOIN admissions a ON a.admission_id = lo.admission_id
                        WHERE a.patient_id = ? ORDER BY d.detail_id DESC LIMIT 500`, [patientId]);
      const obs = [];
      vitals.forEach(v => { for (const o of fhir.vitalsToObservations(v, patientId)) obs.push(o); });
      labs.forEach(d => obs.push(fhir.labObservation(d, patientId)));
      payload = fhir.searchBundle(obs);
      break;
    }
    case 'Encounter':
      payload = fhir.searchBundle(all('SELECT * FROM admissions WHERE patient_id = ? ORDER BY admission_id DESC', [patientId]).map(fhir.encounterResource));
      break;
    default:
      return sendFhir(res, 404, fhir.operationOutcome('error', 'not-supported', 'unsupported resource'));
  }
  auditFhir(actor, req, resourceType, patientId, idPart ? 'read' : 'search');
  return sendFhir(res, 200, payload);
}

// ---- sessions ---------------------------------------------------------------
function sessionFromReq(req) {
  const cookie = req.headers.cookie || '';
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(cookie);
  if (!m) return null;
  const sid = decodeURIComponent(m[1]);
  const s = get('SELECT * FROM sessions WHERE session_id = ?', [sid]);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) { run('DELETE FROM sessions WHERE session_id = ?', [sid]); persist(); return null; }
  if (s.role !== 'patient') {
    const usr = get('SELECT * FROM users WHERE user_id = ?', [s.user_id]);
    if (!usr || !usr.is_active) { run('DELETE FROM sessions WHERE session_id = ?', [sid]); persist(); return null; }
    return { session: s, user: usr };
  }
  return { session: s, user: null };
}

// ---- HTTP plumbing ----------------------------------------------------------
// HSTS once we're on HTTPS: a LAN MITM must not be able to downgrade a
// workstation that has visited the real server even once.
function hstsHeaders() {
  return IS_HTTPS ? { 'Strict-Transport-Security': 'max-age=31536000' } : {};
}
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  // PHI must never be cached; nosniff hardens content handling.
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' }, hstsHeaders(), headers || {}));
  res.end(body);
}
// FHIR responses carry the fhir+json content type; everything else (no-store,
// nosniff, HSTS) is inherited from send().
function sendFhir(res, code, obj) { send(res, code, obj, { 'Content-Type': 'application/fhir+json; charset=utf-8' }); }
function readBody(req) {
  return new Promise((resolve) => {
    let data = '', tooLarge = false;
    req.on('data', c => { if (tooLarge) return; data += c; if (data.length > 1e6) { tooLarge = true; resolve({ __tooLarge: true }); } });   // stop accumulating; let the handler send 413 (don't destroy the socket)
    req.on('end', () => { if (tooLarge) return; try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => { if (!tooLarge) resolve({}); });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// Only the actual frontend assets are servable. Everything else — server/, test/,
// tools/, .git/, package.json, and CRUCIALLY server/data/{openward.sqlite,audit.key}
// — is denied. (Allowlist, not denylist, so nothing leaks by default.)
const STATIC_ALLOW = /^(?:index\.html|favicon\.ico)$|^(?:js|css|vendor)\/[\w./-]+$/;
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // Reject dot-segment traversal BEFORE path.join can normalize it away. The
  // handler decodes the URL in one pass (decodeURIComponent), so a client that
  // percent-encodes the slash — GET /js/..%2fserver/data/audit.key — arrives
  // here as "js/../server/data/audit.key": its '..' was NOT collapsed by the
  // client's URL layer (only a literal '/js/../...' is), yet path.join then
  // normalizes it back INSIDE ROOT, so the path.relative startsWith('..') guard
  // below passes and the allow-regex's [\w./-] class permits the dots. That
  // served the HMAC audit.key, the whole PHI sqlite, and server source to any
  // unauthenticated fetch(). Reject any empty/'.'/'..'  segment outright (same
  // approach serve.py already takes), so neither encoding nor normalization can
  // escape the allowlisted js/css/vendor roots.
  if (rel.split('/').some(s => s === '' || s === '.' || s === '..')) { res.writeHead(403); return res.end('forbidden'); }
  if (!STATIC_ALLOW.test(rel)) { res.writeHead(403); return res.end('forbidden'); }
  const full = path.join(ROOT, rel);
  const within = path.relative(ROOT, full);
  // Final guard: the resolved path must be index.html/favicon.ico or inside js/css/vendor.
  if (within.startsWith('..') || path.isAbsolute(within) || !/^(?:index\.html|favicon\.ico|(?:js|css|vendor)[\\/])/.test(within)) { res.writeHead(403); return res.end('forbidden'); }
  // Static assets hold no PHI — unlike /api responses (no-store), let browsers
  // cache them but ALWAYS revalidate (no-cache + ETag): a repeat load of the
  // ~1.2MB app becomes a handful of 304s, and code updates still land instantly.
  fs.stat(full, (serr, st) => {
    if (serr || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(full);
    // The ETag is PER-REPRESENTATION (RFC 9110): the gzip and identity bodies get
    // different validators, so even a Vary-ignoring intermediary can never serve
    // the cached gzip blob to an identity request on a 304 match.
    const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}${wantsGzip ? '-gz' : ''}"`;
    const headers = Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'ETag': etag, 'Vary': 'Accept-Encoding' }, hstsHeaders());
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      // gzip text + wasm (router.js 611KB→~140KB, sql-wasm.wasm roughly halves);
      // only on cache misses thanks to the ETag, so the sync gzip cost is rare.
      if (wantsGzip) {
        const gz = zlib.gzipSync(buf);
        res.writeHead(200, Object.assign({}, headers, { 'Content-Encoding': 'gzip', 'Content-Length': gz.length }));
        return res.end(gz);
      }
      res.writeHead(200, headers);
      res.end(buf);
    });
  });
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm']);
function genMRN(patientId) { return `HIS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(patientId).padStart(5, '0')}`; }

// ---- API routes -------------------------------------------------------------
async function handleApi(req, res, pathname) {
  const auth = sessionFromReq(req);
  const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
  if (body && body.__tooLarge) return send(res, 413, { error: 'too_large', message: 'request body exceeds 1 MB' });

  // ---- public: health / server-mode probe (lets the browser detect it's served
  // by the LAN server vs opened standalone) ----
  if (pathname === '/api/health' && req.method === 'GET') {
    const hasUsers = !!get('SELECT user_id FROM users LIMIT 1');
    return send(res, 200, { ok: true, server: 'openward', https: IS_HTTPS, demo: DEMO, needsSetup: !hasUsers });
  }

  // ---- public: first-run admin setup. Requires the one-time TOKEN printed to the
  // hospital-PC console (so a reverse proxy making every request look like
  // loopback can't let a LAN user claim it_admin) AND a loopback connection. ----
  if (pathname === '/api/setup' && req.method === 'POST') {
    if (get('SELECT user_id FROM users LIMIT 1')) return send(res, 409, { error: 'already_initialized', message: 'Setup is closed — an account already exists.' });
    if (!isLoopback(req)) return send(res, 403, { error: 'forbidden', message: 'First-run setup must be done on the hospital PC (loopback).' });
    if (!setupToken || String(body.token || '') !== setupToken) return send(res, 403, { error: 'bad_token', message: 'Provide the one-time setup token printed to the server console.' });
    const username = normUser(body.username);
    const password = String(body.password || '');
    if (!username || password.length < 8) return send(res, 400, { error: 'validation', message: 'username and a password of at least 8 chars are required' });
    setupToken = null;   // CONSUME synchronously, immediately before the await — closes the concurrent-setup race (a typo'd password above doesn't burn it)
    const salt = u.generateSalt();
    run('INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
      [username, await u.hashPassword(password, salt), salt, String(body.full_name_ar || username), String(body.full_name_en || username), 'it_admin', null, new Date().toISOString()]);
    audit(null, 'FIRST_RUN_SETUP', `Initial it_admin account "${username}" created`, req);
    persistNow();
    return send(res, 201, { ok: true, username });
  }

  // ---- public: login ----
  if (pathname === '/api/login' && req.method === 'POST') {
    const username = normUser(body.username);
    const password = String(body.password || '');
    const acct = username;
    // Per-IP throttle first (see ipLoginFails above) — protects ALL accounts
    // from a single spraying host before the per-account counters even engage.
    const ip = clientIp(req);
    if (!isLoopback(req) && ipThrottled(ip)) {
      audit(null, 'LOGIN_THROTTLED', `Per-IP login throttle engaged for ${ip}`, req);
      persist();
      return send(res, 429, { error: 'locked', message: 'Too many attempts from this device; try again later.' });
    }
    // DB-backed lockout (5 fails / 15 min)
    const since = Date.now() - 15 * 60 * 1000;
    const fails = get('SELECT COUNT(*) AS c FROM login_attempts WHERE account = ? AND attempt_ms > ?', [acct, since]);
    if (fails && fails.c >= 5) return send(res, 429, { error: 'locked', message: 'Too many attempts; try again later.' });
    const user = get('SELECT * FROM users WHERE username = ?', [username]);
    const okUser = user && user.is_active;
    const v = okUser ? await u.verifyPassword(password, user.salt, user.password_hash) : { ok: false };
    if (!okUser || !v.ok) {
      run('INSERT INTO login_attempts (account, attempt_ms) VALUES (?, ?)', [acct, Date.now()]);
      recordIpFail(ip);
      auditNow(null, 'LOGIN_FAILED', `Failed login for "${username}"`, req);   // durable security event
      return send(res, 401, { error: 'bad_credentials', message: 'Invalid username or password.' });
    }
    if (v.needsUpgrade) {
      try {
        run('UPDATE users SET password_hash = ? WHERE user_id = ?', [await u.hashPassword(password, user.salt), user.user_id]);
        audit(user, 'PASSWORD_SCHEME_UPGRADED', `Stored hash for "${username}" upgraded to PBKDF2 on login`, req);
      } catch (e) {}
    }
    run('DELETE FROM login_attempts WHERE account = ?', [acct]);
    const sid = crypto.randomUUID();
    const now = new Date();
    const exp = new Date(now.getTime() + 8 * 3600 * 1000);
    run('INSERT INTO sessions (session_id, user_id, role, dept_id, login_time, last_active, expires_at) VALUES (?,?,?,?,?,?,?)',
      [sid, user.user_id, user.role, user.department_id || null, now.toISOString(), now.toISOString(), exp.toISOString()]);
    audit(user, 'LOGIN', `${user.full_name_en} logged in`, req);
    persistNow();
    const secure = IS_HTTPS || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
    return send(res, 200, { user: { user_id: user.user_id, full_name_en: user.full_name_en, full_name_ar: user.full_name_ar, role: user.role, department_id: user.department_id } },
      { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}` });
  }

  // everything below requires a session
  if (!auth) return send(res, 401, { error: 'unauthenticated' });
  const role = auth.session.role;
  const actor = auth.user;

  if (pathname === '/api/logout' && req.method === 'POST') {
    run('DELETE FROM sessions WHERE session_id = ?', [auth.session.session_id]);
    auditNow(actor, 'LOGOUT', `${actor ? actor.full_name_en : 'patient'} logged out`, req);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (pathname === '/api/me' && req.method === 'GET') {
    return send(res, 200, { user: actor ? { user_id: actor.user_id, full_name_en: actor.full_name_en, full_name_ar: actor.full_name_ar, role: actor.role, department_id: actor.department_id } : { role: 'patient' } });
  }

  // Self-service password change. Without this the only rotation path is the
  // admin reset — meaning the IT admin CHOSE (and knows) every staff password,
  // which breaks individual accountability in the audit trail. Requires the
  // CURRENT password (a walk-up at an unlocked workstation can't silently take
  // over the account) and kills the user's OTHER sessions so a stolen session
  // doesn't outlive the rotation.
  if (pathname === '/api/me/password' && req.method === 'POST') {
    if (!actor) return send(res, 403, { error: 'forbidden', message: 'staff session required' });
    const current = String(body.current_password || '');
    const next = String(body.new_password || '');
    if (next.length < 8) return send(res, 400, { error: 'validation', message: 'new password must be at least 8 characters' });
    const v = await u.verifyPassword(current, actor.salt, actor.password_hash);
    if (!v.ok) {
      audit(actor, 'PASSWORD_CHANGE_FAILED', 'Self-service password change refused: current password wrong', req);
      persist();
      return send(res, 403, { error: 'bad_credentials', message: 'current password is incorrect' });
    }
    const salt = u.generateSalt();
    run('UPDATE users SET password_hash = ?, salt = ? WHERE user_id = ?', [await u.hashPassword(next, salt), salt, actor.user_id]);
    run('DELETE FROM sessions WHERE user_id = ? AND session_id <> ?', [actor.user_id, auth.session.session_id]);
    audit(actor, 'PASSWORD_CHANGED', `${actor.full_name_en} changed their own password (other sessions revoked)`, req);
    persistNow();
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/patients' && req.method === 'GET') {
    if (!can(role, 'view_patients')) return send(res, 403, { error: 'forbidden' });
    const patients = ALL_PATIENTS_ROLES.includes(role)
      ? all('SELECT patient_id, mrn, full_name_ar, full_name_en, date_of_birth, gender, blood_type FROM patients ORDER BY patient_id DESC LIMIT 500')
      : all(`SELECT DISTINCT p.patient_id, p.mrn, p.full_name_ar, p.full_name_en, p.date_of_birth, p.gender, p.blood_type
             FROM patients p JOIN admissions a ON a.patient_id = p.patient_id
             WHERE a.status='active' AND a.dept_id = ? ORDER BY p.patient_id DESC LIMIT 500`, [actor.department_id]);
    const scope = ALL_PATIENTS_ROLES.includes(role) ? 'all-departments' : `dept ${actor.department_id}`;
    audit(actor, 'PATIENT_LIST_VIEWED', `Viewed patient list — scope: ${scope}; ids: [${patients.map(p => p.patient_id).join(',') || 'none'}]`, req);
    persistNow();   // durable: don't lose a PHI-access record on a crash
    return send(res, 200, { patients });
  }

  if (pathname === '/api/patients' && req.method === 'POST') {
    if (!can(role, 'register_patient')) return send(res, 403, { error: 'forbidden' });
    const nameAr = String(body.full_name_ar || '').trim();
    if (!nameAr) return send(res, 400, { error: 'validation', message: 'full_name_ar is required' });
    const deptId = parseInt(body.dept_id, 10);
    if (!deptId || !get('SELECT dept_id FROM departments WHERE dept_id = ?', [deptId])) return send(res, 400, { error: 'validation', message: 'valid dept_id is required' });
    const bed = body.bed_number ? String(body.bed_number).trim() : null;
    try {
      run('BEGIN IMMEDIATE');
      if (bed) {
        const clash = get(`SELECT a.admission_id FROM admissions a WHERE a.bed_number = ? AND a.status = 'active' AND a.dept_id = ?`, [bed, deptId]);
        if (clash) { run('ROLLBACK'); return send(res, 409, { error: 'bed_taken', message: `Bed ${bed} is already occupied in that department.` }); }
      }
      run(`INSERT INTO patients (mrn, full_name_ar, full_name_en, date_of_birth, gender, blood_type, registered_by, registered_at)
           VALUES ('TEMP', ?, ?, ?, ?, ?, ?, ?)`,
        [nameAr, body.full_name_en || null, body.date_of_birth || null, body.gender || null, body.blood_type || 'unknown', actor.user_id, new Date().toISOString()]);
      const pid = lastId();
      const mrn = genMRN(pid);
      run('UPDATE patients SET mrn = ? WHERE patient_id = ?', [mrn, pid]);
      run(`INSERT INTO admissions (patient_id, dept_id, bed_number, admitted_by, admitted_at, status, chief_complaint)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [pid, deptId, bed, actor.user_id, new Date().toISOString(), body.chief_complaint || null]);
      const patient = get('SELECT * FROM patients WHERE patient_id = ?', [pid]);
      audit(actor, 'PATIENT_REGISTERED', `Registered ${nameAr} (MRN ${mrn})`, req, patient);   // audited INSIDE the tx
      run('COMMIT');
      bumpDbVersion();
      persistNow();
      return send(res, 201, { patient_id: pid, mrn });
    } catch (e) {
      try { run('ROLLBACK'); } catch (_) {}
      return send(res, 500, { error: 'server', message: e.message });
    }
  }

  if (pathname === '/api/beds' && req.method === 'GET') {
    if (!can(role, 'view_beds')) return send(res, 403, { error: 'forbidden' });
    const cols = `a.admission_id, a.bed_number, a.dept_id, p.mrn, p.full_name_ar, p.full_name_en`;
    const admissions = ALL_PATIENTS_ROLES.includes(role)
      ? all(`SELECT ${cols} FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status='active' ORDER BY a.dept_id, a.bed_number`)
      : all(`SELECT ${cols} FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status='active' AND a.dept_id = ? ORDER BY a.bed_number`, [actor.department_id]);
    return send(res, 200, { admissions });
  }

  if (pathname === '/api/vitals' && req.method === 'POST') {
    if (!can(role, 'record_vitals')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt(body.admission_id, 10);
    if (!aid || !get('SELECT admission_id FROM admissions WHERE admission_id = ?', [aid])) return send(res, 400, { error: 'validation', message: 'valid admission_id required' });
    if (!canAccessAdmission(actor, role, aid)) return send(res, 403, { error: 'forbidden', message: 'Admission is not in your department.' });
    // server-side plausibility (the API is authoritative — don't trust the client)
    const RANGES = { bp_systolic: [40, 300], bp_diastolic: [20, 200], heart_rate: [10, 300], temperature: [25, 45], o2_sat: [30, 100], resp_rate: [3, 80] };
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      if (body[k] != null && body[k] !== '') { const n = Number(body[k]); if (!Number.isFinite(n) || n < lo || n > hi) return send(res, 400, { error: 'validation', message: `${k} out of plausible range (${lo}-${hi})` }); }
    }
    let vid;
    withTx(() => {
      run(`INSERT INTO vitals_log (admission_id, recorded_by, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, o2_sat, resp_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aid, actor.user_id, new Date().toISOString(), body.bp_systolic || null, body.bp_diastolic || null, body.heart_rate || null, body.temperature || null, body.o2_sat || null, body.resp_rate || null]);
      vid = lastId();   // before audit()
      audit(actor, 'VITALS_RECORDED', `Vitals for admission ${aid}`, req, patientOfAdmission(aid));
    });
    bumpDbVersion();
    persistNow();
    return send(res, 201, { vitals_id: vid });
  }

  // Patient detail: record + active admission + recent vitals.
  const pm = pathname.match(/^\/api\/patients\/(\d+)$/);
  if (pm && req.method === 'GET') {
    if (!can(role, 'view_patients')) return send(res, 403, { error: 'forbidden' });
    const pid = parseInt(pm[1], 10);
    const patient = get('SELECT * FROM patients WHERE patient_id = ?', [pid]);
    if (!patient) return send(res, 404, { error: 'not_found' });
    const admission = get("SELECT * FROM admissions WHERE patient_id = ? AND status = 'active' ORDER BY admission_id DESC LIMIT 1", [pid]);
    // dept-scope: non-oversight roles can only open a chart in their department
    if (!ALL_PATIENTS_ROLES.includes(role) && !(admission && admission.dept_id === actor.department_id)) {
      auditNow(actor, 'PATIENT_VIEW_DENIED', `Blocked out-of-department chart access for patient ${pid}`, req);
      return send(res, 403, { error: 'forbidden', message: 'Patient is not in your department.' });
    }
    delete patient.portal_password_hash; delete patient.portal_salt;   // never ship secrets
    // Clinical data (vitals, clinical admission fields, and clinical patient fields
    // like weight_kg/egfr) only for view_chart roles. Non-clinical roles (e.g.
    // receptionist, it_admin oversight) get demographics only.
    const clinical = can(role, 'view_chart');
    const DEMOG = ['patient_id', 'mrn', 'national_id', 'full_name_ar', 'full_name_en', 'date_of_birth', 'gender', 'blood_type', 'phone', 'emergency_contact', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation', 'registered_at'];
    const safePatient = clinical ? patient : Object.fromEntries(DEMOG.map(k => [k, patient[k]]));
    const safeAdmission = !admission ? null : (clinical ? admission
      : { admission_id: admission.admission_id, dept_id: admission.dept_id, bed_number: admission.bed_number, admitted_at: admission.admitted_at, status: admission.status });
    const vitals = (admission && clinical) ? all('SELECT * FROM vitals_log WHERE admission_id = ? ORDER BY vitals_id DESC LIMIT 10', [admission.admission_id]) : [];
    audit(actor, 'PATIENT_VIEWED', 'Opened patient chart', req, patient);   // log every PHI read
    persistNow();   // durable: don't lose a PHI-access record on a crash
    return send(res, 200, { patient: safePatient, admission: safeAdmission, vitals });
  }

  if (pathname === '/api/prescriptions' && req.method === 'GET') {
    if (!can(role, 'view_meds')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt((req.url.split('?')[1] || '').match(/admission_id=(\d+)/)?.[1], 10);
    if (!aid) return send(res, 400, { error: 'validation', message: 'admission_id query param required' });
    if (!canAccessAdmission(actor, role, aid)) return send(res, 403, { error: 'forbidden', message: 'Admission is not in your department.' });
    return send(res, 200, { prescriptions: all("SELECT rx_id, drug_id, drug_name, dose, route, frequency, status, prescribed_at FROM prescriptions WHERE admission_id = ? ORDER BY rx_id DESC", [aid]) });
  }

  if (pathname === '/api/prescriptions' && req.method === 'POST') {
    if (!can(role, 'prescribe')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt(body.admission_id, 10);
    const drug = get('SELECT * FROM drugs WHERE drug_id = ?', [parseInt(body.drug_id, 10)]);
    if (!aid || !get('SELECT admission_id FROM admissions WHERE admission_id = ?', [aid])) return send(res, 400, { error: 'validation', message: 'valid admission_id required' });
    if (!canAccessAdmission(actor, role, aid)) return send(res, 403, { error: 'forbidden', message: 'Admission is not in your department.' });
    if (!drug) return send(res, 400, { error: 'validation', message: 'valid drug_id required (formulary only — no free-text drug)' });
    if (!body.dose || !body.route || !body.frequency) return send(res, 400, { error: 'validation', message: 'dose, route, frequency required' });
    // server-side medication safety (authoritative; not just the browser). Uses
    // the SHARED class-aware matcher (js/allergy-check.js) — plain substring
    // matching let Amoxicillin through a documented "Penicillin" allergy here
    // while the browser warned, and the server is supposed to be the layer that
    // cannot be bypassed.
    const ptRx = patientOfAdmission(aid);
    const allergyHit = allergyCheck.checkDrugAllergy(drug.name_generic,
      all('SELECT allergen FROM patient_allergies WHERE patient_id = ?', [ptRx.patient_id]));
    if (allergyHit && body.override !== true) {
      const why = allergyHit._cross
        ? `Possible cross-reactivity (${allergyHit._cross_note}) with the patient's recorded allergy to "${allergyHit.allergen}".`
        : `Patient has a recorded allergy to "${allergyHit.allergen}".`;
      return send(res, 409, { error: 'allergy_conflict', message: `${why} Re-send with override:true to proceed.` });
    }
    if (get("SELECT rx_id FROM prescriptions WHERE admission_id = ? AND drug_id = ? AND status = 'active'", [aid, drug.drug_id]))
      return send(res, 409, { error: 'duplicate_active', message: 'An active prescription for this drug already exists for this admission.' });
    const now = new Date().toISOString();
    let rxId;
    withTx(() => {
      run(`INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [aid, actor.user_id, drug.drug_id, drug.name_generic, String(body.dose), String(body.route), String(body.frequency), now.slice(0, 10), now]);
      rxId = lastId();   // before audit()
      const det = body.override === true && allergyHit ? ` [allergy override: ${allergyHit.allergen}]` : '';
      audit(actor, allergyHit && body.override === true ? 'PRESCRIPTION_ALLERGY_OVERRIDE' : 'PRESCRIPTION_ISSUED', `Prescribed ${drug.name_generic} ${body.dose} ${body.route} ${body.frequency}${det}`, req, ptRx);
    });
    bumpDbVersion();
    persistNow();
    return send(res, 201, { rx_id: rxId });
  }

  if (pathname === '/api/lab-orders' && req.method === 'POST') {
    if (!can(role, 'order_labs')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt(body.admission_id, 10);
    const test = String(body.test_name || '').trim();
    if (!aid || !get('SELECT admission_id FROM admissions WHERE admission_id = ?', [aid])) return send(res, 400, { error: 'validation', message: 'valid admission_id required' });
    if (!canAccessAdmission(actor, role, aid)) return send(res, 403, { error: 'forbidden', message: 'Admission is not in your department.' });
    if (!test) return send(res, 400, { error: 'validation', message: 'test_name required' });
    const priority = ['routine', 'urgent', 'stat'].includes(body.priority) ? body.priority : 'routine';
    let orderId;
    withTx(() => {
      run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (?, ?, ?, ?, 'ordered', ?)`,
        [aid, actor.user_id, test, priority, new Date().toISOString()]);
      orderId = lastId();   // before audit()
      audit(actor, 'LAB_ORDERED', `Ordered ${test} (${priority})`, req, patientOfAdmission(aid));
    });
    bumpDbVersion();
    persistNow();
    return send(res, 201, { order_id: orderId });
  }

  // ---- MAR: a bedside nurse/doctor records a dose given or held against an Rx ----
  const am = pathname.match(/^\/api\/prescriptions\/(\d+)\/administer$/);
  if (am && req.method === 'POST') {
    if (!can(role, 'administer_meds')) return send(res, 403, { error: 'forbidden' });
    const rx = get('SELECT * FROM prescriptions WHERE rx_id = ?', [parseInt(am[1], 10)]);
    if (!rx) return send(res, 404, { error: 'not_found', message: 'prescription not found' });
    if (!canAccessAdmission(actor, role, rx.admission_id)) return send(res, 403, { error: 'forbidden', message: 'Admission is not in your department.' });
    if (rx.status !== 'active') return send(res, 409, { error: 'not_active', message: 'prescription is not active' });
    const status = body.status === 'held' ? 'held' : 'given';
    if (status === 'held' && !String(body.hold_reason || '').trim()) return send(res, 400, { error: 'validation', message: 'hold_reason required when holding a dose' });
    let marId;
    withTx(() => {
      run(`INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route, administered_at, administered_by, status, hold_reason, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rx.rx_id, rx.admission_id, rx.drug_name, rx.dose, rx.route, new Date().toISOString(), actor.user_id, status, status === 'held' ? String(body.hold_reason).trim() : null, body.notes ? String(body.notes) : null]);
      marId = lastId();   // before audit()
      audit(actor, status === 'held' ? 'MED_HELD' : 'MED_ADMINISTERED', `${status === 'held' ? 'Held' : 'Administered'} ${rx.drug_name} ${rx.dose} ${rx.route} (rx ${rx.rx_id})`, req, patientOfAdmission(rx.admission_id));
    });
    bumpDbVersion();
    persistNow();
    return send(res, 201, { mar_id: marId, status });
  }

  // ---- Pharmacy: dispense against an Rx, decrementing central stock atomically.
  //      Pharmacy is a hospital-wide service, so it is NOT department-scoped — the
  //      RBAC role (pharmacist) is the gate, not the patient's ward. ----
  const dm = pathname.match(/^\/api\/prescriptions\/(\d+)\/dispense$/);
  if (dm && req.method === 'POST') {
    if (!can(role, 'dispense_meds')) return send(res, 403, { error: 'forbidden' });
    const rx = get('SELECT * FROM prescriptions WHERE rx_id = ?', [parseInt(dm[1], 10)]);
    if (!rx) return send(res, 404, { error: 'not_found', message: 'prescription not found' });
    if (rx.status !== 'active') return send(res, 409, { error: 'not_active', message: 'prescription is not active' });
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) return send(res, 400, { error: 'validation', message: 'qty must be a positive number' });
    const drug = get('SELECT * FROM drugs WHERE drug_id = ?', [rx.drug_id]);
    if (!drug) return send(res, 400, { error: 'validation', message: 'drug no longer in formulary' });
    const pt = patientOfAdmission(rx.admission_id);
    let dispenseId;
    try {
      dispenseId = withTx(() => {
        const cur = Number(get('SELECT stock_qty FROM drugs WHERE drug_id = ?', [rx.drug_id]).stock_qty) || 0;
        if (cur < qty) { const e = new Error('insufficient_stock'); e.code = 'insufficient_stock'; throw e; }   // rolls back the tx
        run('UPDATE drugs SET stock_qty = stock_qty - ? WHERE drug_id = ?', [qty, rx.drug_id]);
        run('INSERT INTO dispensing_log (prescription_id, drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at, notes) VALUES (?,?,?,?,?,?,?)',
          [rx.rx_id, rx.drug_id, pt.patient_id, qty, actor.user_id, new Date().toISOString(), body.notes ? String(body.notes) : null]);
        const id = lastId();
        audit(actor, 'MED_DISPENSED', `Dispensed ${qty} ${drug.unit} of ${drug.name_generic} (rx ${rx.rx_id})`, req, pt);
        return id;
      });
    } catch (e) {
      if (e.code === 'insufficient_stock') return send(res, 409, { error: 'insufficient_stock', message: 'Not enough stock to dispense.' });
      throw e;
    }
    bumpDbVersion();
    persistNow();
    return send(res, 201, { dispense_id: dispenseId, remaining_stock: get('SELECT stock_qty FROM drugs WHERE drug_id = ?', [rx.drug_id]).stock_qty });
  }

  // ---- Lab: a technician posts a result to an order (hospital-wide service) ----
  const lr = pathname.match(/^\/api\/lab-orders\/(\d+)\/result$/);
  if (lr && req.method === 'POST') {
    if (!can(role, 'enter_lab_result')) return send(res, 403, { error: 'forbidden' });
    const order = get('SELECT * FROM lab_orders WHERE order_id = ?', [parseInt(lr[1], 10)]);
    if (!order) return send(res, 404, { error: 'not_found', message: 'lab order not found' });
    if (order.status === 'resulted') return send(res, 409, { error: 'already_resulted', message: 'order already has a result' });
    const value = String(body.result_value || '').trim();
    if (!value) return send(res, 400, { error: 'validation', message: 'result_value required' });
    const critical = body.is_critical === true ? 1 : 0;
    withTx(() => {
      run(`UPDATE lab_orders SET status='resulted', result_value=?, result_unit=?, result_flag=?, result_notes=?, is_critical=?, resulted_by=?, resulted_at=? WHERE order_id=?`,
        [value, body.result_unit ? String(body.result_unit) : null, body.result_flag ? String(body.result_flag) : null, body.result_notes ? String(body.result_notes) : null, critical, actor.user_id, new Date().toISOString(), order.order_id]);
      audit(actor, critical ? 'LAB_RESULT_CRITICAL' : 'LAB_RESULTED', `Resulted ${order.test_name}: ${value}${body.result_unit ? ' ' + body.result_unit : ''}${critical ? ' [CRITICAL]' : ''}`, req, patientOfAdmission(order.admission_id));
    });
    bumpDbVersion();
    persistNow();
    return send(res, 200, { ok: true, critical: !!critical });
  }

  // ---- Discharge: stop active meds (reconciliation) + free the bed, atomically ----
  const dg = pathname.match(/^\/api\/admissions\/(\d+)\/discharge$/);
  if (dg && req.method === 'POST') {
    if (!can(role, 'discharge_patient')) return send(res, 403, { error: 'forbidden' });
    const adm = get('SELECT * FROM admissions WHERE admission_id = ?', [parseInt(dg[1], 10)]);
    if (!adm) return send(res, 404, { error: 'not_found', message: 'admission not found' });
    if (!canAccessAdmission(actor, role, adm.admission_id)) return send(res, 403, { error: 'forbidden', message: 'Admission is not in your department.' });
    if (adm.status !== 'active') return send(res, 409, { error: 'not_active', message: 'admission is not active' });
    const summary = String(body.summary || '').trim();
    if (!summary) return send(res, 400, { error: 'validation', message: 'a discharge summary is required (medication reconciliation)' });
    let stopped = 0;
    withTx(() => {
      const active = all("SELECT rx_id FROM prescriptions WHERE admission_id = ? AND status = 'active'", [adm.admission_id]);
      stopped = active.length;
      run("UPDATE prescriptions SET status = 'discontinued' WHERE admission_id = ? AND status = 'active'", [adm.admission_id]);
      run("UPDATE admissions SET status = 'discharged', discharged_at = ?, disposition_plan = ? WHERE admission_id = ?", [new Date().toISOString(), summary, adm.admission_id]);
      audit(actor, 'PATIENT_DISCHARGED', `Discharged admission ${adm.admission_id}; ${stopped} active med(s) reconciled/stopped`, req, patientOfAdmission(adm.admission_id));
    });
    bumpDbVersion();
    persistNow();
    return send(res, 200, { ok: true, medications_stopped: stopped });
  }

  if (pathname === '/api/audit' && req.method === 'GET') {
    if (!can(role, 'view_audit')) return send(res, 403, { error: 'forbidden' });
    const entries = all('SELECT log_id, timestamp, user_name_en, user_role, action_type, action_detail, patient_mrn, ip_address FROM audit_log ORDER BY log_id DESC LIMIT 200');
    auditNow(actor, 'AUDIT_LOG_VIEWED', `Read audit log (${entries.length} rows)`, req);   // reading the audit log is itself audited
    return send(res, 200, { entries });
  }

  // Oversight-only chain verification: the HMAC chain (key OUTSIDE the DB) is only
  // tamper-EVIDENT if someone can actually check it. Walks every row in log_id
  // order, recomputes the HMAC server-side (the key never leaves the box), and
  // reports the first break. audit_log is INSERT-only by design, so a log_id gap
  // or an AUTOINCREMENT sequence ahead of the last row always means deletion.
  if (pathname === '/api/audit/verify' && req.method === 'GET') {
    if (!can(role, 'view_audit')) return send(res, 403, { error: 'forbidden' });
    const rows = all('SELECT * FROM audit_log ORDER BY log_id');
    let result = { valid: true, rows: rows.length };
    let prevHash = null, prevId = 0;
    for (const r of rows) {
      if (r.log_id !== prevId + 1) { result = { valid: false, rows: rows.length, broken_at: r.log_id, reason: 'log_id gap — row(s) deleted' }; break; }
      if ((r.prev_hash || null) !== prevHash) { result = { valid: false, rows: rows.length, broken_at: r.log_id, reason: 'prev_hash link mismatch' }; break; }
      if (r.row_hash !== auditHash(prevHash, r)) { result = { valid: false, rows: rows.length, broken_at: r.log_id, reason: 'row_hash mismatch — row altered or forged' }; break; }
      prevHash = r.row_hash; prevId = r.log_id;
    }
    if (result.valid) {   // trailing truncation: AUTOINCREMENT seq survives DELETE
      const seq = get("SELECT seq FROM sqlite_sequence WHERE name = 'audit_log'");
      const lastSeen = rows.length ? rows[rows.length - 1].log_id : 0;
      if (seq && seq.seq > lastSeen) result = { valid: false, rows: rows.length, broken_at: lastSeen, reason: 'tail truncated — sequence is ahead of the last row' };
    }
    auditNow(actor, 'AUDIT_VERIFY_RUN', `Audit chain verify over ${result.rows} rows: ${result.valid ? 'VALID' : `BROKEN at log_id ${result.broken_at} (${result.reason})`}`, req);
    return send(res, 200, result);
  }

  // ---- Departments (read: any staff, for dropdowns; create: it_admin) ----
  if (pathname === '/api/departments' && req.method === 'GET') {
    return send(res, 200, { departments: all('SELECT dept_id, name_ar, name_en, type FROM departments ORDER BY dept_id') });
  }
  if (pathname === '/api/departments' && req.method === 'POST') {
    if (!can(role, 'manage_users')) return send(res, 403, { error: 'forbidden' });
    const en = String(body.name_en || '').trim(), ar = String(body.name_ar || '').trim(), type = String(body.type || 'ward').trim();
    if (!en || !ar) return send(res, 400, { error: 'validation', message: 'name_en and name_ar required' });
    run('INSERT INTO departments (name_ar, name_en, type) VALUES (?, ?, ?)', [ar, en, type]);
    const newDeptId = lastId();   // before audit()
    bumpDbVersion();
    auditNow(actor, 'DEPT_CREATED', `Created department ${en}`, req);
    return send(res, 201, { dept_id: newDeptId });
  }

  // ---- Staff / user administration (it_admin only) ----
  if (pathname === '/api/users' && req.method === 'GET') {
    if (!can(role, 'manage_users')) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, { users: all('SELECT user_id, username, full_name_en, full_name_ar, role, department_id, is_active, created_at FROM users ORDER BY user_id') });
  }
  if (pathname === '/api/users' && req.method === 'POST') {
    if (!can(role, 'manage_users')) return send(res, 403, { error: 'forbidden' });
    const username = normUser(body.username);
    const password = String(body.password || '');
    const urole = String(body.role || '');
    if (!username || password.length < 8) return send(res, 400, { error: 'validation', message: 'username and a password of at least 8 chars are required' });
    if (!VALID_ROLES.has(urole)) return send(res, 400, { error: 'validation', message: 'invalid role' });
    if (get('SELECT user_id FROM users WHERE username = ?', [username])) return send(res, 409, { error: 'username_taken' });
    const dept = body.department_id ? parseInt(body.department_id, 10) : null;
    if (dept && !get('SELECT dept_id FROM departments WHERE dept_id = ?', [dept])) return send(res, 400, { error: 'validation', message: 'invalid department_id' });
    const salt = u.generateSalt();
    run('INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_by, created_at) VALUES (?,?,?,?,?,?,?,1,?,?)',
      [username, await u.hashPassword(password, salt), salt, String(body.full_name_ar || username), String(body.full_name_en || username), urole, dept, actor.user_id, new Date().toISOString()]);
    const newUserId = lastId();   // capture BEFORE audit() inserts its own row
    bumpDbVersion();
    auditNow(actor, 'USER_CREATED', `Created ${urole} "${username}"`, req);
    return send(res, 201, { user_id: newUserId });
  }

  const um = pathname.match(/^\/api\/users\/(\d+)\/(disable|enable|reset-password)$/);
  if (um && req.method === 'POST') {
    if (!can(role, 'manage_users')) return send(res, 403, { error: 'forbidden' });
    const uid = parseInt(um[1], 10);
    const target = get('SELECT * FROM users WHERE user_id = ?', [uid]);
    if (!target) return send(res, 404, { error: 'not_found' });
    if (um[2] === 'disable') {
      if (uid === actor.user_id) return send(res, 400, { error: 'validation', message: 'cannot disable your own account' });
      run('UPDATE users SET is_active = 0 WHERE user_id = ?', [uid]);
      run("DELETE FROM sessions WHERE user_id = ? AND role != 'patient'", [uid]);   // kill live sessions
      auditNow(actor, 'USER_DISABLED', `Disabled "${target.username}"`, req);
    } else if (um[2] === 'enable') {
      run('UPDATE users SET is_active = 1 WHERE user_id = ?', [uid]);
      auditNow(actor, 'USER_ENABLED', `Enabled "${target.username}"`, req);
    } else { // reset-password
      const password = String(body.password || '');
      if (password.length < 8) return send(res, 400, { error: 'validation', message: 'password of at least 8 chars required' });
      const salt = u.generateSalt();
      run('UPDATE users SET password_hash = ?, salt = ? WHERE user_id = ?', [await u.hashPassword(password, salt), salt, uid]);
      run("DELETE FROM sessions WHERE user_id = ? AND role != 'patient'", [uid]);   // force re-login
      auditNow(actor, 'USER_PASSWORD_RESET', `Reset password for "${target.username}"`, req);
    }
    bumpDbVersion();
    return send(res, 200, { ok: true });
  }

  // ---- Shared-DB bridge (server-authoritative SQL) ----------------------------
  // Lets the in-browser UI run its existing dbGet/dbRun/dbAll against the ONE
  // central SQLite file instead of a per-browser IndexedDB copy, so every
  // workstation reads/writes the SAME database in real time ("host on the PC,
  // staff log in and edit it like a normal local app"). The browser stays the
  // UI; this process stays the single owner of the file.
  //
  // SECURITY: STAFF session required (patient-portal sessions are refused — a
  // patient must never get raw DB access). One statement per call (no stacked
  // SQL), ATTACH/DETACH blocked (can't reach other files), and credential
  // columns are stripped from every read so password material never crosses the
  // wire (staff auth happens server-side via /api/login, which never returns a
  // hash). This is the same trust level as the old browser-only app — any valid
  // staff login could already edit the whole local DB — but now centralized.
  const SECRET_COLS = ['password_hash', 'salt', 'portal_password_hash', 'portal_salt'];
  function bridgeGuard(sql) {
    if (typeof sql !== 'string' || !sql.trim()) return 'sql (string) required';
    if (/;\s*\S/.test(sql)) return 'only a single statement per call is allowed';
    if (/\b(attach|detach)\s/i.test(sql)) return 'ATTACH/DETACH is not allowed';
    // Transaction control on the ONE shared connection would entangle every
    // client: an open BEGIN sweeps other workstations' writes into the caller's
    // transaction (a ROLLBACK then destroys them), and a client that crashes
    // mid-transaction wedges the connection for the whole hospital.
    if (/^\s*(begin|commit|end|rollback|savepoint|release)\b/i.test(sql)) return 'transaction control is not allowed over the bridge — each statement commits individually';
    // The sessions table holds the live auth tokens (session_id == the cookie).
    // Exposing it through the generic bridge would let any staff session read
    // another user's session_id and impersonate them. The client never touches
    // this table in server mode (auth is /api/login + /api/me), so block it
    // outright on both query and exec.
    if (/\bsessions\b/i.test(sql)) return 'the sessions table is managed by /api/login and is not accessible via the bridge';
    // POSITIONAL-RENAME CREDENTIAL EXFIL: the query path strips credential
    // columns by OUTPUT NAME (password_hash/salt/...) and rejects those names in
    // the SQL text. Both checks are defeated by positionally renaming the
    // columns, which returns the same data under harmless aliases:
    //   WITH x(a,b,c,d,...) AS (SELECT * FROM users) SELECT * FROM x
    //   SELECT 1 a,2 b,3 c,4 d,... UNION ALL SELECT * FROM users
    // (a compound query takes its output names from the FIRST SELECT.) Any staff
    // session could thus read every user's password_hash+salt. The client uses
    // ZERO CTEs/compound operators over the bridge, so reject them outright on
    // both paths — the only legit users read (IT user list) is a plain SELECT.
    if (/\bwith\b/i.test(sql)) return 'common table expressions (WITH) are not allowed over the bridge';
    if (/\b(union|intersect|except)\b/i.test(sql)) return 'compound queries (UNION/INTERSECT/EXCEPT) are not allowed over the bridge';
    return null;
  }
  // Writes the bridge must refuse even from a staff session. The bridge is a
  // coarse trust model (any staff login can run arbitrary CRUD — see the honest
  // caveat above), so at minimum protect the structural/integrity invariants the
  // server owns: no schema changes (server runs migrations), and audit_log stays
  // APPEND-ONLY so its tamper-evidence can't be wiped from a workstation.
  function execForbidden(sql) {
    if (/^\s*(drop|alter|create|reindex|vacuum)\b/i.test(sql)) return 'schema changes are server-owned and not allowed via the bridge';
    // audit_log must stay APPEND-ONLY: block UPDATE/DELETE *and* REPLACE /
    // INSERT OR REPLACE (a REPLACE on a conflicting log_id deletes+reinserts,
    // which would silently rewrite or drop an audit row).
    if (/\baudit_log\b/i.test(sql) && /\b(update|delete|replace)\b/i.test(sql)) return 'audit_log is append-only — only plain INSERT is allowed';
    return null;
  }
  // ---- Manual backup (it_admin): snapshot NOW, e.g. right before maintenance ----
  if (pathname === '/api/admin/backup' && req.method === 'POST') {
    if (!can(role, 'manage_users')) return send(res, 403, { error: 'forbidden' });
    try {
      const file = runBackup();
      auditNow(actor, 'BACKUP_CREATED', `Manual DB backup: ${path.basename(file)}`, req);
      return send(res, 200, { file: path.basename(file) });
    } catch (e) { return send(res, 500, { error: 'backup_failed', message: e.message }); }
  }

  if (pathname === '/api/db/version' && req.method === 'GET') {
    if (!actor) return send(res, 403, { error: 'forbidden', message: 'staff session required' });
    return send(res, 200, { version: dbWriteVersion });
  }
  // ---- real-time change stream (SSE). Pushes {"version":N} on every data write
  // so other workstations refresh immediately instead of waiting out a poll
  // tick. Carries ONLY the version counter — no PHI rides this channel. Gated
  // like /api/db/version: any staff session. ----
  if (pathname === '/api/events' && req.method === 'GET') {
    if (!actor) return send(res, 403, { error: 'forbidden', message: 'staff session required' });
    res.writeHead(200, Object.assign({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',           // reverse proxies must not buffer the stream
    }, hstsHeaders()));
    // retry: how long the browser waits before auto-reconnecting; the initial
    // version lets a reconnecting client detect writes it missed while offline.
    res.write(`retry: 3000\ndata: {"version":${dbWriteVersion}}\n\n`);
    _sseClients.add(res);
    req.on('close', () => _sseClients.delete(res));
    return;   // intentionally never res.end() — this response IS the stream
  }
  // ---- FHIR R4 read-only interoperability facade ----
  // GET /api/fhir/metadata               -> CapabilityStatement
  // GET /api/fhir/Patient/{id}           -> Patient (read)
  // GET /api/fhir/Patient?identifier=MRN -> Patient (search)
  // GET /api/fhir/{Resource}?patient={id}-> clinical resources (search, by patient)
  // Read-only: auth + RBAC + department scoping + audit, reusing the same gates as
  // the dedicated endpoints. No writes in this slice.
  if (pathname === '/api/fhir/metadata' && req.method === 'GET') {
    if (!can(role, 'view_patients')) return sendFhir(res, 403, fhir.operationOutcome('error', 'forbidden', 'a staff role is required'));
    return sendFhir(res, 200, fhir.capabilityStatement(new Date().toISOString()));
  }
  const fhirMatch = pathname.match(/^\/api\/fhir\/([A-Za-z]+)(?:\/([\w.-]+))?$/);
  if (fhirMatch) {
    if (req.method !== 'GET') return sendFhir(res, 405, fhir.operationOutcome('error', 'not-supported', 'the FHIR facade is read-only'));
    return handleFhirRead(req, res, actor, role, fhirMatch[1], fhirMatch[2] || null);
  }

  if (pathname === '/api/db/query' && req.method === 'POST') {
    if (!actor) return send(res, 403, { error: 'forbidden', message: 'staff session required' });
    const sql = body.sql, params = Array.isArray(body.params) ? body.params : [];
    const bad = bridgeGuard(sql);
    if (bad) return send(res, 400, { error: 'validation', message: bad });
    if (!/^\s*(select|with|pragma\s+table_info|explain)\b/i.test(sql)) return send(res, 400, { error: 'validation', message: 'query endpoint is for reads only — use /api/db/exec for writes' });
    // Reject any read that even MENTIONS a credential column. Output redaction
    // alone is bypassable (SELECT password_hash AS x, or substr(password_hash,...)),
    // so refuse at the SQL-text level. Staff auth is server-side (/api/login);
    // the client never needs to read these in server mode.
    if (SECRET_COLS.some(c => new RegExp('\\b' + c + '\\b', 'i').test(sql))) return send(res, 403, { error: 'forbidden', message: 'credential columns are not readable via the bridge' });
    // PHI-read traceability: every dedicated read endpoint audits PHI access;
    // the bridge couldn't without exploding audit_log, so the FIRST read of
    // each PHI table per session is recorded instead — "which session could
    // see what, starting when" survives in the audit trail.
    let phiAdded = false;
    for (const tbl of BRIDGE_PHI_TABLES) {
      if (!new RegExp('\\b' + tbl + '\\b', 'i').test(sql)) continue;
      const k = auth.session.session_id + ':' + tbl;
      if (!bridgePhiAudited.has(k)) {
        bridgePhiAudited.add(k);
        audit(actor, 'BRIDGE_PHI_READ', `first bridge read of ${tbl} this session`, req);
        phiAdded = true;
      }
    }
    if (phiAdded) persist();
    try {
      const rows = all(sql, params).map(r => { for (const c of SECRET_COLS) if (c in r) delete r[c]; return r; });
      return send(res, 200, { rows });
    } catch (e) { return send(res, 400, { error: 'sql_error', message: e.message }); }
  }
  if (pathname === '/api/db/exec' && req.method === 'POST') {
    if (!actor) return send(res, 403, { error: 'forbidden', message: 'staff session required' });
    const sql = body.sql, params = Array.isArray(body.params) ? body.params : [];
    const bad = bridgeGuard(sql);
    if (bad) return send(res, 400, { error: 'validation', message: bad });
    if (/^\s*(select|with|pragma|explain)\b/i.test(sql)) return send(res, 400, { error: 'validation', message: 'exec endpoint is for writes only — use /api/db/query for reads' });
    const forbidden = execForbidden(sql);
    if (forbidden) return send(res, 403, { error: 'forbidden', message: forbidden });
    // PRIVILEGE-ESCALATION GUARD: any staff session could previously run
    // `UPDATE users SET role='it_admin'` (or rewrite another user's
    // password_hash/salt) through the bridge. Writes touching the users table
    // or any credential column now require the same manage_users permission
    // as the dedicated /api/users endpoints. The denial itself is audited.
    if ((/\busers\b/i.test(sql) || SECRET_COLS.some(c => new RegExp('\\b' + c + '\\b', 'i').test(sql))) && !can(role, 'manage_users')) {
      auditNow(actor, 'BRIDGE_DENIED', `exec touching users/credentials refused for role ${role}: ${String(sql).slice(0, 200)}`, req);
      return send(res, 403, { error: 'forbidden', message: 'writes to users or credential columns require user-management permission — use /api/users' });
    }
    try {
      // run + capture lastId synchronously (no await between) so concurrent
      // requests from other devices can't interleave and corrupt last_insert_rowid.
      run(sql, params);
      const idRow = get('SELECT last_insert_rowid() AS id, changes() AS changes');
      bumpDbVersion();   // push the change to every connected workstation (SSE)
      persist();   // debounced flush to disk
      return send(res, 200, { lastId: idRow ? idRow.id : null, changes: idRow ? idRow.changes : 0, version: dbWriteVersion });
    } catch (e) { return send(res, 400, { error: 'sql_error', message: e.message }); }
  }

  return send(res, 404, { error: 'not_found' });
}

// ---- init + listen ----------------------------------------------------------
// Safe, non-credential REFERENCE data (departments + a starter formulary). Seeded
// on first boot in ANY mode — a fresh production DB still needs departments to
// admit into and drugs to prescribe; "no default accounts" must not mean "no
// reference data."
function seedReference() {
  if (!get('SELECT dept_id FROM departments LIMIT 1')) {
    run("INSERT INTO departments (name_ar, name_en, type) VALUES ('الطوارئ','Emergency','emergency'), ('الباطنة','Internal Medicine','ward'), ('العناية المركزة','ICU','icu')");
  }
  if (!get('SELECT drug_id FROM drugs LIMIT 1')) {
    run("INSERT INTO drugs (name_generic, unit, is_high_alert) VALUES ('Paracetamol','mg',0), ('Ceftriaxone','mg',0), ('Regular Insulin','units',1)");
  }
}

// DEMO credentials only (OPENWARD_DEMO=1). Never in production.
async function seedDemoAccounts() {
  if (get('SELECT user_id FROM users LIMIT 1')) return;
  const mk = async (username, pw, ar, en, role, dept) => {
    const salt = u.generateSalt();
    run('INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
      [username, await u.hashPassword(pw, salt), salt, ar, en, role, dept, new Date().toISOString()]);
  };
  await mk('admin', 'HIS@2024', 'مدير النظام', 'IT Admin', 'it_admin', null);
  await mk('er.doc', 'doctor123', 'طبيب طوارئ', 'ER Doctor', 'emergency_doctor', 1);
  await mk('nurse', 'nurse123', 'ممرضة', 'Ward Nurse', 'nurse', 2);
  await mk('consultant', 'doctor123', 'استشاري', 'Consultant', 'consultant', 2);
  await mk('reception', 'front123', 'استقبال', 'Reception', 'receptionist', 1);
  audit(null, 'SERVER_SEED', 'Seeded DEMO accounts', null);
}

async function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  auditKey = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE) : (() => { const k = crypto.randomBytes(32); fs.writeFileSync(KEY_FILE, k, { mode: 0o600 }); return k; })();
  const SQL = await initSqlJs({ locateFile: f => path.join(ROOT, 'vendor', f) });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  dbjs.__buildFreshSchemaForTest(db);     // createAllTables + applySchemaMigrations (idempotent on existing DBs)
  try { db.run('PRAGMA secure_delete = ON'); } catch (e) {}
  try { db.run('PRAGMA foreign_keys = ON'); } catch (e) {}   // enforce FKs server-side (clients leave this OFF)
  // Existing DBs created before FK clauses won't have them retrofitted (SQLite
  // can't ALTER-add FKs). Surface any pre-existing violations so operators know to
  // recreate server/data for a clean FK-enforced DB (a full table-rebuild
  // migration is deferred — see server/README "FK retrofit").
  try { const viol = all('PRAGMA foreign_key_check'); if (viol.length) console.warn(`[fk] ${viol.length} foreign-key violation(s) in existing data — consider recreating server/data for a clean FK-enforced DB.`); } catch (e) {}
  // Also detect tables created BEFORE the FK clauses (foreign_key_check can't see a
  // missing-constraint case); warn so operators recreate server/data.
  const miss = missingFks();
  if (miss.length) console.warn(`[fk] tables without FK constraints (pre-FK DB?): ${miss.join(', ')} — recreate server/data for a clean FK-enforced DB.`);
  seedReference();                        // departments + formulary, every mode
  if (DEMO) await seedDemoAccounts();     // demo credentials only when asked
  else if (!get('SELECT user_id FROM users LIMIT 1')) {
    setupToken = crypto.randomBytes(16).toString('hex');   // one-time, in memory
    console.log(`\n[setup] No accounts yet. One-time setup token (use it ONCE, from THIS machine):\n        ${setupToken}\n        POST /api/setup {"token","username","password"}  (or OPENWARD_DEMO=1 for demo accounts)\n`);
  }
  persistNow();
  return db;
}

// Tables → the columns we expect to carry FK constraints; report any not constrained.
const EXPECT_FK = {
  admissions: ['patient_id', 'dept_id'],
  users: ['department_id'],
  vitals_log: ['admission_id'],
  prescriptions: ['admission_id', 'drug_id'],
  lab_orders: ['admission_id'],
  med_admin_records: ['prescription_id', 'admission_id'],
  dispensing_log: ['prescription_id', 'drug_id', 'patient_id'],
  patient_conditions: ['patient_id'],
  patient_allergies: ['patient_id'],
};
function missingFks() {
  const out = [];
  for (const [t, cols] of Object.entries(EXPECT_FK)) {
    let present = [];
    try { present = all(`PRAGMA foreign_key_list(${t})`).map(r => r.from); } catch (e) {}
    for (const c of cols) if (!present.includes(c)) out.push(`${t}.${c}`);
  }
  return out;
}

// loopback check: first-run setup must come from the hospital PC itself.
function isLoopback(req) {
  const a = (req && req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
// plain HTTP is only allowed on loopback or with an explicit insecure override.
function plainHttpAllowed(host, insecure) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost' || insecure === '1';
}

function start() {
  const handler = (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch (e) { return send(res, 400, { error: 'bad_request', message: 'malformed URL' }); }   // bad %-encoding mustn't crash
    if (pathname.startsWith('/api/')) {
      handleApi(req, res, pathname).catch(e => { try { send(res, 500, { error: 'server', message: e.message }); } catch (_) {} });
    } else {
      serveStatic(req, res, pathname);
    }
  };
  let server;
  if (HTTPS_KEY && HTTPS_CERT) {           // HTTPS when a cert is provided (recommended for real PHI)
    IS_HTTPS = true;
    server = https.createServer({ key: fs.readFileSync(HTTPS_KEY), cert: fs.readFileSync(HTTPS_CERT) }, handler);
  } else if (!plainHttpAllowed(HOST, process.env.OPENWARD_INSECURE_HTTP)) {
    throw new Error(`Refusing plain HTTP on ${HOST}: PHI would cross the LAN in cleartext. Provide HTTPS_KEY/HTTPS_CERT, bind HOST=127.0.0.1, or set OPENWARD_INSECURE_HTTP=1 to override (NOT for real PHI).`);
  } else {
    server = http.createServer(handler);   // plain HTTP (loopback dev, or explicit override)
  }
  server.listen(PORT, HOST, () => console.log(`OpenWard LAN server on ${IS_HTTPS ? 'https' : 'http'}://${HOST}:${PORT}  (central DB: ${DB_FILE}${DEMO ? '; DEMO accounts seeded' : ''})`));
  return server;
}

// Ctrl+C / service stop must never drop the last writes (persist() holds a 50ms
// debounce window) — flush before exiting.
function shutdown(sig) {
  console.log(`[shutdown] ${sig}: flushing DB to disk`);
  try { persistNow(); } catch (e) { console.error('[shutdown] flush failed:', e.message); }
  process.exit(0);
}

if (require.main === module) {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  init().then(() => { scheduleBackups(); return start(); }).catch(e => { console.error('server init failed:', e); process.exit(1); });
}

module.exports = { init, start, _internals: () => ({ all, get, run, withTx, audit, can, sessionFromReq, isLoopback, plainHttpAllowed, missingFks, ipThrottled, recordIpFail, runBackup, BACKUP_DIR, BACKUP_KEEP, getSetupToken: () => setupToken }) };
