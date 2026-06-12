// Validates the DB-backed brute-force logic against the real sql.js engine the
// app ships — by evaluating the REAL js/auth.js source (same harness pattern as
// test_logout_purge.js), not a hand-copied reimplementation. Reverting the
// lockout code in auth.js now fails this test.
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok  - ' + msg); }
  else { fail++; console.error('  FAIL- ' + msg); }
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const db = new SQL.Database();

  // --- db wrappers over the REAL engine (mirror db.js) ---
  function dbAll(sql, params) {
    const r = db.exec(sql, params);
    if (!r.length) return [];
    const cols = r[0].columns;
    return r[0].values.map(row => { const o = {}; cols.forEach((c, i) => o[c] = row[i]); return o; });
  }
  function dbGet(sql, params) { const r = dbAll(sql, params); return r.length ? r[0] : null; }
  function dbRun(sql, params) { db.run(sql, params); }

  // --- schema (same login_attempts DDL the app creates) ---
  db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account    TEXT NOT NULL,
    attempt_ms INTEGER NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_login_attempts_acct ON login_attempts(account, attempt_ms)');

  // --- evaluate the REAL auth.js with stubs for its browser globals ---
  const authSrc = fs.readFileSync(path.resolve('js/auth.js'), 'utf8');
  const stubs = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { getElementById: () => null },
    location: { reload: () => {} },
    dbAll, dbGet, dbRun,
    nowISO: () => new Date().toISOString(),
    logToBlackbox: async () => {},
    saveDBToIndexedDB: async () => {},
    encIsActive: () => false,
    encDisable: () => {},
    api: { logout: async () => {} }
  };
  const names = Object.keys(stubs);
  const factory = new Function(...names, authSrc +
    '\n;return { _isLockedOut, _recordFailedLogin, _clearFailedAttempts, MAX_FAILED_ATTEMPTS, MAX_GLOBAL_ATTEMPTS };');
  const auth = factory(...names.map(n => stubs[n]));
  const clearAll = () => dbRun('DELETE FROM login_attempts');

  assert(auth.MAX_FAILED_ATTEMPTS === 5, 'per-account cap is 5 (drift guard)');
  assert(auth.MAX_GLOBAL_ATTEMPTS === 30, 'global cap is 30 (drift guard)');

  // (a) 4 fails → not locked
  clearAll();
  for (let i = 0; i < 4; i++) await auth._recordFailedLogin('alice');
  assert(auth._isLockedOut('alice') === 0, '4 failed attempts: not locked');

  // (b) 5th fail → locked, remaining within (0, 300]
  await auth._recordFailedLogin('alice');
  const sec = auth._isLockedOut('alice');
  assert(sec > 0 && sec <= 300, '5th failed attempt: locked, ' + sec + 's remaining (<=300)');

  // (c) clear → unlocked
  auth._clearFailedAttempts('alice');
  assert(auth._isLockedOut('alice') === 0, 'after clear: unlocked');

  // (d) global cap: 30 distinct accounts, 1 each → a fresh account is globally locked
  clearAll();
  for (let i = 0; i < 30; i++) await auth._recordFailedLogin('acct' + i);
  assert(auth._isLockedOut('fresh-never-tried') > 0, 'global cap (30): fresh account is locked out');

  // (e) prune: an attempt older than the 5-min window is deleted and ignored
  clearAll();
  dbRun('INSERT INTO login_attempts (account, attempt_ms) VALUES (?, ?)', ['bob', Date.now() - 6 * 60 * 1000]);
  assert(auth._isLockedOut('bob') === 0, 'stale attempt (6 min old): not locked');
  const leftover = dbGet("SELECT COUNT(*) AS c FROM login_attempts WHERE account = 'bob'", []);
  assert(leftover.c === 0, 'stale attempt pruned from table');

  // (f) namespace: patient MRN key and a same-string username do not collide
  clearAll();
  for (let i = 0; i < 5; i++) await auth._recordFailedLogin('patient:HIS-1');
  assert(auth._isLockedOut('patient:HIS-1') > 0, 'patient portal account locks after 5');
  assert(auth._isLockedOut('HIS-1') === 0, 'staff username "HIS-1" not affected by patient:HIS-1 lockout');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
