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
 *     node server/server.js          # http://0.0.0.0:8080  (LAN)
 *     HOST=127.0.0.1 PORT=9000 node server/server.js
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

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.OPENWARD_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'openward.sqlite');
const KEY_FILE = path.join(DATA_DIR, 'audit.key');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '8080', 10);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';   // only then is X-Forwarded-For believed
const DEMO = process.env.OPENWARD_DEMO === '1';        // seed demo accounts ONLY when set
const HTTPS_KEY = process.env.HTTPS_KEY || '';         // path to TLS key (set both to enable HTTPS)
const HTTPS_CERT = process.env.HTTPS_CERT || '';
let IS_HTTPS = false;                                  // set in start()

const initSqlJs = require(path.join(ROOT, 'vendor', 'sql-wasm.js'));
const dbjs = require(path.join(ROOT, 'js', 'db.js'));     // reuse schema builder (createAllTables + migrations)
const u = require(path.join(ROOT, 'js', 'utils.js'));     // reuse hashPassword/verifyPassword (PBKDF2)

let db = null;            // the one central sql.js Database
let auditKey = null;      // HMAC key, loaded from disk (outside the DB)

// ---- tiny DB helpers over sql.js -------------------------------------------
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try { stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
  finally { stmt.free(); }
}
function get(sql, params = []) { const r = all(sql, params); return r.length ? r[0] : null; }
function run(sql, params = []) { db.run(sql, params); }
function lastId() { const r = get('SELECT last_insert_rowid() AS id'); return r ? r.id : null; }
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

// ---- RBAC (server-authoritative) -------------------------------------------
const CAN = {
  register_patient: ['emergency_doctor', 'triage_nurse', 'receptionist', 'it_admin'],
  view_patients:    ['it_admin', 'hospital_manager', 'consultant', 'doctor', 'emergency_doctor', 'triage_nurse', 'senior_nurse', 'nurse', 'receptionist'],
  record_vitals:    ['nurse', 'senior_nurse', 'triage_nurse', 'doctor', 'emergency_doctor'],
  view_beds:        ['it_admin', 'hospital_manager', 'consultant', 'doctor', 'senior_nurse', 'nurse', 'emergency_doctor', 'triage_nurse'],
  prescribe:        ['doctor', 'consultant', 'emergency_doctor'],
  order_labs:       ['doctor', 'consultant', 'emergency_doctor'],
  view_audit:       ['it_admin', 'hospital_manager'],   // full audit log is oversight-only (a consultant would see every dept's PHI access)
};
function can(role, action) { return (CAN[action] || []).includes(role); }

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
function send(res, code, obj, headers) { const body = JSON.stringify(obj); res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, headers || {})); res.end(body); }
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.join(ROOT, rel);
  // Path-traversal guard: startsWith(ROOT) would also accept a sibling like
  // "<root>2". Use path.relative and reject anything that escapes ROOT.
  const within = path.relative(ROOT, full);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}
function genMRN(patientId) { return `HIS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(patientId).padStart(5, '0')}`; }

