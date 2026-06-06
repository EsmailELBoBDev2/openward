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

  // 7f. finer RBAC (#2): receptionist sees demographics but NOT vitals or meds
  const R = makeClient(base);
  assert((await R('POST', '/api/login', { username: 'reception', password: 'front123' })).status === 200, 'receptionist logs in');
  const rDet = await R('GET', '/api/patients/' + reg.json.patient_id);
  assert(rDet.status === 200 && rDet.json.patient && rDet.json.vitals.length === 0, 'receptionist sees demographics but NOT vitals (#2 view_chart split)');
  assert(rDet.json.admission && !('chief_complaint' in rDet.json.admission), 'receptionist admission is sanitized — no clinical fields (#2)');
  assert('chief_complaint' in det.json.admission, 'a clinical role gets the full admission object (chief_complaint present)');
  assert((await R('GET', '/api/prescriptions?admission_id=' + adm1.admission_id)).status === 403, 'receptionist cannot read prescriptions (#2 view_meds split)');

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

  // 12. setup/HTTP guard helpers
  assert(internals.isLoopback({ socket: { remoteAddress: '127.0.0.1' } }) === true
    && internals.isLoopback({ socket: { remoteAddress: '192.168.1.9' } }) === false, 'isLoopback() distinguishes loopback from LAN (setup is loopback-only)');
  assert(internals.plainHttpAllowed('127.0.0.1', '') === true
    && internals.plainHttpAllowed('0.0.0.0', '') === false
    && internals.plainHttpAllowed('0.0.0.0', '1') === true, 'plain HTTP allowed only on loopback or with OPENWARD_INSECURE_HTTP=1');

  httpServer.close();
  try { fs.rmSync(process.env.OPENWARD_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
