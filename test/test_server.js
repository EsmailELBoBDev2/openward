'use strict';
// Slice-1 backend tests: schema/FK/constraints, scrypt auth, sessions +
// revocation, server-side throttling, HMAC audit chain, RBAC, and a live HTTP
// integration proving the trust boundary (401/403/200, cookie session, logout).
// Run with: node --experimental-sqlite test/test_server.js
const path = require('path');
const http = require('http');
const S = (m) => require(path.join(__dirname, '..', 'server', m));
const { openDb } = S('db.js');
const auth = S('auth.js');
const rbac = S('rbac.js');
const audit = S('audit.js');
const { createServer } = S('http.js');
const crypto = require('crypto');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

// tiny HTTP client with cookie capture
function req(port, { method = 'GET', path: p = '/', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => {
        const sc = res.headers['set-cookie']; let setCookie = null;
        if (sc) { const m = sc[0].match(/ow_sid=([^;]*)/); if (m) setCookie = 'ow_sid=' + m[1]; }
        let json = null; try { json = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, json, setCookie });
      }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  const PW = 'correct-horse-battery-staple';

  // ---- schema / integrity ----
  {
    const db = openDb(':memory:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert(['users', 'sessions', 'audit_log', 'patients', 'admissions', 'login_attempts'].every(t => tables.includes(t)),
      'fresh in-memory DB has the full schema (one applySchema path)');
    assert(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value === '1', 'schema_version recorded');
    const pid = db.prepare("INSERT INTO patients(mrn,full_name,created_at) VALUES('M1','A','t')").run().lastInsertRowid;
    assert(threw(() => db.prepare("INSERT INTO admissions(patient_id,status,admitted_at) VALUES(9999,'active','t')").run()),
      'FK enforced: admission for nonexistent patient is rejected');
    db.prepare("INSERT INTO admissions(patient_id,status,admitted_at) VALUES(?, 'active','t')").run(pid);
    assert(threw(() => db.prepare("INSERT INTO admissions(patient_id,status,admitted_at) VALUES(?, 'active','t')").run(pid)),
      'partial unique index: a second ACTIVE admission per patient is rejected');
  }

  // ---- password KDF ----
  {
    const h = auth.hashPassword(PW);
    assert(h.startsWith('scrypt$'), 'password hashed with scrypt KDF (not raw SHA-256)');
    assert(auth.verifyPassword(PW, h) === true, 'correct password verifies');
    assert(auth.verifyPassword('wrong', h) === false, 'wrong password rejected');
  }

  // ---- users / sessions / revocation ----
  {
    const db = openDb(':memory:');
    assert(threw(() => auth.createUser(db, { username: 'x', password: 'short', role: 'nurse' })), 'createUser rejects <12-char password');
    const uid = auth.createUser(db, { username: 'nora', password: PW, role: 'nurse', department_id: 3 });
    const sid = auth.createSession(db, uid);
    assert(auth.getSessionUser(db, sid).username === 'nora', 'valid session resolves to the user');
    auth.setUserActive(db, uid, false);
    assert(auth.getSessionUser(db, sid) === null, 'disabling a user revokes live sessions on next request');
    const sid2 = auth.createSession(db, uid); // (user still disabled)
    assert(auth.getSessionUser(db, sid2) === null, 'no session for a disabled user');
    auth.setUserActive(db, uid, true);
    const sid3 = auth.createSession(db, uid);
    auth.destroySession(db, sid3);
    assert(auth.getSessionUser(db, sid3) === null, 'destroyed session is gone');
  }

  // ---- server-side throttling ----
  {
    const db = openDb(':memory:');
    for (let i = 0; i < 4; i++) auth.recordAttempt(db, 'mallory', false);
    assert(auth.isLockedOut(db, 'mallory') === 0, '4 failures: not locked');
    auth.recordAttempt(db, 'mallory', false);
    assert(auth.isLockedOut(db, 'mallory') > 0, '5th failure: locked out (server-side)');
  }

  // ---- audit HMAC chain (key outside the DB) ----
  {
    const db = openDb(':memory:');
    const key = crypto.randomBytes(32);
    for (let i = 1; i <= 3; i++) audit.appendAudit(db, key, { user_id: 1, action: 'TEST', detail: 'e' + i });
    assert(audit.verifyAuditChain(db, key).valid, 'fresh audit chain verifies');
    db.prepare("UPDATE audit_log SET detail='FORGED' WHERE log_id=2").run();
    assert(audit.verifyAuditChain(db, key).valid === false, 'tampered row breaks the chain');
    // re-run with a DIFFERENT key (an attacker without the key) cannot forge:
    const forgeKey = crypto.randomBytes(32);
    const db2 = openDb(':memory:'); audit.appendAudit(db2, key, { user_id: 1, action: 'A', detail: 'x' });
    assert(audit.verifyAuditChain(db2, forgeKey).valid === false, 'wrong HMAC key fails verification (key is the secret)');
  }

  // ---- RBAC matrix ----
  assert(rbac.can('nurse', 'vitals:write') && !rbac.can('nurse', 'audit:read'), 'RBAC: nurse can chart vitals, cannot read audit');
  assert(rbac.can('it_admin', 'users:manage') && rbac.can('hospital_manager', 'audit:read'), 'RBAC: admin/manager capabilities');
  assert(rbac.patientScopeWhere({ role: 'doctor', user_id: 7 }).sql.includes('attending_id'), 'ABAC: doctor scoped to their patients');
  assert(rbac.patientScopeWhere({ role: 'it_admin' }).sql === '1=1', 'ABAC: admin sees all');

  // ---- live HTTP integration (the trust boundary) ----
  {
    const db = openDb(':memory:');
    const key = crypto.randomBytes(32);
    const docId = auth.createUser(db, { username: 'drwho', password: PW, role: 'doctor' });
    auth.createUser(db, { username: 'pharma', password: PW, role: 'pharmacist' });
    const p1 = db.prepare("INSERT INTO patients(mrn,full_name,created_at) VALUES('MRN1','Pat One','t')").run().lastInsertRowid;
    db.prepare("INSERT INTO admissions(patient_id,attending_id,status,admitted_at) VALUES(?,?, 'active','t')").run(p1, docId);

    const server = createServer({ db, auditKey: key, staticDir: path.join(__dirname, '..') });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
      assert((await req(port, { method: 'GET', path: '/api/me' })).status === 401, 'unauthenticated /api/me -> 401');
      assert((await req(port, { method: 'POST', path: '/api/login', body: { username: 'drwho', password: 'nope' } })).status === 401, 'bad password -> 401');

      const login = await req(port, { method: 'POST', path: '/api/login', body: { username: 'drwho', password: PW } });
      assert(login.status === 200 && login.setCookie, 'login -> 200 + HttpOnly session cookie');
      const cookie = login.setCookie;

      const me = await req(port, { method: 'GET', path: '/api/me', cookie });
      assert(me.status === 200 && me.json.user.username === 'drwho', 'authenticated /api/me -> 200');

      const pats = await req(port, { method: 'GET', path: '/api/patients', cookie });
      assert(pats.status === 200 && pats.json.patients.length === 1, "doctor sees only their attending patient (server-side scope)");

      const adminTry = await req(port, { method: 'GET', path: '/api/audit', cookie });
      assert(adminTry.status === 403, 'doctor hitting /api/audit -> 403 (RBAC enforced server-side)');

      // pharmacist: can read patients, not audit
      const pl = await req(port, { method: 'POST', path: '/api/login', body: { username: 'pharma', password: PW } });
      assert((await req(port, { method: 'GET', path: '/api/audit', cookie: pl.setCookie })).status === 403, 'pharmacist /api/audit -> 403');

      const out = await req(port, { method: 'POST', path: '/api/logout', cookie });
      assert(out.status === 200, 'logout -> 200');
      assert((await req(port, { method: 'GET', path: '/api/me', cookie })).status === 401, 'session invalid after logout');
    } finally {
      await new Promise(r => server.close(r));
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
