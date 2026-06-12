'use strict';
// Device-encryption key lifecycle on LOGOUT (shared-workstation safety).
//
// crypto-store.js used to keep the session AES key alive across user logouts,
// so on a shared ward workstation the next person inherited a still-decrypting
// app without re-entering the device passphrase. auth.js logout() now:
//   1. awaits the final saveDBToIndexedDB() — the LOGOUT audit row and session
//      delete must be flushed WHILE the key still exists (the save encrypts),
//   2. then encDisable() — key gone,
//   3. then location.reload() — boot path shows the unlock prompt again.
// This test evaluates the real js/auth.js source and asserts that ordering;
// a regression here either loses the last save's encryption (plaintext PHI on
// disk) or quietly resurrects the shared-workstation hole.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const authSrc = fs.readFileSync(path.resolve('js/auth.js'), 'utf8');

// Build a logout() from the real auth.js source with instrumented stubs.
// `encActive` controls whether device encryption is "on" for the scenario.
function makeHarness(opts) {
  opts = opts || {};
  const events = [];
  let encActive = !!opts.encActive;

  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  const sessionRow = {
    session_id: 'sess1', user_id: 1, role: 'nurse', dept_id: 2,
    login_time: new Date(Date.now() - 60 * 1000).toISOString(), expires_at: future
  };
  const stubs = {
    localStorage: {
      getItem: (k) => (k === 'his_session_id' ? 'sess1' : null),
      setItem: () => {},
      removeItem: (k) => { events.push('localStorage.remove:' + k); }
    },
    document: { getElementById: () => null },
    location: { reload: () => { events.push('reload'); } },
    dbGet: (sql) => {
      if (/FROM sessions/.test(sql)) return sessionRow;
      if (/SELECT is_active FROM users/.test(sql)) return { is_active: 1 };
      if (/FROM users/.test(sql)) return { user_id: 1, full_name_en: 'Nurse A', full_name_ar: 'الممرضة أ' };
      if (/FROM departments/.test(sql)) return { name_en: 'ICU', name_ar: 'العناية' };
      return null;
    },
    dbRun: (sql) => { if (/DELETE FROM sessions/.test(sql)) events.push('session-delete'); },
    dbAll: () => [],
    nowISO: () => new Date().toISOString(),
    logToBlackbox: async (e) => { events.push('audit:' + e.action_type); },
    // Records whether the key was still available AT SAVE TIME — the property
    // the whole ordering exists to protect. Async gap mimics the real
    // IndexedDB write so a missing `await` in logout() reorders the events.
    saveDBToIndexedDB: async () => {
      events.push(encActive ? 'save:encrypted' : 'save:plaintext');
      await new Promise(r => setImmediate(r));
      events.push('save:done');
    },
    encIsActive: () => encActive,
    encDisable: () => { encActive = false; events.push('encDisable'); },
    api: { logout: async () => { events.push('api.logout'); } }
  };

  const names = Object.keys(stubs);
  const head = opts.serverMode ? ';const SERVER_MODE = true;\n' : '';
  const factory = new Function(...names, head + authSrc + '\n;return { logout };');
  const api = factory(...names.map(n => stubs[n]));
  return { logout: api.logout, events };
}

(async () => {
  // --- Scenario 1: local mode, device encryption ACTIVE -> purge + reload ---
  const enc = makeHarness({ encActive: true });
  await enc.logout();
  const ev = enc.events;
  const idx = (e) => ev.indexOf(e);
  assert(idx('audit:LOGOUT') !== -1, 'logout writes the LOGOUT audit row');
  assert(idx('save:encrypted') !== -1, 'final save runs while the key is STILL available (encrypted, not plaintext)');
  assert(idx('save:done') !== -1 && idx('encDisable') !== -1 && idx('save:done') < idx('encDisable'),
    'key purge waits for the final save to COMPLETE (audit row persisted encrypted)');
  assert(idx('reload') !== -1 && idx('encDisable') < idx('reload'),
    'key is purged before the reload (unreachable during page teardown)');
  assert(idx('audit:LOGOUT') < idx('save:done'), 'audit row is written before the final flush');
  assert(idx('session-delete') !== -1, 'session row is deleted');

  // --- Scenario 2: local mode, encryption OFF -> no purge, no reload ---
  const plain = makeHarness({ encActive: false });
  await plain.logout();
  assert(plain.events.indexOf('save:done') !== -1, 'unencrypted logout still flushes the final save');
  assert(plain.events.indexOf('encDisable') === -1 && plain.events.indexOf('reload') === -1,
    'no key purge / reload when device encryption is not active');

  // --- Scenario 3: server mode -> early return, never touches the key path ---
  const srv = makeHarness({ encActive: true, serverMode: true });
  await srv.logout();
  assert(srv.events.indexOf('api.logout') !== -1, 'server mode logs out via /api');
  assert(srv.events.indexOf('reload') === -1 && srv.events.indexOf('encDisable') === -1,
    'server mode does not reload or touch the local encryption key');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