// ---- API routes -------------------------------------------------------------
async function handleApi(req, res, pathname) {
  const auth = sessionFromReq(req);
  const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};

  // ---- public: health / server-mode probe (lets the browser detect it's served
  // by the LAN server vs opened standalone) ----
  if (pathname === '/api/health' && req.method === 'GET') {
    const hasUsers = !!get('SELECT user_id FROM users LIMIT 1');
    return send(res, 200, { ok: true, server: 'openward', https: IS_HTTPS, demo: DEMO, needsSetup: !hasUsers });
  }

  // ---- public: first-run admin setup (only while there are NO users) ----
  if (pathname === '/api/setup' && req.method === 'POST') {
    if (get('SELECT user_id FROM users LIMIT 1')) return send(res, 409, { error: 'already_initialized', message: 'Setup is closed — an account already exists.' });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || password.length < 8) return send(res, 400, { error: 'validation', message: 'username and a password of at least 8 chars are required' });
    const salt = u.generateSalt();
    run('INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
      [username, await u.hashPassword(password, salt), salt, String(body.full_name_ar || username), String(body.full_name_en || username), 'it_admin', null, new Date().toISOString()]);
    audit(null, 'FIRST_RUN_SETUP', `Initial it_admin account "${username}" created`, req);
    persistNow();
    return send(res, 201, { ok: true, username });
  }

  // ---- public: login ----
  if (pathname === '/api/login' && req.method === 'POST') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const acct = username.toLowerCase();
    // DB-backed lockout (5 fails / 15 min)
    const since = Date.now() - 15 * 60 * 1000;
    const fails = get('SELECT COUNT(*) AS c FROM login_attempts WHERE account = ? AND attempt_ms > ?', [acct, since]);
    if (fails && fails.c >= 5) return send(res, 429, { error: 'locked', message: 'Too many attempts; try again later.' });
    const user = get('SELECT * FROM users WHERE username = ?', [username]);
    const okUser = user && user.is_active;
    const v = okUser ? await u.verifyPassword(password, user.salt, user.password_hash) : { ok: false };
    if (!okUser || !v.ok) {
      run('INSERT INTO login_attempts (account, attempt_ms) VALUES (?, ?)', [acct, Date.now()]);
      audit(null, 'LOGIN_FAILED', `Failed login for "${username}"`, req);
      persist();
      return send(res, 401, { error: 'bad_credentials', message: 'Invalid username or password.' });
    }
    if (v.needsUpgrade) { try { run('UPDATE users SET password_hash = ? WHERE user_id = ?', [await u.hashPassword(password, user.salt), user.user_id]); } catch (e) {} }
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
    run('DELETE FROM sessions WHERE session_id = ?', [auth.session.session_id]); persist();
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (pathname === '/api/me' && req.method === 'GET') {
    return send(res, 200, { user: actor ? { user_id: actor.user_id, full_name_en: actor.full_name_en, role: actor.role, department_id: actor.department_id } : { role: 'patient' } });
  }

  if (pathname === '/api/patients' && req.method === 'GET') {
    if (!can(role, 'view_patients')) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, { patients: all('SELECT patient_id, mrn, full_name_ar, full_name_en, date_of_birth, gender, blood_type FROM patients ORDER BY patient_id DESC LIMIT 500') });
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
      run('COMMIT');
      const patient = get('SELECT * FROM patients WHERE patient_id = ?', [pid]);
      audit(actor, 'PATIENT_REGISTERED', `Registered ${nameAr} (MRN ${mrn})`, req, patient);
      persistNow();
      return send(res, 201, { patient_id: pid, mrn });
    } catch (e) {
      try { run('ROLLBACK'); } catch (_) {}
      return send(res, 500, { error: 'server', message: e.message });
    }
  }

  if (pathname === '/api/beds' && req.method === 'GET') {
    if (!can(role, 'view_beds')) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, { admissions: all(`SELECT a.admission_id, a.bed_number, a.dept_id, p.mrn, p.full_name_ar, p.full_name_en
      FROM admissions a JOIN patients p ON a.patient_id = p.patient_id WHERE a.status = 'active' ORDER BY a.dept_id, a.bed_number`) });
  }

  if (pathname === '/api/vitals' && req.method === 'POST') {
    if (!can(role, 'record_vitals')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt(body.admission_id, 10);
    if (!aid || !get('SELECT admission_id FROM admissions WHERE admission_id = ?', [aid])) return send(res, 400, { error: 'validation', message: 'valid admission_id required' });
    run(`INSERT INTO vitals_log (admission_id, recorded_by, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, o2_sat, resp_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [aid, actor.user_id, new Date().toISOString(), body.bp_systolic || null, body.bp_diastolic || null, body.heart_rate || null, body.temperature || null, body.o2_sat || null, body.resp_rate || null]);
    audit(actor, 'VITALS_RECORDED', `Vitals for admission ${aid}`, req);
    persistNow();
    return send(res, 201, { vitals_id: lastId() });
  }

  // Patient detail: record + active admission + recent vitals.
  const pm = pathname.match(/^\/api\/patients\/(\d+)$/);
  if (pm && req.method === 'GET') {
    if (!can(role, 'view_patients')) return send(res, 403, { error: 'forbidden' });
    const pid = parseInt(pm[1], 10);
    const patient = get('SELECT * FROM patients WHERE patient_id = ?', [pid]);
    if (!patient) return send(res, 404, { error: 'not_found' });
    delete patient.portal_password_hash; delete patient.portal_salt;   // never ship secrets
    const admission = get("SELECT * FROM admissions WHERE patient_id = ? AND status = 'active' ORDER BY admission_id DESC LIMIT 1", [pid]);
    const vitals = admission ? all('SELECT * FROM vitals_log WHERE admission_id = ? ORDER BY vitals_id DESC LIMIT 10', [admission.admission_id]) : [];
    return send(res, 200, { patient, admission, vitals });
  }

  if (pathname === '/api/prescriptions' && req.method === 'GET') {
    if (!can(role, 'view_patients')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt((req.url.split('?')[1] || '').match(/admission_id=(\d+)/)?.[1], 10);
    if (!aid) return send(res, 400, { error: 'validation', message: 'admission_id query param required' });
    return send(res, 200, { prescriptions: all("SELECT rx_id, drug_id, drug_name, dose, route, frequency, status, prescribed_at FROM prescriptions WHERE admission_id = ? ORDER BY rx_id DESC", [aid]) });
  }

  if (pathname === '/api/prescriptions' && req.method === 'POST') {
    if (!can(role, 'prescribe')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt(body.admission_id, 10);
    const drug = get('SELECT * FROM drugs WHERE drug_id = ?', [parseInt(body.drug_id, 10)]);
    if (!aid || !get('SELECT admission_id FROM admissions WHERE admission_id = ?', [aid])) return send(res, 400, { error: 'validation', message: 'valid admission_id required' });
    if (!drug) return send(res, 400, { error: 'validation', message: 'valid drug_id required (formulary only — no free-text drug)' });
    if (!body.dose || !body.route || !body.frequency) return send(res, 400, { error: 'validation', message: 'dose, route, frequency required' });
    const now = new Date().toISOString();
    run(`INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [aid, actor.user_id, drug.drug_id, drug.name_generic, String(body.dose), String(body.route), String(body.frequency), now.slice(0, 10), now]);
    const patient = get('SELECT p.* FROM patients p JOIN admissions a ON a.patient_id = p.patient_id WHERE a.admission_id = ?', [aid]);
    audit(actor, 'PRESCRIPTION_ISSUED', `Prescribed ${drug.name_generic} ${body.dose} ${body.route} ${body.frequency}`, req, patient);
    persistNow();
    return send(res, 201, { rx_id: lastId() });
  }

  if (pathname === '/api/lab-orders' && req.method === 'POST') {
    if (!can(role, 'order_labs')) return send(res, 403, { error: 'forbidden' });
    const aid = parseInt(body.admission_id, 10);
    const test = String(body.test_name || '').trim();
    if (!aid || !get('SELECT admission_id FROM admissions WHERE admission_id = ?', [aid])) return send(res, 400, { error: 'validation', message: 'valid admission_id required' });
    if (!test) return send(res, 400, { error: 'validation', message: 'test_name required' });
    const priority = ['routine', 'urgent', 'stat'].includes(body.priority) ? body.priority : 'routine';
    run(`INSERT INTO lab_orders (admission_id, doctor_id, test_name, priority, status, ordered_at) VALUES (?, ?, ?, ?, 'ordered', ?)`,
      [aid, actor.user_id, test, priority, new Date().toISOString()]);
    audit(actor, 'LAB_ORDERED', `Ordered ${test} (${priority})`, req);
    persistNow();
    return send(res, 201, { order_id: lastId() });
  }

  if (pathname === '/api/audit' && req.method === 'GET') {
    if (!can(role, 'view_audit')) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, { entries: all('SELECT log_id, timestamp, user_name_en, user_role, action_type, action_detail, patient_mrn, ip_address FROM audit_log ORDER BY log_id DESC LIMIT 200') });
  }

  return send(res, 404, { error: 'not_found' });
}

