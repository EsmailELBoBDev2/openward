// End-to-end: real sql.js DB -> export -> encrypt (save path) -> decrypt
// (boot-unlock path) -> reopen in a fresh sql.js DB. Proves encryption at rest
// preserves the actual database and that a wrong passphrase blocks reopening.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
const c = require(path.resolve('js/crypto-store.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ok  - ' + msg); } else { fail++; console.error('  FAIL- ' + msg); } }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });

  // 1) Build a DB with known clinical data (mirrors the app schema-ish)
  const db1 = new SQL.Database();
  db1.run('CREATE TABLE patients (patient_id INTEGER PRIMARY KEY, full_name_en TEXT, mrn TEXT)');
  db1.run("INSERT INTO patients (full_name_en, mrn) VALUES ('Fatima Al-Sayed', 'HIS-20260518-00028')");
  db1.run('CREATE TABLE login_attempts (attempt_id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT, attempt_ms INTEGER)');
  const exported = db1.export();

  // 2) SAVE path: encryption active -> encrypt the exported blob
  await c.encEnable('ICU-ward-passphrase-2026');
  const envelope = await c.encEncrypt(exported);
  assert(c.encIsEnvelope(envelope), 'save path: produces an encrypted envelope');

  // 3) Simulate a page reload: a fresh session has no key (memory cleared)
  c.encDisable();
  assert(c.encIsActive() === false, 'after reload the session key is gone (must unlock)');

  // 4) BOOT-UNLOCK path: correct passphrase -> decrypt -> reopen in fresh sql.js
  await c.encUnlock('ICU-ward-passphrase-2026', envelope.salt);
  const decrypted = await c.encDecrypt(envelope);
  const db2 = new SQL.Database(new Uint8Array(decrypted));
  const row = db2.exec("SELECT full_name_en, mrn FROM patients WHERE patient_id=1");
  assert(row.length && row[0].values[0][0] === 'Fatima Al-Sayed', 'reopened DB preserves patient name');
  assert(row[0].values[0][1] === 'HIS-20260518-00028', 'reopened DB preserves MRN');
  // confirm the new login_attempts table also survived (schema intact)
  const tbls = db2.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const names = tbls[0].values.map(v => v[0]);
  assert(names.includes('patients') && names.includes('login_attempts'), 'full schema survives the encrypt/decrypt cycle');

  // 5) A WRONG passphrase cannot reopen the DB at all
  c.encDisable();
  await c.encUnlock('attacker-guess', envelope.salt);
  let blocked = false;
  try { await c.encDecrypt(envelope); } catch (e) { blocked = true; }
  assert(blocked, 'stolen blob + wrong passphrase: cannot decrypt (data protected at rest)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
