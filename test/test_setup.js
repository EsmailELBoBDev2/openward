'use strict';
// First-run admin setup with NO demo seed: /api/setup creates the initial it_admin
// while the users table is empty, then closes; the new admin can log in. Proves the
// "no default credentials" path (#5).
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.OPENWARD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-setup-'));
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
delete process.env.OPENWARD_DEMO;   // ensure NO demo accounts are seeded

const server = require('../server/server.js');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }
function makeClient(base) {
  let cookie = '';
  return async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}), body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  };
}

(async () => {
  await server.init();
  const httpServer = server.start();
  if (!httpServer.listening) await new Promise(r => httpServer.once('listening', r));
  const C = makeClient(`http://127.0.0.1:${httpServer.address().port}`);

  const h = await C('GET', '/api/health');
  assert(h.status === 200 && h.json.needsSetup === true && h.json.demo === false, 'fresh server (no DEMO) reports needsSetup=true');
  assert((await C('POST', '/api/login', { username: 'admin', password: 'HIS@2024' })).status === 401, 'no default admin exists (login fails)');
  assert((await C('POST', '/api/setup', { username: 'root', password: 'short' })).status === 400, 'setup rejects a weak (<8) password');
  assert((await C('POST', '/api/setup', { username: 'root', password: 'Str0ngPass!', full_name_en: 'Root Admin' })).status === 201, 'first-run setup creates the initial it_admin (201)');
  assert((await C('POST', '/api/setup', { username: 'root2', password: 'Str0ngPass!' })).status === 409, 'setup is closed after the first account (409)');
  const login = await C('POST', '/api/login', { username: 'root', password: 'Str0ngPass!' });
  assert(login.status === 200 && login.json.user.role === 'it_admin', 'the setup-created admin logs in as it_admin');
  assert((await C('GET', '/api/health')).json.needsSetup === false, 'health now reports setup complete');

  // #2: reference data (departments + formulary) must exist even WITHOUT demo mode,
  // otherwise a fresh production server can't admit or prescribe.
  const I = server._internals();
  assert(I.get('SELECT COUNT(*) AS c FROM departments').c > 0, 'reference seed: departments exist without demo mode');
  assert(I.get('SELECT COUNT(*) AS c FROM drugs').c > 0, 'reference seed: starter formulary exists without demo mode');

  httpServer.close();
  try { fs.rmSync(process.env.OPENWARD_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
