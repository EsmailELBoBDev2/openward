// Validates the DB-backed brute-force logic (auth.js) against the real sql.js
// engine the app ships. Replicates the lockout functions faithfully (minus the
// browser-only saveDBToIndexedDB) and asserts behavior.
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

  // --- db wrappers (mirror db.js) ---
  function dbAll(sql, params) {
    const r = db.exec(sql, params);
    if (!r.length) return [];
    const cols = r[0].columns;
    return r[0].values.map(row => { const o = {}; cols.forEach((c, i) => o[c] = row[i]); return o; });
  }
  function dbGet(sql, params) { const r = dbAll(sql, params); return r.length ? r[0] : null; }
  function dbRun(sql, params) { db.run(sql, params); }

  // --- schema (mirror the new login_attempts DDL) ---
  db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account    TEXT NOT NULL,
    attempt_ms INTEGER NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_login_attempts_acct ON login_attempts(account, attempt_ms)');

  // --- lockout logic (faithful copy of auth.js, sans saveDBToIndexedDB) ---
  const MAX_FAILED_ATTEMPTS = 5, MAX_GLOBAL_ATTEMPTS = 30;
  const LOCKOUT_WINDOW_MS = 5 * 60 * 1000, LOCKOUT_DURATION_MS = 5 * 60 * 1000;
  function _pruneOldAttempts(now) { try { dbRun('DELETE FROM login_attempts WHERE attempt_ms < ?', [now - LOCKOUT_WINDOW_MS]); } catch (e) {} }
  function _isLockedOut(account) {
    const now = Date.now();
    _pruneOldAttempts(now);
    const rows = dbAll('SELECT attempt_ms FROM login_attempts WHERE account = ? ORDER BY attempt_ms', [account]);
    if (rows.length >= MAX_FAILED_ATTEMPTS) {
      const lastFail = rows[rows.length - 1].attempt_ms;
      if (now - lastFail < LOCKOUT_DURATION_MS) return Math.ceil((LOCKOUT_DURATION_MS - (now - lastFail)) / 1000);
    }
    const g = dbGet('SELECT COUNT(*) AS c FROM login_attempts', []);
    if (g && g.c >= MAX_GLOBAL_ATTEMPTS) return Math.ceil(LOCKOUT_DURATION_MS / 1000);
    return 0;
  }
  function _recordFailedLogin(account) { try { dbRun('INSERT INTO login_attempts (account, attempt_ms) VALUES (?, ?)', [account, Date.now()]); } catch (e) {} }
  function _clearFailedAttempts(account) { try { dbRun('DELETE FROM login_attempts WHERE account = ?', [account]); } catch (e) {} }
  const clearAll = () => dbRun('DELETE FROM login_attempts');

  // (a) 4 fails → not locked
  clearAll();
  for (let i = 0; i < 4; i++) _recordFailedLogin('alice');
  assert(_isLockedOut('alice') === 0, '4 failed attempts: not locked');

  // (b) 5th fail → locked, remaining within (0, 300]
  _recordFailedLogin('alice');
  const sec = _isLockedOut('alice');
  assert(sec > 0 && sec <= 300, '5th failed attempt: locked, ' + sec + 's remaining (<=300)');

  // (c) clear → unlocked
  _clearFailedAttempts('alice');
  assert(_isLockedOut('alice') === 0, 'after clear: unlocked');

  // (d) global cap: 30 distinct accounts, 1 each → a fresh account is globally locked
  clearAll();
  for (let i = 0; i < 30; i++) _recordFailedLogin('acct' + i);
  assert(_isLockedOut('fresh-never-tried') > 0, 'global cap (30): fresh account is locked out');

  // (e) prune: an attempt older than the 5-min window is deleted and ignored
  clearAll();
  dbRun('INSERT INTO login_attempts (account, attempt_ms) VALUES (?, ?)', ['bob', Date.now() - 6 * 60 * 1000]);
  assert(_isLockedOut('bob') === 0, 'stale attempt (6 min old): not locked');
  const leftover = dbGet("SELECT COUNT(*) AS c FROM login_attempts WHERE account = 'bob'", []);
  assert(leftover.c === 0, 'stale attempt pruned from table');

  // (f) namespace: patient MRN key and a same-string username do not collide
  clearAll();
  for (let i = 0; i < 5; i++) _recordFailedLogin('patient:HIS-1');
  assert(_isLockedOut('patient:HIS-1') > 0, 'patient portal account locks after 5');
  assert(_isLockedOut('HIS-1') === 0, 'staff username "HIS-1" not affected by patient:HIS-1 lockout');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