// ---- init + listen ----------------------------------------------------------
async function seedMinimal() {
  if (get('SELECT user_id FROM users LIMIT 1')) return;        // already seeded
  run("INSERT INTO departments (name_ar, name_en, type) VALUES ('الطوارئ','Emergency','emergency'), ('الباطنة','Internal Medicine','ward'), ('العناية المركزة','ICU','icu')");
  const mk = async (username, pw, ar, en, role, dept) => {
    const salt = u.generateSalt();
    run('INSERT INTO users (username, password_hash, salt, full_name_ar, full_name_en, role, department_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
      [username, await u.hashPassword(pw, salt), salt, ar, en, role, dept, new Date().toISOString()]);
  };
  await mk('admin', 'HIS@2024', 'مدير النظام', 'IT Admin', 'it_admin', null);
  await mk('er.doc', 'doctor123', 'طبيب طوارئ', 'ER Doctor', 'emergency_doctor', 1);
  await mk('nurse', 'nurse123', 'ممرضة', 'Ward Nurse', 'nurse', 2);
  await mk('consultant', 'doctor123', 'استشاري', 'Consultant', 'consultant', 2);
  // a tiny starter formulary so prescribing works out of the box
  run("INSERT INTO drugs (name_generic, unit, is_high_alert) VALUES ('Paracetamol','mg',0), ('Ceftriaxone','mg',0), ('Regular Insulin','units',1)");
  audit(null, 'SERVER_SEED', 'Seeded departments + initial accounts + starter formulary', null);
  persistNow();
}

async function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  auditKey = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE) : (() => { const k = crypto.randomBytes(32); fs.writeFileSync(KEY_FILE, k, { mode: 0o600 }); return k; })();
  const SQL = await initSqlJs({ locateFile: f => path.join(ROOT, 'vendor', f) });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  dbjs.__buildFreshSchemaForTest(db);     // createAllTables + applySchemaMigrations (idempotent on existing DBs)
  try { db.run('PRAGMA secure_delete = ON'); } catch (e) {}
  try { db.run('PRAGMA foreign_keys = ON'); } catch (e) {}   // enforce FKs server-side (clients leave this OFF)
  if (DEMO) {
    await seedMinimal();                  // demo accounts ONLY when OPENWARD_DEMO=1
  } else if (!get('SELECT user_id FROM users LIMIT 1')) {
    console.log('[setup] No accounts yet — POST /api/setup {username,password} to create the first it_admin (or set OPENWARD_DEMO=1 for demo accounts).');
  }
  persistNow();
  return db;
}

function start() {
  const handler = (req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
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
  } else {
    server = http.createServer(handler);   // plain HTTP (LAN dev only — cleartext)
  }
  server.listen(PORT, HOST, () => console.log(`OpenWard LAN server on ${IS_HTTPS ? 'https' : 'http'}://${HOST}:${PORT}  (central DB: ${DB_FILE}${DEMO ? '; DEMO accounts seeded' : ''})`));
  return server;
}

if (require.main === module) {
  init().then(start).catch(e => { console.error('server init failed:', e); process.exit(1); });
}

module.exports = { init, start, _internals: () => ({ all, get, run, audit, can, sessionFromReq }) };
