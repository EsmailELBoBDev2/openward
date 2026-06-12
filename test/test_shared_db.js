'use strict';
// Proves the shared-DB bridge (server-authoritative SQL over /api/db/*) that lets
// two devices edit ONE central SQLite in real time. Boots the real server in DEMO
// mode on a throwaway data dir and drives two independent sessions ("devices").
process.env.OPENWARD_DATA_DIR = '/tmp/openward-shared-test/data';
process.env.OPENWARD_DEMO = '1';
process.env.PORT = '8097';
process.env.HOST = '127.0.0.1';

const fs = require('fs');
fs.rmSync('/tmp/openward-shared-test/data', { recursive: true, force: true });
const server = require('../server/server.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
const BASE = 'http://127.0.0.1:8097';

async function req(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  await server.init();
  const httpServer = server.start();
  await new Promise(r => setTimeout(r, 300));

  // Two "devices": a doctor workstation and a nurse workstation, separate sessions.
  const devA = (await req('POST', '/api/login', { username: 'er.doc', password: 'doctor123' })).cookie;
  const devB = (await req('POST', '/api/login', { username: 'nurse', password: 'nurse123' })).cookie;
  assert(/sid=/.test(devA) && /sid=/.test(devB), 'two devices logged in with independent sessions');

  // --- Device A WRITES a patient through the bridge ---
  const v0 = (await req('GET', '/api/db/version', null, devA)).json.version;
  const ins = await req('POST', '/api/db/exec', {
    sql: "INSERT INTO patients (mrn, full_name_ar, full_name_en, gender, blood_type, registered_at) VALUES (?,?,?,?,?,?)",
    params: ['SHARED-1', 'مريض مشترك', 'Shared Patient', 'male', 'O+', new Date().toISOString()],
  }, devA);
  assert(ins.status === 200 && ins.json.lastId > 0, 'device A inserted a patient, got server lastId ' + (ins.json && ins.json.lastId));
  const pid = ins.json.lastId;
  assert(ins.json.version === v0 + 1, 'write bumped the shared version (real-time signal): ' + v0 + ' -> ' + ins.json.version);

  // --- Device B READS it immediately — same DB, no browser-local copy ---
  const readB = await req('POST', '/api/db/query', { sql: 'SELECT patient_id, full_name_en FROM patients WHERE patient_id = ?', params: [pid] }, devB);
  assert(readB.status === 200 && readB.json.rows.length === 1 && readB.json.rows[0].full_name_en === 'Shared Patient',
    "device B sees device A's write instantly (one shared DB)");

  // --- Device B's version poll detects the change ---
  const vB = (await req('GET', '/api/db/version', null, devB)).json.version;
  assert(vB === ins.json.version, 'device B polls the same version -> would refresh its view');

  // --- secret columns are stripped from reads ---
  const u = await req('POST', '/api/db/query', { sql: 'SELECT * FROM users LIMIT 1', params: [] }, devA);
  assert(u.status === 200 && u.json.rows.length === 1, 'can read users table');
  const cols = Object.keys(u.json.rows[0]);
  assert(!cols.includes('password_hash') && !cols.includes('salt'), 'password_hash + salt stripped from bridge reads (no credential leak over the wire)');

  // --- guardrails ---
  assert((await req('POST', '/api/db/query', { sql: 'DELETE FROM patients', params: [] }, devA)).status === 400, 'query endpoint refuses a write');
  assert((await req('POST', '/api/db/exec', { sql: 'SELECT * FROM patients', params: [] }, devA)).status === 400, 'exec endpoint refuses a read');
  assert((await req('POST', '/api/db/exec', { sql: 'DELETE FROM audit_log', params: [] }, devA)).status === 403, 'audit_log is append-only (DELETE refused)');
  assert((await req('POST', '/api/db/exec', { sql: 'DROP TABLE patients', params: [] }, devA)).status === 403, 'schema changes refused via bridge');
  assert((await req('POST', '/api/db/exec', { sql: "INSERT INTO patients (mrn) VALUES ('x'); DROP TABLE patients", params: [] }, devA)).status === 400, 'stacked statements refused');

  // --- no session = no access (a random LAN device cannot read PHI) ---
  assert((await req('POST', '/api/db/query', { sql: 'SELECT * FROM patients', params: [] }, null)).status === 401, 'unauthenticated bridge access blocked');

  // --- session-token theft blocked (could otherwise impersonate any user) ---
  assert((await req('POST', '/api/db/query', { sql: 'SELECT session_id FROM sessions', params: [] }, devA)).status === 400, 'reading the sessions table via the bridge is blocked');
  assert((await req('POST', '/api/db/exec', { sql: "DELETE FROM sessions WHERE 1=1", params: [] }, devA)).status === 400, 'writing the sessions table via the bridge is blocked');

  // --- credential-column read blocked even via alias/expression ---
  assert((await req('POST', '/api/db/query', { sql: 'SELECT password_hash AS x FROM users LIMIT 1', params: [] }, devA)).status === 403, 'aliased password_hash read blocked');
  assert((await req('POST', '/api/db/query', { sql: 'SELECT substr(salt,1,4) FROM users LIMIT 1', params: [] }, devA)).status === 403, 'salt read via expression blocked');

  // --- audit_log append-only: REPLACE / INSERT OR REPLACE cannot rewrite rows ---
  assert((await req('POST', '/api/db/exec', { sql: "INSERT OR REPLACE INTO audit_log (log_id, timestamp, user_id, user_name_en, user_name_ar, user_role, action_type, action_detail, row_hash) VALUES (1,'t',1,'a','b','r','x','y','z')", params: [] }, devA)).status === 403, 'INSERT OR REPLACE into audit_log blocked (append-only)');

  // --- audit_log INSERT still allowed (logAction/logToBlackbox must work in server mode) ---
  assert((await req('POST', '/api/db/exec', {
    sql: 'INSERT INTO audit_log (timestamp, user_id, user_name_en, user_name_ar, user_role, action_type, action_detail, row_hash) VALUES (?,?,?,?,?,?,?,?)',
    params: [new Date().toISOString(), 2, 'ER Doctor', 'طبيب', 'emergency_doctor', 'TEST', 'bridge audit insert', 'deadbeef'],
  }, devA)).status === 200, 'audit_log INSERT (append) still works');

  httpServer.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
