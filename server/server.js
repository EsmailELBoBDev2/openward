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
const CLINICAL = ['it_admin', 'hospital_manager', 'consultant', 'doctor', 'emergency_doctor', 'triage_nurse', 'senior_nurse', 'nurse'];
const CAN = {
  register_patient: ['emergency_doctor', 'triage_nurse', 'receptionist', 'it_admin'],
  // demographics (list + basic detail) — receptionist included; CLINICAL data is separate
  view_patients:    [...CLINICAL, 'receptionist'],
  view_chart:       CLINICAL,                            // vitals/clinical chart (NOT receptionist)
  view_meds:        CLINICAL,                            // prescriptions
  record_vitals:    ['nurse', 'senior_nurse', 'triage_nurse', 'doctor', 'emergency_doctor'],
  view_beds:        ['it_admin', 'hospital_manager', 'consultant', 'doctor', 'senior_nurse', 'nurse', 'emergency_doctor', 'triage_nurse'],
  prescribe:        ['doctor', 'consultant', 'emergency_doctor'],
  order_labs:       ['doctor', 'consultant', 'emergency_doctor'],
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
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  // PHI must never be cached; nosniff hardens content handling.
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' }, headers || {}));
  res.end(body);
}
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
  if (!STATIC_ALLOW.test(rel)) { res.writeHead(403); return res.end('forbidden'); }
  const full = path.join(ROOT, rel);
  const within = path.relative(ROOT, full);
  if (within.startsWith('..') || path.isAbsolute(within)) { res.writeHead(403); return res.end('forbidden'); }
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
    // Clinical data (vitals + the clinical admission fields: chief complaint,
    // diagnosis, code status, etc.) only for view_chart roles. Others (e.g.
    // receptionist) get a demographics-only admission stub.
    const clinical = can(role, 'view_chart');
    const safeAdmission = !admission ? null : (clinical ? admission
      : { admission_id: admission.admission_id, dept_id: admission.dept_id, bed_number: admission.bed_number, admitted_at: admission.admitted_at, status: admission.status });
    const vitals = (admission && clinical) ? all('SELECT * FROM vitals_log WHERE admission_id = ? ORDER BY vitals_id DESC LIMIT 10', [admission.admission_id]) : [];
    audit(actor, 'PATIENT_VIEWED', 'Opened patient chart', req, patient);   // log every PHI read
    persistNow();   // durable: don't lose a PHI-access record on a crash
    return send(res, 200, { patient, admission: safeAdmission, vitals });
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
    // server-side medication safety (authoritative; not just the browser):
    const ptRx = patientOfAdmission(aid);
    const dn = (drug.name_generic || '').toLowerCase();
    const allergyHit = all('SELECT allergen FROM patient_allergies WHERE patient_id = ?', [ptRx.patient_id])
      .find(a => { const al = (a.allergen || '').toLowerCase().trim(); return al && (dn.includes(al) || al.includes(dn)); });
    if (allergyHit && body.override !== true) return send(res, 409, { error: 'allergy_conflict', message: `Patient has a recorded allergy to "${allergyHit.allergen}". Re-send with override:true to proceed.` });
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
    persistNow();
    return send(res, 201, { order_id: orderId });
  }

  if (pathname === '/api/audit' && req.method === 'GET') {
    if (!can(role, 'view_audit')) return send(res, 403, { error: 'forbidden' });
    const entries = all('SELECT log_id, timestamp, user_name_en, user_role, action_type, action_detail, patient_mrn, ip_address FROM audit_log ORDER BY log_id DESC LIMIT 200');
    auditNow(actor, 'AUDIT_LOG_VIEWED', `Read audit log (${entries.length} rows)`, req);   // reading the audit log is itself audited
    return send(res, 200, { entries });
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
    return send(res, 200, { ok: true });
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
  admissions: ['patient_id'],
  vitals_log: ['admission_id'],
  prescriptions: ['admission_id', 'drug_id'],
  lab_orders: ['admission_id'],
  med_admin_records: ['prescription_id', 'admission_id'],
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

if (require.main === module) {
  init().then(start).catch(e => { console.error('server init failed:', e); process.exit(1); });
}

module.exports = { init, start, _internals: () => ({ all, get, run, withTx, audit, can, sessionFromReq, isLoopback, plainHttpAllowed, missingFks, getSetupToken: () => setupToken }) };
