// Audit-log integrity: delimiter canonicalization (#1), no-'COMPUTING' +
// serialized writes (#2), and the external receipt. Real blackbox.js + sql.js.
const path = require('path');
const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

let db;
global.nowISO = () => new Date().toISOString();
global.saveDBToIndexedDB = () => {};
global.sha256 = async (str) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
global.dbAll = (sql, p) => { const r = db.exec(sql, p); if (!r.length) return []; const c = r[0].columns; return r[0].values.map(row => { const o = {}; c.forEach((cc, i) => o[cc] = row[i]); return o; }); };
global.dbGet = (sql, p) => { const r = global.dbAll(sql, p); return r.length ? r[0] : null; };
global.dbRun = (sql, p) => db.run(sql, p);
global.dbLastId = () => db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
const bb = require(path.resolve('js/blackbox.js'));

function freshDb(SQL) {
  db = new SQL.Database();
  db.run(`CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, user_id INTEGER,
    user_name_en TEXT, user_name_ar TEXT, user_role TEXT, dept_id INTEGER, dept_name_en TEXT, dept_name_ar TEXT,
    patient_id INTEGER, patient_name TEXT, patient_mrn TEXT, action_type TEXT, action_detail TEXT,
    action_detail_ar TEXT, ip_address TEXT, prev_hash TEXT, row_hash TEXT)`);
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });

  // 1) #1 — canonicalization: shifting a '|' between fields collides in the OLD
  //    format but NOT in the canonical one.
  // Real collision shape: a '|' inside a field. (type='A', detail='B|C') and
  // (type='A|B', detail='C') both join to "...|A|B|C|..." in the legacy format.
  assert(bb._legacyHashInput(1, 't', 1, 'A', 'B|C', 'p') === bb._legacyHashInput(1, 't', 1, 'A|B', 'C', 'p'),
    'legacy "|" format COLLIDES when a field contains "|" (the bug)');
  assert(bb._canonicalHashInput('t', 1, 'A', 'B|C', 'p') !== bb._canonicalHashInput('t', 1, 'A|B', 'C', 'p'),
    'canonical JSON format does NOT collide (the fix)');

  // 2) #2 — normal writes: valid chain, and no row is ever left as 'COMPUTING'
  freshDb(SQL);
  for (let i = 1; i <= 4; i++) await bb.logToBlackbox({ user_id: 1, action_type: 'CHART', action_detail: 'entry ' + i });
  assert((await bb.verifyBlackboxIntegrity()).valid, 'chain valid after sequential writes');
  assert(global.dbAll("SELECT COUNT(*) c FROM audit_log WHERE row_hash='COMPUTING'")[0].c === 0, "no row persisted as 'COMPUTING'");

  // 3) #2 — concurrency: fire writes WITHOUT awaiting each; the lock must serialize
  //    them into one unbroken chain (no fork on a shared prev_hash).
  freshDb(SQL);
  await Promise.all([1, 2, 3, 4, 5, 6].map(i => bb.logToBlackbox({ user_id: i, action_type: 'CONCURRENT', action_detail: 'c' + i })));
  const v = await bb.verifyBlackboxIntegrity();
  assert(v.valid && v.totalRows === 6, 'six concurrent writes -> one valid 6-row chain (no fork)');
  assert(global.dbAll("SELECT COUNT(*) c FROM audit_log WHERE row_hash='COMPUTING'")[0].c === 0, 'concurrent writes leave no COMPUTING row');

  // 4) receipt catches a rewrite-and-recompute that internal verification passes
  freshDb(SQL);
  for (let i = 1; i <= 4; i++) await bb.logToBlackbox({ user_id: 1, action_type: 'CHART', action_detail: 'real ' + i });
  const receipt = bb.getIntegrityReceipt();
  assert((await bb.verifyAgainstReceipt(receipt)).matchesReceipt === true, 'untampered chain matches receipt');
  // attacker rewrites row 2 and recomputes downstream with the (current) canonical format
  db.run("UPDATE audit_log SET action_detail='FORGED' WHERE log_id=2");
  const rows = global.dbAll('SELECT * FROM audit_log ORDER BY log_id ASC');
  let prev = rows[0].row_hash;
  for (let i = 1; i < rows.length; i++) {
    const r2 = rows[i];
    const h = await global.sha256(bb._canonicalHashInput(r2.timestamp, r2.user_id, r2.action_type, r2.action_detail, prev));
    db.run('UPDATE audit_log SET prev_hash=?, row_hash=? WHERE log_id=?', [prev, h, r2.log_id]);
    prev = h;
  }
  assert((await bb.verifyBlackboxIntegrity()).valid === true, 'recomputed chain still passes internal verification (keyless weakness)');
  const r = await bb.verifyAgainstReceipt(receipt);
  assert(r.matchesReceipt === false, 'receipt CATCHES the recompute internal verification missed');

  // 5) truncation caught
  db.run('DELETE FROM audit_log WHERE log_id=4');
  assert((await bb.verifyAgainstReceipt(receipt)).matchesReceipt === false, 'receipt catches truncation');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
