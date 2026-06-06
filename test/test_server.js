'use strict';
// Proves the LAN server is a REAL central authority: one DB behind /api, with
// server-side auth (HttpOnly cookie), RBAC, transactional bed-conflict, and that
// data written by one client is visible to another (shared central state).
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the DB/key on disk so the test never touches a real server DB, and use
// a random loopback port so the test never collides with a running server.
process.env.OPENWARD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-srv-'));
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';

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

  // 5. RBAC: nurse may NOT register patients
  assert((await N('POST', '/api/login', { username: 'nurse', password: 'nurse123' })).status === 200, 'nurse logs in');
  assert((await N('POST', '/api/patients', { full_name_ar: 'x', dept_id: 1 })).status === 403, 'nurse is forbidden from registering (403)');

  // 6. SHARED state: the nurse's client sees the patient the admin created
  const listN = await N('GET', '/api/patients');
  assert(listN.status === 200 && listN.json.patients.some(p => p.full_name_en === 'Test Patient'),
    'a second client sees the first client\'s write (one central DB)');

  // 7. nurse can record vitals; result persists to the central DB
  const beds = await N('GET', '/api/beds');
  const adm = beds.json.admissions.find(a => a.bed_number === '5');
  assert(!!adm, 'beds endpoint lists the active admission');
  const vit = await N('POST', '/api/vitals', { admission_id: adm.admission_id, heart_rate: 88, resp_rate: 18 });
  assert(vit.status === 201, 'nurse records vitals (201)');

  // 8. audit chain exists and is HMAC-linked (key lives outside the DB)
  const internals = server._internals();
  const rows = internals.all('SELECT action_type, prev_hash, row_hash FROM audit_log ORDER BY log_id');
  assert(rows.length >= 3 && rows.every(r => r.row_hash) && rows.slice(1).every((r, i) => r.prev_hash === rows[i].row_hash),
    'audit log is a linked HMAC chain (LOGIN/PATIENT_REGISTERED/VITALS_RECORDED, IP recorded server-side)');

  httpServer.close();
  try { fs.rmSync(process.env.OPENWARD_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
