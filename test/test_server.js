'use strict';
// Proves the LAN server is a REAL central authority: one DB behind /api, with
// server-side auth (HttpOnly cookie), RBAC, transactional bed-conflict, and that
// data written by one client is visible to another (shared central state).
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// Isolate the DB/key on disk so the test never touches a real server DB, and use
// a random loopback port so the test never collides with a running server.
process.env.OPENWARD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-srv-'));
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.OPENWARD_DEMO = '1';   // this test uses the seeded demo accounts

const server = require('../server/server.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// minimal cookie jar over fetch
function makeClient(base) {
  let cookie = '';
  return async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  };
}

(async () => {
  await server.init();
  const httpServer = server.start();
  if (!httpServer.listening) await new Promise(r => httpServer.once('listening', r));
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  // raw GET that sends the path VERBATIM — fetch()/curl normalize "/a/../b" on the
  // client, so to exercise the server's dot-segment guard the ".." must survive to
  // the wire (otherwise the request the server sees is already collapsed).
  const rawGet = (p) => new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: httpServer.address().port, path: p, method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', () => resolve('error')); r.end();
  });

  const A = makeClient(base);   // admin client
  const N = makeClient(base);   // nurse client
  const X = makeClient(base);   // unauthenticated client

  // 0. health probe (public) + setup is closed once accounts exist
  const health = await X('GET', '/api/health');
  assert(health.status === 200 && health.json.server === 'openward' && health.json.needsSetup === false, '/api/health reports server present, no setup needed (demo seeded)');
  assert((await X('POST', '/api/setup', { username: 'x', password: 'longenough' })).status === 409, '/api/setup is closed once an account exists (409)');

  // 1. auth
  assert((await A('POST', '/api/login', { username: 'admin', password: 'wrong' })).status === 401, 'wrong password rejected (401)');
  const login = await A('POST', '/api/login', { username: 'admin', password: 'HIS@2024' });
  assert(login.status === 200 && login.json.user.role === 'it_admin', 'admin logs in (200, role it_admin)');
  assert((await A('GET', '/api/me')).json.user.role === 'it_admin', '/api/me reflects the session');

  // 2. unauthenticated is blocked
  assert((await X('GET', '/api/patients')).status === 401, 'unauthenticated /api/patients is 401');

  // 3. register a patient into the CENTRAL db (admin allowed) with bed 5 / dept 1
  const reg = await A('POST', '/api/patients', { full_name_ar: 'مريض تجريبي', full_name_en: 'Test Patient', dept_id: 1, bed_number: '5', gender: 'male' });
  assert(reg.status === 201 && /^HIS-\d{8}-\d{5}$/.test(reg.json.mrn), 'patient registered, server-generated MRN');

  // 4. transactional bed conflict: same bed+dept is rejected (409), no partial row
  const clash = await A('POST', '/api/patients', { full_name_ar: 'آخر', dept_id: 1, bed_number: '5' });
  assert(clash.status === 409, 'double-booking bed 5/dept 1 is rejected (409)');

  // 3b. a second patient in dept 2 (the nurse's department) for the sharing/scope test
  const regWard = await A('POST', '/api/patients', { full_name_ar: 'مريض القسم', full_name_en: 'Ward Patient', dept_id: 2, bed_number: '7' });
  assert(regWard.status === 201, 'admin registers a dept-2 patient');

  // 5. RBAC: nurse may NOT register patients
  assert((await N('POST', '/api/login', { username: 'nurse', password: 'nurse123' })).status === 200, 'nurse logs in');
  assert((await N('POST', '/api/patients', { full_name_ar: 'x', dept_id: 1 })).status === 403, 'nurse is forbidden from registering (403)');

  // 6. SHARED state + dept scope: the dept-2 nurse sees the dept-2 patient the admin
  //    created (one central DB) but NOT the dept-1 patient (minimum-necessary).
  const listN = await N('GET', '/api/patients');
  assert(listN.status === 200 && listN.json.patients.some(p => p.full_name_en === 'Ward Patient'),
    'a second client sees the first client\'s write in its own dept (one central DB)');
  assert(!listN.json.patients.some(p => p.full_name_en === 'Test Patient'),
    'dept scope: the dept-2 nurse does NOT see the dept-1 patient');
  // admin (oversight) sees both
  const listA = await A('GET', '/api/patients');
  assert(listA.json.patients.some(p => p.full_name_en === 'Test Patient') && listA.json.patients.some(p => p.full_name_en === 'Ward Patient'),
    'oversight (it_admin) sees patients across departments');
  // detail dept scope: nurse blocked from the dept-1 chart
  assert((await N('GET', '/api/patients/' + reg.json.patient_id)).status === 403, 'dept scope: nurse is blocked from an out-of-department chart (403)');

  // 7. dept-scoped beds + WRITES (the hole this commit closes). Get both admissions
  //    from an oversight (admin) view.
  const allBeds = (await A('GET', '/api/beds')).json.admissions;
  const adm1 = allBeds.find(a => a.bed_number === '5');   // dept 1
  const adm2 = allBeds.find(a => a.bed_number === '7');   // dept 2 (the nurse's dept)
  assert(adm1 && adm2, 'oversight beds lists admissions in both departments');
  const nBeds = (await N('GET', '/api/beds')).json.admissions;
  assert(nBeds.some(a => a.bed_number === '7') && !nBeds.some(a => a.bed_number === '5'),
    'dept scope: nurse /api/beds shows its own dept only');
  assert((await N('POST', '/api/vitals', { admission_id: adm2.admission_id, heart_rate: 88, resp_rate: 18 })).status === 201, 'nurse records vitals in its OWN dept (201)');
  assert((await N('POST', '/api/vitals', { admission_id: adm1.admission_id, heart_rate: 90 })).status === 403, 'dept scope: nurse CANNOT record vitals on a dept-1 admission (403)');

  // 7b. doctor endpoints (er.doc is dept 1 → may act on adm1)
  const D = makeClient(base);
  assert((await D('POST', '/api/login', { username: 'er.doc', password: 'doctor123' })).status === 200, 'ER doctor logs in');
  assert((await N('POST', '/api/prescriptions', { admission_id: adm1.admission_id, drug_id: 1, dose: '500mg', route: 'PO', frequency: 'q8h' })).status === 403, 'nurse is forbidden from prescribing (403)');
  assert((await D('POST', '/api/prescriptions', { admission_id: adm1.admission_id, dose: 'x', route: 'PO', frequency: 'q8h' })).status === 400, 'prescription with no real drug_id is rejected (formulary only)');
  assert((await D('POST', '/api/prescriptions', { admission_id: adm1.admission_id, drug_id: 1, dose: '500mg', route: 'PO', frequency: 'q8h' })).status === 201, 'doctor prescribes a formulary drug in own dept (201)');
  const rxList = await D('GET', '/api/prescriptions?admission_id=' + adm1.admission_id);
  assert(rxList.status === 200 && rxList.json.prescriptions.length >= 1, 'prescriptions list reflects the new Rx (shared central DB)');
  assert((await D('POST', '/api/lab-orders', { admission_id: adm1.admission_id, test_name: 'CBC', priority: 'urgent' })).status === 201, 'doctor orders a lab in own dept (201)');
  const det = await D('GET', '/api/patients/' + reg.json.patient_id);
  assert(det.status === 200 && det.json.patient && det.json.admission, 'patient detail returns record + active admission + vitals');
  assert(det.json.patient.portal_password_hash === undefined, 'patient detail never ships portal_password_hash/salt');

  // 7c. consultant is dept 2 → may prescribe by ROLE, but NOT on a dept-1 admission
  const C = makeClient(base);
  assert((await C('POST', '/api/login', { username: 'consultant', password: 'doctor123' })).status === 200, 'consultant logs in');
  assert((await C('POST', '/api/prescriptions', { admission_id: adm1.admission_id, drug_id: 1, dose: '500mg', route: 'PO', frequency: 'q8h' })).status === 403, 'dept scope: consultant (dept 2) CANNOT prescribe on a dept-1 admission (403)');

  // audit read gating
  assert((await N('GET', '/api/audit')).status === 403, 'nurse is forbidden from the audit read (403)');
  assert((await C('GET', '/api/audit')).status === 403, 'consultant is forbidden from the full audit read (403) — oversight only');
  assert((await A('GET', '/api/audit')).json.entries.length >= 3, 'admin can read the central audit log');

  // 7d. staff / department administration (it_admin only)
  assert((await N('GET', '/api/departments')).json.departments.length >= 1, 'any staff can list departments (for dropdowns)');
  assert((await N('GET', '/api/users')).status === 403, 'nurse is forbidden from /api/users (403)');
  assert((await N('POST', '/api/departments', { name_en: 'X', name_ar: 'x' })).status === 403, 'nurse cannot create departments (403)');
  assert((await A('GET', '/api/users')).json.users.length >= 1 && !('password_hash' in (await A('GET', '/api/users')).json.users[0]), 'admin lists users without password hashes');
  assert((await A('POST', '/api/users', { username: 'dr.new', password: 'short', role: 'doctor' })).status === 400, 'create user rejects weak password (400)');
  assert((await A('POST', '/api/users', { username: 'dr.new', password: 'Str0ngPass!', role: 'wizard' })).status === 400, 'create user rejects invalid role (400)');
  const created = await A('POST', '/api/users', { username: 'dr.new', password: 'Str0ngPass!', role: 'doctor', department_id: 2, full_name_en: 'Dr New' });
  assert(created.status === 201, 'admin creates a staff user (201)');
  assert((await A('POST', '/api/users', { username: 'dr.new', password: 'Str0ngPass!', role: 'doctor' })).status === 409, 'duplicate username rejected (409)');
  const newId = created.json.user_id;
  // the new doctor can log in
  const DN = makeClient(base);
  assert((await DN('POST', '/api/login', { username: 'dr.new', password: 'Str0ngPass!' })).status === 200, 'the newly-created doctor can log in');
  // disable kills the account + sessions
  assert((await A('POST', `/api/users/${newId}/disable`, {})).status === 200, 'admin disables the user (200)');
  assert((await makeClient(base)('POST', '/api/login', { username: 'dr.new', password: 'Str0ngPass!' })).status === 401, 'a disabled user can no longer log in (401)');
  // reset password + re-enable
  assert((await A('POST', `/api/users/${newId}/reset-password`, { password: 'N3wStr0ng!' })).status === 200, 'admin resets the password (200)');
  assert((await A('POST', `/api/users/${newId}/enable`, {})).status === 200, 'admin re-enables the user (200)');
  assert((await makeClient(base)('POST', '/api/login', { username: 'dr.new', password: 'N3wStr0ng!' })).status === 200, 'the user logs in with the reset password');

  // 7e. PHI response headers
  const hres = await fetch(base + '/api/health');
  assert(hres.headers.get('cache-control') === 'no-store' && hres.headers.get('x-content-type-options') === 'nosniff', 'API responses set no-store + nosniff');

  // 7e2. static-file allowlist (#1 critical): the DB, audit key, and source are NOT served
  assert((await fetch(base + '/server/data/audit.key')).status === 403, 'static: /server/data/audit.key is denied (403)');
  assert((await fetch(base + '/server/data/openward.sqlite')).status === 403, 'static: the central DB file is denied (403)');
  assert((await fetch(base + '/server/server.js')).status === 403, 'static: server source is denied (403)');
  assert((await fetch(base + '/test/test_server.js')).status === 403, 'static: test/ is denied (403)');
  assert((await fetch(base + '/index.html')).status === 200 && (await fetch(base + '/js/api.js')).status === 200, 'static: real frontend assets still serve (200)');
  // dot-segment traversal (#1 critical, reproduced): a dot-segment that path.join
  // would normalize back INTO root used to pass the allowlist and serve the DB/key.
  // Sent raw so the ".." survives to the server (fetch would collapse it first).
  assert((await rawGet('/js/../server/data/audit.key')) === 403, 'static: raw dot-segment /js/../server/data/audit.key is denied (403) (#1)');
  assert((await rawGet('/js/%2e%2e/server/data/audit.key')) === 403, 'static: raw encoded %2e%2e dot-segment is denied (403) (#1)');
  assert((await rawGet('/js/../server/server.js')) === 403, 'static: raw dot-segment to server source is denied (403) (#1)');
  assert((await rawGet('/js/./api.js')) === 403, 'static: raw single-dot segment /js/./api.js is denied (403) (#1)');
  assert((await rawGet('/js/api.js')) === 200, 'static: a clean nested asset still serves over the raw client (200) (#1)');

  // 7f. finer RBAC (#2): receptionist sees demographics but NOT vitals or meds
  const R = makeClient(base);
  assert((await R('POST', '/api/login', { username: 'reception', password: 'front123' })).status === 200, 'receptionist logs in');
  const rDet = await R('GET', '/api/patients/' + reg.json.patient_id);
  assert(rDet.status === 200 && rDet.json.patient && rDet.json.vitals.length === 0, 'receptionist sees demographics but NOT vitals (#2 view_chart split)');
  assert(rDet.json.admission && !('chief_complaint' in rDet.json.admission), 'receptionist admission is sanitized — no clinical fields (#2)');
  assert('chief_complaint' in det.json.admission, 'a clinical role gets the full admission object (chief_complaint present)');
  assert((await R('GET', '/api/prescriptions?admission_id=' + adm1.admission_id)).status === 403, 'receptionist cannot read prescriptions (#2 view_meds split)');
  // #2 (leak fix): clinical patient columns (weight_kg/egfr) must be allowlisted OUT
  //     of a non-clinical payload — stripping only the portal secrets was not enough.
  server._internals().run('UPDATE patients SET weight_kg = 70, egfr = 88 WHERE patient_id = ?', [reg.json.patient_id]);
  const rWeight = await R('GET', '/api/patients/' + reg.json.patient_id);
  assert(!('weight_kg' in rWeight.json.patient) && !('egfr' in rWeight.json.patient), 'receptionist patient payload omits clinical fields weight_kg/egfr (#2 allowlist)');
  const dWeight = await D('GET', '/api/patients/' + reg.json.patient_id);
  assert('weight_kg' in dWeight.json.patient && dWeight.json.patient.weight_kg === 70, 'a clinical role (doctor) still receives weight_kg/egfr (#2)');
  // #7 (RBAC): it_admin is oversight (demographics/beds/audit), NOT a care team — even
  //     on a patient it may see, it gets no chart (vitals/weight_kg) and no meds.
  const aChart = await A('GET', '/api/patients/' + reg.json.patient_id);
  assert(aChart.status === 200 && aChart.json.vitals.length === 0 && !('weight_kg' in aChart.json.patient), 'it_admin gets demographics but NOT the clinical chart — oversight only (#7)');
  assert((await A('GET', '/api/prescriptions?admission_id=' + adm1.admission_id)).status === 403, 'it_admin cannot read prescriptions — not a clinician (#7)');

  // 7g. clinical safety (#4): vitals range, duplicate Rx, allergy block + override
  assert((await N('POST', '/api/vitals', { admission_id: adm2.admission_id, heart_rate: 999 })).status === 400, 'implausible vitals are rejected (#4)');
  assert((await D('POST', '/api/prescriptions', { admission_id: adm1.admission_id, drug_id: 1, dose: '500mg', route: 'PO', frequency: 'q8h' })).status === 409, 'duplicate active prescription is rejected (#4)');
  server._internals().run("INSERT INTO patient_allergies (patient_id, allergen) VALUES (?, 'Ceftriaxone')", [reg.json.patient_id]);
  assert((await D('POST', '/api/prescriptions', { admission_id: adm1.admission_id, drug_id: 2, dose: '1g', route: 'IV', frequency: 'q24h' })).status === 409, 'prescribing a drug the patient is allergic to is blocked (#4)');
  assert((await D('POST', '/api/prescriptions', { admission_id: adm1.admission_id, drug_id: 2, dose: '1g', route: 'IV', frequency: 'q24h', override: true })).status === 201, 'allergy block is overridable with override:true (#4)');

  // 7h. case-insensitive usernames (#5)
  assert((await A('POST', '/api/users', { username: 'ADMIN', password: 'Str0ngPass!', role: 'doctor' })).status === 409, 'username uniqueness is case-insensitive (#5)');
  assert((await makeClient(base)('POST', '/api/login', { username: 'ADMIN', password: 'HIS@2024' })).status === 200, 'login is case-insensitive (#5)');

  // 7i. oversized body → 413, not a hang (#7)
  const tooBig = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"' + 'x'.repeat(1100000) + '"}' });
  assert(tooBig.status === 413, 'an oversized request body returns 413 (#7)');

  // 8. audit chain exists and is HMAC-linked (key lives outside the DB)
  const internals = server._internals();
  const rows = internals.all('SELECT action_type, prev_hash, row_hash FROM audit_log ORDER BY log_id');
  assert(rows.length >= 3 && rows.every(r => r.row_hash) && rows.slice(1).every((r, i) => r.prev_hash === rows[i].row_hash),
    'audit log is a linked HMAC chain (IP recorded server-side)');

  // 8a. PHI reads are audited, and write audits carry patient context
  const arows = internals.all('SELECT action_type, patient_mrn FROM audit_log');
  assert(arows.some(r => r.action_type === 'PATIENT_VIEWED' && r.patient_mrn), 'PHI chart reads are audited with patient context (#2)');
  assert(arows.some(r => r.action_type === 'PATIENT_LIST_VIEWED'), 'patient-list reads are audited (#2)');
  assert(arows.some(r => r.action_type === 'VITALS_RECORDED' && r.patient_mrn), 'vitals write audit carries patient context (#4)');
  assert(arows.some(r => r.action_type === 'LAB_ORDERED' && r.patient_mrn), 'lab-order write audit carries patient context (#4)');
  assert(arows.some(r => r.action_type === 'PATIENT_VIEW_DENIED'), 'a denied out-of-department chart read is audited (durably via auditNow)');
  assert(arows.some(r => r.action_type === 'AUDIT_LOG_VIEWED'), 'reading the audit log is itself audited (#6)');
  // #6: failed logins and logouts are DURABLE audit events (persisted, not in-memory).
  assert(arows.some(r => r.action_type === 'LOGIN_FAILED'), 'a failed login is a durable audit event (#6)');
  const LO = makeClient(base);
  await LO('POST', '/api/login', { username: 'nurse', password: 'nurse123' });
  await LO('POST', '/api/logout', {});
  assert(internals.all("SELECT 1 AS x FROM audit_log WHERE action_type = 'LOGOUT'").length >= 1, 'logout is a durable audit event (#6)');

  // 8c. withTx rolls back the clinical insert if the audit step throws (#3 atomicity)
  const beforeV = internals.get('SELECT COUNT(*) AS c FROM vitals_log').c;
  let txThrew = false;
  try { internals.withTx(() => { internals.run("INSERT INTO vitals_log (admission_id, recorded_by, recorded_at) VALUES (?,?,?)", [adm2.admission_id, 1, '2026-01-01T00:00:00Z']); throw new Error('audit boom'); }); }
  catch (e) { txThrew = true; }
  assert(txThrew && internals.get('SELECT COUNT(*) AS c FROM vitals_log').c === beforeV, 'withTx rolls back the clinical write on error (#3 atomic clinical+audit)');

  // 8b. foreign keys ON: an orphan clinical row (vitals for a non-existent admission) is rejected
  let fkBlocked = false;
  try { internals.run("INSERT INTO vitals_log (admission_id, recorded_by, recorded_at) VALUES (999999, 1, '2026-06-06T00:00:00Z')"); }
  catch (e) { fkBlocked = true; }
  assert(fkBlocked, 'foreign keys enforced server-side: an orphan vitals row (bad admission_id) is rejected');

  // 9. static path-traversal guard: an encoded ../ escape is rejected (403), not
  //    served. (startsWith(ROOT) used to also accept a sibling like "<root>2".)
  const trav = await fetch(base + '/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
  assert(trav.status === 403, 'path-traversal request (../../etc/passwd) is rejected with 403');
  const ok = await fetch(base + '/index.html');
  assert(ok.status === 200, 'a normal static file still serves (200)');

  // 10. malformed %-encoding must NOT crash the server (raw request; fetch would reject it)
  const port = httpServer.address().port;
  const malformed = await new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/%E0%A4%A', method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', () => resolve('error')); r.end();
  });
  assert(malformed === 400, 'a malformed encoded URL returns 400, not a crash');
  assert((await fetch(base + '/index.html')).status === 200, 'server still serving after the malformed request');

  // 11. FK enforcement extends to MAR (orphan med-admin row rejected)
  let marBlocked = false;
  try { internals.run("INSERT INTO med_admin_records (prescription_id, admission_id, drug_name, dose, route) VALUES (999, 999, 'X', '1', 'PO')"); }
  catch (e) { marBlocked = true; }
  assert(marBlocked, 'FK: an orphan med_admin_records row (bad prescription/admission) is rejected');

  // 11b. FK extends to admissions.dept_id (#11 expanded coverage; the dispensing_log
  //      FK probe lives in 12e, after a real pharmacist exists — the role trigger
  //      would otherwise mask the FK under test).
  let admDeptFkBlocked = false;
  try { internals.run("INSERT INTO admissions (patient_id, dept_id, admitted_at, status) VALUES (?, 999999, '2026-06-06T00:00:00Z', 'active')", [reg.json.patient_id]); }
  catch (e) { admDeptFkBlocked = true; }
  assert(admDeptFkBlocked, 'FK: an admission with a non-existent dept_id is rejected (#11)');

  // 12. setup/HTTP guard helpers
  assert(internals.isLoopback({ socket: { remoteAddress: '127.0.0.1' } }) === true
    && internals.isLoopback({ socket: { remoteAddress: '192.168.1.9' } }) === false, 'isLoopback() distinguishes loopback from LAN (setup is loopback-only)');
  assert(internals.plainHttpAllowed('127.0.0.1', '') === true
    && internals.plainHttpAllowed('0.0.0.0', '') === false
    && internals.plainHttpAllowed('0.0.0.0', '1') === true, 'plain HTTP allowed only on loopback or with OPENWARD_INSECURE_HTTP=1');

  // 12b. per-IP failed-login throttle: the per-ACCOUNT lockout (5/15min) lets one
  // LAN host lock out EVERY staff account (spray 5 bad passwords at each name).
  // 30 failures from one IP must engage the throttle regardless of account.
  assert(internals.ipThrottled('10.0.0.99') === false, 'fresh IP is not throttled');
  for (let i = 0; i < 30; i++) internals.recordIpFail('10.0.0.99');
  assert(internals.ipThrottled('10.0.0.99') === true, '30 failures from one IP engage the per-IP throttle');
  assert(internals.ipThrottled('10.0.0.50') === false, 'other IPs are unaffected');

  // 12c. POSITIONAL-RENAME CREDENTIAL EXFIL on /api/db/query. The bridge strips
  // password_hash/salt by OUTPUT NAME and rejects those names in the SQL text;
  // both are defeated by aliasing the columns. Any staff session (here a NURSE)
  // could read the it_admin's hash+salt. Both vectors must be rejected, and the
  // legit plain-SELECT users read must still return rows with creds stripped.
  const cte = await N('POST', '/api/db/query', { sql: 'WITH x(a,b,c,d,e,f,g,h,i,j,k,l,m) AS (SELECT * FROM users) SELECT * FROM x' });
  assert(cte.status === 400, 'CTE (WITH) credential-rename exfil is rejected (400)');
  const uni = await N('POST', '/api/db/query', { sql: 'SELECT 1 a,2 b,3 c,4 d,5 e,6 f,7 g,8 h,9 i,10 j,11 k,12 l,13 m UNION ALL SELECT * FROM users' });
  assert(uni.status === 400, 'UNION credential-rename exfil is rejected (400)');
  const plain = await N('POST', '/api/db/query', { sql: 'SELECT u.* FROM users u ORDER BY u.user_id LIMIT 1' });
  assert(plain.status === 200 && plain.json.rows.length === 1
    && !('password_hash' in plain.json.rows[0]) && !('salt' in plain.json.rows[0]),
    'legit plain users read still works, with credential columns stripped');

  // 12d. SELF-SERVICE PASSWORD CHANGE. Admin reset means the admin knows the
  // password (breaks individual accountability); staff must be able to rotate
  // their own. Requires the current password, and revokes the user's OTHER
  // sessions so a stolen session doesn't outlive the rotation.
  const pwWrong = await N('POST', '/api/me/password', { current_password: 'wrong-pass', new_password: 'NewNurse#2026' });
  assert(pwWrong.status === 403, 'password change with wrong current password is refused (403)');
  const pwShort = await N('POST', '/api/me/password', { current_password: 'nurse123', new_password: 'short' });
  assert(pwShort.status === 400, 'password change to a <8-char password is refused (400)');
  const N2 = makeClient(base);   // a second session for the same nurse (e.g. another workstation)
  assert((await N2('POST', '/api/login', { username: 'nurse', password: 'nurse123' })).status === 200, 'second nurse session opens');
  const pwOk = await N('POST', '/api/me/password', { current_password: 'nurse123', new_password: 'NewNurse#2026' });
  assert(pwOk.status === 200, 'nurse changes their own password (200)');
  assert((await N2('GET', '/api/me')).status === 401, 'the OTHER nurse session is revoked by the change');
  assert((await N('GET', '/api/me')).status === 200, 'the session that made the change stays valid');
  const NOld = makeClient(base);
  assert((await NOld('POST', '/api/login', { username: 'nurse', password: 'nurse123' })).status === 401, 'old password no longer logs in');
  assert((await NOld('POST', '/api/login', { username: 'nurse', password: 'NewNurse#2026' })).status === 200, 'new password logs in');
  assert(internals.get("SELECT COUNT(*) AS c FROM audit_log WHERE action_type = 'PASSWORD_CHANGED'").c === 1, 'the change is audited (PASSWORD_CHANGED)');

  // 12e. clinical workflow endpoints (#8) + service-role RBAC (#7). Pharmacy and lab
  //      are hospital-wide services (no dept seeded), so create them via the admin API.
  const pharmCreated = await A('POST', '/api/users', { username: 'pharm', password: 'Str0ngPass!', role: 'pharmacist', full_name_en: 'Pharmacist' });
  assert(pharmCreated.status === 201, 'admin creates a pharmacist (#7 service role)');
  assert((await A('POST', '/api/users', { username: 'labtech', password: 'Str0ngPass!', role: 'lab_technician', full_name_en: 'Lab Tech' })).status === 201, 'admin creates a lab technician (#7 service role)');
  const P = makeClient(base), L = makeClient(base);
  assert((await P('POST', '/api/login', { username: 'pharm', password: 'Str0ngPass!' })).status === 200, 'pharmacist logs in');
  assert((await L('POST', '/api/login', { username: 'labtech', password: 'Str0ngPass!' })).status === 200, 'lab technician logs in');
  const activeRx = (await D('GET', '/api/prescriptions?admission_id=' + adm1.admission_id)).json.prescriptions.find(r => r.status === 'active' && r.drug_id === 1);
  assert(activeRx, 'found an active prescription on the dept-1 admission to administer/dispense');

  // 12e-FK. orphan dispensing row rejected by FK — uses the REAL pharmacist id so
  //         trg_dispense_pharmacist passes and the FK is what rejects (#11)
  let dispFkBlocked = false;
  try { internals.run("INSERT INTO dispensing_log (drug_id, patient_id, qty_dispensed, dispensed_by, dispensed_at) VALUES (999999, 999999, 1, ?, '2026-06-06T00:00:00Z')", [pharmCreated.json.user_id]); }
  catch (e) { dispFkBlocked = true; }
  assert(dispFkBlocked, 'FK: an orphan dispensing_log row (bad drug/patient) is rejected (#11)');

  // 12e-a. MAR — bedside administration. er.doc (dept 1) may; the dept-2 nurse may not.
  assert((await D('POST', `/api/prescriptions/${activeRx.rx_id}/administer`, { status: 'given' })).status === 201, 'a bedside clinician records a dose given on its own dept admission (201) (#8 MAR)');
  assert((await N('POST', `/api/prescriptions/${activeRx.rx_id}/administer`, { status: 'given' })).status === 403, 'dept scope: a dept-2 nurse cannot administer on a dept-1 Rx (403) (#8 MAR)');
  assert((await D('POST', `/api/prescriptions/${activeRx.rx_id}/administer`, { status: 'held' })).status === 400, 'holding a dose requires a hold_reason (400) (#8 MAR)');
  assert((await P('POST', `/api/prescriptions/${activeRx.rx_id}/administer`, { status: 'given' })).status === 403, 'a pharmacist cannot record a bedside administration (#7)');

  // 12e-b. Pharmacy dispensing — decrements central stock atomically; not dept-scoped.
  internals.run('UPDATE drugs SET stock_qty = 100 WHERE drug_id = 1');
  assert((await D('POST', `/api/prescriptions/${activeRx.rx_id}/dispense`, { qty: 10 })).status === 403, 'a doctor cannot dispense (pharmacy-only) (#7)');
  const disp = await P('POST', `/api/prescriptions/${activeRx.rx_id}/dispense`, { qty: 10 });
  assert(disp.status === 201 && disp.json.remaining_stock === 90, 'pharmacist dispenses 10 units; central stock decremented to 90 (#8 dispense)');
  assert((await P('POST', `/api/prescriptions/${activeRx.rx_id}/dispense`, { qty: 99999 })).status === 409, 'dispensing more than stock is rejected (409) (#8)');
  assert(internals.get('SELECT stock_qty FROM drugs WHERE drug_id = 1').stock_qty === 90, 'the over-dispense attempt rolled back — stock still 90 (#8 atomic)');

  // 12e-c. Lab result entry — a technician posts a result; doctors cannot enter results.
  const labOrder = await D('POST', '/api/lab-orders', { admission_id: adm1.admission_id, test_name: 'Potassium', priority: 'stat' });
  assert(labOrder.status === 201, 'doctor orders a stat lab to be resulted');
  assert((await D('POST', `/api/lab-orders/${labOrder.json.order_id}/result`, { result_value: '5.0' })).status === 403, 'a doctor cannot enter a lab result (lab-only) (#7)');
  const lres = await L('POST', `/api/lab-orders/${labOrder.json.order_id}/result`, { result_value: '6.8', result_unit: 'mmol/L', is_critical: true });
  assert(lres.status === 200 && lres.json.critical === true, 'lab technician posts a CRITICAL result (#8 lab result)');
  assert((await L('POST', `/api/lab-orders/${labOrder.json.order_id}/result`, { result_value: '6.8' })).status === 409, 're-resulting an already-resulted order is rejected (409) (#8)');

  // 12e-d. Discharge — stops active meds (reconciliation) + frees the bed, atomically.
  assert((await D('POST', `/api/admissions/${adm1.admission_id}/discharge`, {})).status === 400, 'discharge requires a summary — medication reconciliation (400) (#8)');
  const disch = await D('POST', `/api/admissions/${adm1.admission_id}/discharge`, { summary: 'Improved; home with PO meds.' });
  assert(disch.status === 200, 'doctor discharges the admission (200) (#8 discharge)');
  assert(internals.get('SELECT status FROM admissions WHERE admission_id = ?', [adm1.admission_id]).status === 'discharged', 'the admission is marked discharged (#8)');
  assert(internals.get("SELECT COUNT(*) AS c FROM prescriptions WHERE admission_id = ? AND status = 'active'", [adm1.admission_id]).c === 0, 'all active meds were stopped on discharge — reconciliation (#8)');
  assert((await A('POST', '/api/patients', { full_name_ar: 'سرير جديد', dept_id: 1, bed_number: '5' })).status === 201, 'the discharged bed (5/dept 1) is now free to admit into (#8 atomic discharge)');
  const wrows = internals.all('SELECT DISTINCT action_type FROM audit_log').map(r => r.action_type);
  assert(['MED_ADMINISTERED', 'MED_DISPENSED', 'LAB_RESULT_CRITICAL', 'PATIENT_DISCHARGED'].every(a => wrows.includes(a)), 'MAR / dispense / critical-lab / discharge are all audited (#8)');

  // 12f. REAL-TIME PUSH (SSE): /api/events streams {"version":N} on every data
  //      write, so a second workstation refreshes immediately instead of waiting
  //      out the poll interval. Session-gated like /api/db/version.
  assert((await fetch(base + '/api/events')).status === 401, 'SSE: unauthenticated /api/events is denied (401, session gate)');
  {
    // nurse rotated their password in 12d — log in with the CURRENT one
    const lr = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'nurse', password: 'NewNurse#2026' }) });
    const sseCookie = lr.headers.get('set-cookie').split(';')[0];
    let buf = '';
    const sseReq = http.request({ host: '127.0.0.1', port: httpServer.address().port, path: '/api/events', method: 'GET', headers: { Cookie: sseCookie } }, (sres) => {
      sres.setEncoding('utf8');
      sres.on('data', (c) => { buf += c; });
    });
    sseReq.end();
    const versionsSeen = () => buf.split('\n').filter(l => l.startsWith('data: ')).map(l => { try { return JSON.parse(l.slice(6)).version; } catch (e) { return null; } }).filter(v => v !== null);
    const waitFor = (pred, ms) => new Promise((resolve) => { const t0 = Date.now(); const iv = setInterval(() => { if (pred() || Date.now() - t0 > ms) { clearInterval(iv); resolve(pred()); } }, 25); });
    assert(await waitFor(() => versionsSeen().length >= 1, 2000), 'SSE: connecting delivers the current version as a baseline');
    const v0 = versionsSeen()[versionsSeen().length - 1];
    // a BRIDGE write on "another device" (the nurse client) must push an event
    await N('POST', '/api/db/exec', { sql: 'UPDATE drugs SET stock_qty = 55 WHERE drug_id = 1', params: [] });
    assert(await waitFor(() => versionsSeen().some(v => v > v0), 2000), 'SSE: a bridge write pushes a new version to connected workstations (real-time edit propagation)');
    const v1 = versionsSeen()[versionsSeen().length - 1];
    // a DEDICATED-endpoint write must push too (not just the bridge)
    await A('POST', '/api/departments', { name_en: 'Push Test Ward', name_ar: 'جناح الدفع', type: 'ward' });
    assert(await waitFor(() => versionsSeen().some(v => v > v1), 2000), 'SSE: a dedicated-endpoint write (create department) pushes a new version too');
    sseReq.destroy();   // hang up the stream
  }

  // 12g. backups: consistent snapshot, PHI-tight perms, retention prune, RBAC'd endpoint
  {
    assert((await N('POST', '/api/admin/backup')).status === 403, 'backup: nurse cannot trigger a manual backup (403)');
    assert((await X('POST', '/api/admin/backup')).status === 401 || (await X('POST', '/api/admin/backup')).status === 403, 'backup: unauthenticated cannot trigger a backup');
    const bk = await A('POST', '/api/admin/backup');
    assert(bk.status === 200 && /^openward-.+\.sqlite$/.test(bk.json.file), 'backup: it_admin manual backup returns a snapshot filename');
    const bkPath = path.join(internals.BACKUP_DIR, bk.json.file);
    const head = fs.readFileSync(bkPath).slice(0, 16).toString('latin1');
    assert(head.startsWith('SQLite format 3'), 'backup: snapshot file is a real SQLite database');
    const audited = internals.get("SELECT 1 AS x FROM audit_log WHERE action_type = 'BACKUP_CREATED'");
    assert(!!audited, 'backup: manual backup writes a BACKUP_CREATED audit row');
    // retention: seed BACKUP_KEEP+5 older dummies, then one runBackup() must prune to the cap
    for (let i = 0; i < internals.BACKUP_KEEP + 5; i++) {
      fs.writeFileSync(path.join(internals.BACKUP_DIR, `openward-0000-00-00-00-00-${String(i).padStart(2, '0')}.sqlite`), 'x');
    }
    internals.runBackup();
    const left = fs.readdirSync(internals.BACKUP_DIR).filter(f => /^openward-.+\.sqlite$/.test(f));
    assert(left.length <= internals.BACKUP_KEEP, `backup: retention prunes to OPENWARD_BACKUP_KEEP (${left.length} <= ${internals.BACKUP_KEEP})`);
    assert(!left.includes('openward-0000-00-00-00-00-00.sqlite'), 'backup: prune removes the OLDEST snapshots first');
  }

  // 12h. static caching: ETag revalidation + gzip (static files hold no PHI;
  //      /api responses stay no-store — asserted in section 4)
  {
    const rawReq = (p, hdrs) => new Promise((resolve) => {
      const r = http.request({ host: '127.0.0.1', port: httpServer.address().port, path: p, method: 'GET', headers: hdrs || {} }, (res) => {
        const chunks = []; res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      r.on('error', () => resolve({ status: 'error', headers: {}, body: Buffer.alloc(0) })); r.end();
    });
    const first = await rawReq('/js/router.js');
    assert(first.status === 200 && !!first.headers.etag && first.headers['cache-control'] === 'no-cache', 'static: 200 with ETag + no-cache (browsers revalidate instead of re-downloading)');
    const second = await rawReq('/js/router.js', { 'If-None-Match': first.headers.etag });
    assert(second.status === 304 && second.body.length === 0, 'static: If-None-Match returns 304 with empty body');
    const gz = await rawReq('/js/router.js', { 'Accept-Encoding': 'gzip' });
    assert(gz.headers['content-encoding'] === 'gzip' && gz.body.length < first.body.length / 2, `static: gzip shrinks router.js (${first.body.length} -> ${gz.body.length} bytes)`);
    assert(gz.headers.etag !== first.headers.etag && /-gz/.test(gz.headers.etag), 'static: gzip and identity representations carry DIFFERENT ETags (RFC 9110 — no cross-encoding 304 reuse)');
    const gz304 = await rawReq('/js/router.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': gz.headers.etag });
    assert(gz304.status === 304, 'static: gzip-variant ETag revalidates to 304 for gzip clients');
  }

  // 13. audit chain VERIFICATION (must be last: it tampers with the audit log).
  //     The chain is only tamper-evident if an operator can check it.
  assert((await N('GET', '/api/audit/verify')).status === 403, 'nurse is forbidden from /api/audit/verify (403)');
  const vClean = await A('GET', '/api/audit/verify');
  assert(vClean.status === 200 && vClean.json.valid === true && vClean.json.rows >= 3, 'verify: untouched chain is VALID');
  // tamper: edit one row's detail directly in the DB (key lives outside the DB,
  // so the attacker cannot recompute a valid HMAC)
  const origDetail = internals.get('SELECT action_detail FROM audit_log WHERE log_id = 2').action_detail;
  internals.run("UPDATE audit_log SET action_detail = 'tampered by insider' WHERE log_id = 2");
  const vTampered = await A('GET', '/api/audit/verify');
  assert(vTampered.json.valid === false && vTampered.json.broken_at === 2 && /row_hash/.test(vTampered.json.reason), 'verify flags an edited audit row (broken_at 2, row_hash mismatch)');
  internals.run('UPDATE audit_log SET action_detail = ? WHERE log_id = 2', [origDetail]);   // restore the exact original — chain whole again
  // tail truncation: delete the newest row; the AUTOINCREMENT sequence betrays it
  const lastLog = internals.get('SELECT MAX(log_id) AS m FROM audit_log').m;
  internals.run('DELETE FROM audit_log WHERE log_id = ?', [lastLog]);
  const vTrunc = await A('GET', '/api/audit/verify');
  assert(vTrunc.json.valid === false && /truncated/.test(vTrunc.json.reason), 'verify flags deletion of the newest audit row (tail truncation via sequence)');

  httpServer.close();
  try { fs.rmSync(process.env.OPENWARD_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
