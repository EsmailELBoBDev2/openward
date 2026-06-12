'use strict';
// Fresh-install SEED regression test.
//
// A clean first boot runs createAllTables() + applySchemaMigrations() + the FULL
// demo seed. The seed has broken before in a way only a live browser caught:
// discharging Omar BEFORE inserting his historical prescriptions/labs made the
// discharge-protection triggers abort the seed ("Cannot create prescription on a
// discharged admission"), and every fresh install booted with a half-seeded DB
// (masked on reload by the previous good copy in IndexedDB). Node tests never ran
// seedData, so nothing guarded it — this test closes that gap by evaluating the
// real browser sources and running the complete seed on a brand-new sql.js DB.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

(async () => {
  const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });

  // Evaluate the browser sources in one shared scope (seedData lives in db.js
  // file scope and calls helpers from utils.js / lang.js at runtime).
  const code = ['js/lang.js', 'js/utils.js', 'js/allergy-check.js', 'js/db.js']
    .map(f => fs.readFileSync(f, 'utf8')).join('\n;\n');
  const fakeModule = { exports: {} };
  const fakeStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const factory = new Function('module', 'localStorage', 'window', 'document', 'indexedDB',
    code + `
    ;return {
      seed: async (sqlDb) => {
        db = sqlDb;
        saveDBToIndexedDB = async () => {};   // no IndexedDB in Node
        createAllTables();
        applySchemaMigrations();
        await seedData();
        return db;
      }
    };`);

  const api = factory(fakeModule, fakeStorage, undefined, undefined, undefined);
  const d = new SQL.Database();

  let seedError = null;
  try { await api.seed(d); } catch (e) { seedError = e; }
  assert(!seedError, 'full demo seed completes on a brand-new DB' + (seedError ? ' -> ' + seedError.message : ''));
  if (seedError) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

  const count = (q) => d.exec(q)[0].values[0][0];
  // The seed must produce a usable hospital, not a technically-nonempty shell.
  assert(count('SELECT COUNT(*) FROM users') >= 10, 'seed creates the demo staff accounts');
  assert(count('SELECT COUNT(*) FROM patients') >= 8, 'seed creates the demo patients');
  assert(count("SELECT COUNT(*) FROM admissions WHERE status='active'") >= 5, 'seed leaves active admissions for the worklists');
  assert(count('SELECT COUNT(*) FROM prescriptions') >= 20, 'seed creates the historical prescriptions (trigger regression)');
  assert(count('SELECT COUNT(*) FROM lab_orders') >= 30, 'seed creates the historical lab orders (trigger regression)');
  assert(count("SELECT COUNT(*) FROM admissions WHERE status='discharged'") >= 1, 'seed still discharges the historical admissions');
  // The discharge-protection triggers must STILL work after the seed (negative
  // control: a green run means the seed respects them, not that they vanished).
  let trigMsg = 'no error thrown';
  try {
    // Use a real doctor id so the doctor-role trigger doesn't mask the one under test.
    d.run(`INSERT INTO prescriptions (admission_id, doctor_id, drug_id, drug_name, dose, route, frequency, start_date, status, prescribed_at)
      SELECT a.admission_id, (SELECT user_id FROM users WHERE role='doctor' LIMIT 1), 1, 'X', '1', 'oral', 'od', '2026-01-01', 'active', '2026-01-01T00:00:00Z'
      FROM admissions a WHERE a.status='discharged' LIMIT 1`);
  } catch (e) { trigMsg = e.message; }
  assert(/discharged/.test(trigMsg), 'discharge-protection trigger still blocks new rx on discharged admissions (got: ' + trigMsg + ')');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL- harness error: ' + e.message); process.exit(1); });
