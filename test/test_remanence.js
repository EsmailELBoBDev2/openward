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

  // 5) export() RESETS per-connection pragmas (the bug found live in the
  // preview): one auto-save disarmed secure_delete AND foreign_keys for the
  // rest of the session. Demonstrate the engine behavior, then prove the
  // re-assert restores enforcement.
  const e1 = new SQL.Database();
  e1.run('PRAGMA secure_delete = ON'); e1.run('PRAGMA foreign_keys = ON');
  e1.run('CREATE TABLE p (id INTEGER PRIMARY KEY)');
  e1.run('CREATE TABLE c (id INTEGER PRIMARY KEY, pid INTEGER NOT NULL REFERENCES p(id))');
  let fkBefore = false;
  try { e1.run('INSERT INTO c (pid) VALUES (999)'); } catch (err) { fkBefore = true; }
  assert(fkBefore, 'before export: FK ON rejects a dangling child row');
  e1.export();   // <- silently reopens the handle
  assert(e1.exec('PRAGMA secure_delete')[0].values[0][0] === 0
      && e1.exec('PRAGMA foreign_keys')[0].values[0][0] === 0,
    'export() RESETS secure_delete AND foreign_keys (the engine behavior that caused the live bug)');
  e1.run('PRAGMA secure_delete = ON'); e1.run('PRAGMA foreign_keys = ON');   // the re-assert
  let fkAfter = false;
  try { e1.run('INSERT INTO c (pid) VALUES (999)'); } catch (err) { fkAfter = true; }
  assert(fkAfter, 'after re-assert: FK enforcement is back');

  // 6) SOURCE TIE: the engine demo above only matters if the app actually
  // enables it. Assert db.js still sets the pragmas at boot, gates the
  // one-time VACUUM on user_version, and RE-ASSERTS after every db.export()
  // — reverting that code now fails here.
  const dbSrc = require('fs').readFileSync(path.resolve('js/db.js'), 'utf8');
  assert(/PRAGMA\s+secure_delete\s*=\s*ON/i.test(dbSrc), 'db.js enables PRAGMA secure_delete at boot');
  assert(/PRAGMA\s+foreign_keys\s*=\s*ON/i.test(dbSrc), 'db.js enables PRAGMA foreign_keys (browser FK enforcement)');
  assert(/PRAGMA\s+user_version/i.test(dbSrc) && /VACUUM/.test(dbSrc), 'db.js has the user_version-gated one-time VACUUM');
  // every db.export() call site must be followed by the pragma re-assert
  const exportSites = dbSrc.split('\n').map((l, i) => ({ l, i })).filter(x => /db\.export\(\)/.test(x.l) && !/\/\//.test(x.l.split('db.export()')[0]));
  assert(exportSites.length >= 2, 'found the db.export() call sites in db.js (save + backup)');
  for (const site of exportSites) {
    const after = dbSrc.split('\n').slice(site.i, site.i + 3).join('\n');
    assert(/_reassertConnectionPragmas\(\)/.test(after), `db.export() at db.js line ${site.i + 1} re-asserts connection pragmas`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
