// Demonstrates the SQLite data-remanence leak and the secure_delete / VACUUM fix
// against real sql.js — the same engine the app ships.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

// Does the exported DB blob still physically contain this string anywhere?
function blobContains(u8, str) {
  const n = new TextEncoder().encode(str);
  outer: for (let i = 0; i + n.length <= u8.length; i++) {
    for (let j = 0; j < n.length; j++) if (u8[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const SECRET = 'VIP_DELETED_DIAGNOSIS_zx9q';

  // 1) WITHOUT secure_delete: a deleted row's PHI still sits in the exported blob
  const a = new SQL.Database();
  a.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, t TEXT)');
  a.run("INSERT INTO notes (t) VALUES ('" + SECRET + "')");
  a.run('DELETE FROM notes');
  assert(blobContains(a.export(), SECRET), 'WITHOUT secure_delete: deleted PHI remains in the export (the leak)');

  // 2) WITH secure_delete=ON (set before the delete, as initDB now does): zeroed
  const b = new SQL.Database();
  b.run('PRAGMA secure_delete = ON');
  b.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, t TEXT)');
  b.run("INSERT INTO notes (t) VALUES ('" + SECRET + "')");
  b.run('DELETE FROM notes');
  assert(!blobContains(b.export(), SECRET), 'WITH secure_delete=ON: deleted PHI is zeroed out of the export (fixed)');

  // 3) VACUUM purges PRE-EXISTING remnants (the one-time cleanup for legacy data)
  const c = new SQL.Database();
  c.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, t TEXT)');
  c.run("INSERT INTO notes (t) VALUES ('" + SECRET + "')");
  c.run('DELETE FROM notes');                 // remnant created with no secure_delete
  assert(blobContains(c.export(), SECRET), 'legacy remnant present before VACUUM');
  c.run('VACUUM');
  assert(!blobContains(c.export(), SECRET), 'VACUUM purges the pre-existing remnant');

  // 4) the one-time gate: user_version flips so VACUUM won't run every boot
  const d = new SQL.Database();
  d.run('PRAGMA user_version = 1');
  assert(d.exec('PRAGMA user_version')[0].values[0][0] === 1, 'user_version persists as the one-time VACUUM gate');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
